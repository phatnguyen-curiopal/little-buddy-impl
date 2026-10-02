import { useEffect, useRef, useState } from 'react';

export function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Animates a number from its previous value to the new one. The first real
// value is shown as is: counting up only means something when the number
// changes (a purchase, an answer), not when the page opens.
export function useCountUp(value, duration = 800) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value === null || value === undefined) return undefined;
    const start = from.current;
    if (start === null || start === undefined || reducedMotion() || start === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return shown;
}

// Where the pointer is relative to an element, as -1..1 on each axis. Used
// to make Buddy's eyes follow the visitor.
export function usePointerLook(ref) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let raf = 0;
    let last = null;
    const onMove = (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ref.current;
        if (!el || !last) return;
        const r = el.getBoundingClientRect();
        const dx = (last.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
        const dy = (last.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
        setLook({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  return look;
}

// Moves CSS custom properties with the pointer inside an element, for
// parallax glows and card tilt. Pure CSS does the rest.
export function usePointerVars(ref, { tilt = false } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return undefined;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
      if (tilt) el.classList.add('tilting');
    };
    const onLeave = () => {
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
      el.classList.remove('tilting');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, tilt]);
}

import { useEffect, useRef, useState } from 'react';
import { DOZE_MS, PET_LINGER_MS, nextIdleAct, petFeeling } from './catplay.js';

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

// Miu with nothing to do: every few seconds a small move of its own (an ear
// flick, a head tilt, a tail swish, a hop, a stretch; lib/catplay.js picks
// them, styles/miu.css draws them), and after a long quiet spell a doze.
// Both stop the moment `active` turns false, which is how a word or a touch
// wakes it.
export function useIdleActs(active, { random = Math.random } = {}) {
  const [act, setAct] = useState(null);
  const [drowsy, setDrowsy] = useState(false);
  const last = useRef(null);
  useEffect(() => {
    if (!active || reducedMotion()) return undefined;
    let stopped = false;
    let timer;
    const schedule = () => {
      const next = nextIdleAct(random, last.current);
      timer = setTimeout(() => {
        if (stopped) return;
        last.current = next.act;
        setAct(next.act);
        timer = setTimeout(() => {
          if (stopped) return;
          setAct(null);
          schedule();
        }, next.durationMs);
      }, next.afterMs);
    };
    schedule();
    const doze = setTimeout(() => {
      if (!stopped) setDrowsy(true);
    }, DOZE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(doze);
      setAct(null);
      setDrowsy(false);
    };
  }, [active, random]);
  return { act, drowsy };
}

// Petting Miu with the pointer or a finger: a press is a pat, a stroke
// across the fur is a cuddle. Returns the feeling while the hand is on it
// and for a moment after it lifts, or null.
export function usePetting(ref) {
  const [feeling, setFeeling] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let down = false;
    let travelled = 0;
    let lastX = 0;
    let lastY = 0;
    let linger;
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      down = true;
      travelled = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      clearTimeout(linger);
      setFeeling(petFeeling(0));
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // not every target can capture; the stroke just ends at its edge
      }
    };
    const onMove = (e) => {
      if (!down) return;
      travelled += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      setFeeling(petFeeling(travelled));
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      clearTimeout(linger);
      linger = setTimeout(() => setFeeling(null), PET_LINGER_MS);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      clearTimeout(linger);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);
  return feeling;
}

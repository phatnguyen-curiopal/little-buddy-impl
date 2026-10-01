import { reducedMotion } from '../lib/motion.js';

// A short celebratory burst for a finished purchase or a newly added toy.
// Hand-rolled on a throwaway canvas: a library for this would outweigh it.
const COLORS = ['#F97316', '#2F6BFF', '#8FB2FF', '#FDBA74', '#9DBBFF'];

export function burst({ x = window.innerWidth / 2, y = window.innerHeight / 3, count = 110 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 200 });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.35,
    };
  });

  const t0 = performance.now();
  const LIFE = 1600;
  const frame = (now) => {
    const k = (now - t0) / LIFE;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

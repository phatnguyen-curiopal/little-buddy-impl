// Writes src/styles/buddy-shapes.css: Buddy's eye and mouth shapes as CSS
// custom properties holding polygon()s with the same point count, so
// clip-path can morph any expression into any other. Run it after changing
// a shape: node scripts/buddy_shapes.js
import { writeFileSync } from 'node:fs';

const N = 60;
const TAU = Math.PI * 2;

function dense(fn, steps = 400, closed = true) {
  const pts = [];
  const n = closed ? steps : steps + 1;
  for (let i = 0; i < n; i++) pts.push(fn(i / steps));
  return pts;
}

function strokeOutline(center, w) {
  // center: dense open polyline. Offset both sides, round caps.
  const n = center.length;
  const normals = center.map((p, i) => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const left = center.map((p, i) => [p[0] + normals[i][0] * w, p[1] + normals[i][1] * w]);
  const right = center.map((p, i) => [p[0] - normals[i][0] * w, p[1] - normals[i][1] * w]);
  const cap = (p, nrm, from) => {
    const out = [];
    const base = Math.atan2(nrm[1], nrm[0]);
    for (let k = 1; k < 24; k++) {
      const a = base + from * Math.PI * (k / 24);
      out.push([p[0] + Math.cos(a) * w, p[1] + Math.sin(a) * w]);
    }
    return out;
  };
  const endCap = cap(center[n - 1], normals[n - 1], -1);
  const startCap = cap(center[0], [-normals[0][0], -normals[0][1]], -1);
  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function resample(pts) {
  if (area(pts) < 0) pts = [...pts].reverse(); // clockwise on screen
  // Start at the top-most point nearest the middle, so shapes line up.
  let best = 0, bestScore = Infinity;
  pts.forEach((p, i) => {
    const s = p[1] + Math.abs(p[0] - 50) * 0.35;
    if (s < bestScore) { bestScore = s; best = i; }
  });
  pts = [...pts.slice(best), ...pts.slice(0, best)];
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(l);
    total += l;
  }
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < N; k++) {
    const target = (total * k) / N;
    while (acc + segs[i] < target) { acc += segs[i]; i++; }
    const t = segs[i] ? (target - acc) / segs[i] : 0;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function css(name, pts, yScale = 1) {
  const body = pts.map(([x, y]) => `${x.toFixed(1)}% ${(y * yScale).toFixed(1)}%`).join(',');
  return `  --bd-${name}: polygon(${body});`;
}

function roundRect(x0, y0, x1, y1, r) {
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let k = 0; k <= 20; k++) {
      const a = a0 + (Math.PI / 2) * (k / 20);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return pts;
}

const circle = (cx, cy, r) => dense((t) => [cx + Math.cos(t * TAU) * r, cy + Math.sin(t * TAU) * r]);
const superellipse = (cx, cy, a, b, n = 4) => dense((t) => {
  const th = t * TAU, c = Math.cos(th), s = Math.sin(th);
  return [cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)];
});

function star(cx, cy, ro, ri) {
  const corners = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    corners.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = corners[i], b = corners[(i + 1) % 10];
    for (let k = 0; k < 20; k++) pts.push([a[0] + (b[0] - a[0]) * (k / 20), a[1] + (b[1] - a[1]) * (k / 20)]);
  }
  return pts;
}

function fit(pts, x0, y0, x1, y1) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return pts.map(([x, y]) => [x0 + ((x - minX) / (maxX - minX)) * (x1 - x0), y0 + ((y - minY) / (maxY - minY)) * (y1 - y0)]);
}

const heartRaw = dense((t) => {
  const a = t * TAU;
  return [16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))];
});

// Rounded chevron: two straight legs joined by a small arc.
function chevron(dir) {
  const pts = [];
  const tip = dir > 0 ? [66, 50] : [34, 50];
  const top = dir > 0 ? [32, 24] : [68, 24];
  const bot = dir > 0 ? [32, 76] : [68, 76];
  for (let k = 0; k <= 60; k++) { const t = k / 60; pts.push([top[0] + (tip[0] - top[0]) * t * 0.92, top[1] + (tip[1] - top[1]) * t * 0.92]); }
  const c0 = pts[pts.length - 1];
  const c2 = [tip[0] + (bot[0] - tip[0]) * 0.08, tip[1] + (bot[1] - tip[1]) * 0.08];
  for (let k = 1; k < 20; k++) {
    const t = k / 20;
    const x = (1 - t) ** 2 * c0[0] + 2 * (1 - t) * t * tip[0] + t ** 2 * c2[0];
    const y = (1 - t) ** 2 * c0[1] + 2 * (1 - t) * t * tip[1] + t ** 2 * c2[1];
    pts.push([x, y]);
  }
  for (let k = 0; k <= 60; k++) { const t = 0.08 + 0.92 * (k / 60); pts.push([tip[0] + (bot[0] - tip[0]) * t, tip[1] + (bot[1] - tip[1]) * t]); }
  return strokeOutline(pts, 8);
}

function sad(side) {
  // A pill whose top is cut by a slanted lid, lower on the outer side.
  const pill = roundRect(31, 16, 69, 86, 19);
  const [xa, ya, xb, yb] = side < 0 ? [26, 52, 74, 30] : [26, 30, 74, 52];
  const lid = (x) => ya + ((x - xa) / (xb - xa)) * (yb - ya);
  return pill.map(([x, y]) => [x, Math.max(y, lid(x))]);
}

const arc = (cx, cy, rx, ry, w, down = false) =>
  strokeOutline(dense((t) => [cx - rx * Math.cos(t * Math.PI), cy + (down ? 1 : -1) * ry * Math.sin(t * Math.PI)], 200, false), w);

function dShape(cx, top, rx, ry) {
  const pts = [];
  for (let k = 0; k <= 60; k++) pts.push([cx - rx + (2 * rx * k) / 60, top]);
  for (let k = 1; k < 120; k++) {
    const a = (Math.PI * k) / 120;
    pts.push([cx + rx * Math.cos(a), top + ry * Math.sin(a)]);
  }
  return pts;
}

const eyes = {
  pill: roundRect(32, 12, 68, 88, 18),
  pillTall: roundRect(29, 4, 71, 96, 21),
  pillLow: roundRect(32, 34, 68, 88, 18),
  round: circle(50, 50, 26),
  roundBig: circle(50, 50, 34),
  roundSmall: circle(50, 54, 14),
  sq: superellipse(50, 50, 27, 30),
  sqTall: superellipse(50, 50, 25, 38),
  arcUp: arc(50, 66, 30, 30, 8.5),
  arcDown: arc(50, 46, 28, 16, 6, true),
  chevR: chevron(1),
  chevL: chevron(-1),
  star: star(50, 53, 38, 16),
  heart: fit(heartRaw, 14, 18, 86, 86),
  sadL: sad(-1),
  sadR: sad(1),
  dash: strokeOutline(dense((t) => [26 + 48 * t, 52], 100, false), 7),
};

// Mouths are drawn in a 100 x 40 box and written as percentages of it.
const mouths = {
  mSmile: arc(50, 14, 22, 13, 4.2, true),
  mGrin: dShape(50, 9, 24, 24),
  mLaugh: dShape(50, 5, 29, 31),
  mO: circle(50, 21, 9),
  mFlat: strokeOutline(dense((t) => [40 + 20 * t, 21], 100, false), 3.8),
  mFrown: arc(50, 30, 17, 13, 4.2),
  mWavy: strokeOutline(dense((t) => [30 + 40 * t, 21 - 5 * Math.sin(3 * Math.PI * t)], 200, false), 3.4),
  mTiny: arc(50, 18, 8, 6, 3.4, true),
  mSmirk: strokeOutline(dense((t) => {
    const a = [34, 21], c = [52, 31], b = [69, 13];
    return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1]];
  }, 200, false), 4.2),
};

const lines = [
  '/* Generated by scripts/buddy_shapes.js; edit the script, not this file.',
  '   Eyes are drawn in a square box, mouths in a 100 x 40 one. */',
  ':root {',
];
for (const [k, v] of Object.entries(eyes)) lines.push(css(k, resample(v)));
for (const [k, v] of Object.entries(mouths)) lines.push(css(k, resample(v), 2.5));
lines.push('}', '');
const out = new URL('../src/styles/buddy-shapes.css', import.meta.url);
writeFileSync(out, lines.join('\n').replace(/\.0%/g, '%'));
console.log(`wrote ${Object.keys(eyes).length + Object.keys(mouths).length} shapes`);

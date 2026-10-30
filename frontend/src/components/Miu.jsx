import { useId } from 'react';
import { BROWS, MOUTH_FILLS, MOUTH_LINES, miuPose } from '../lib/miu.js';

// Miu, the talking kitten: Buddy's default look. One SVG whose parts (eyes,
// brows, mouth, ears, paws, extras) are set by the feeling's pose in
// lib/miu.js; the moves between feelings, the breathing, the tail and the
// blinks are CSS (styles/miu.css), so they stop under reduced motion.
//
// look: { x, y } in -1..1 to follow the pointer. phase 'listening' makes the
// tummy button glow with the microphone level (--level on an ancestor).
// crop 'head' draws only the head, for small avatars.
const VIEW = { body: '0 0 400 440', head: '52 20 296 262' };

export default function Miu({ emotion, look = null, phase = 'idle', crop = 'body', dim = false, label, className = '' }) {
  const p = miuPose(emotion);
  // Gradients need ids unique on the page, and several kittens can share one.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fur = `miu-fur-${uid}`;
  const cream = `miu-cream-${uid}`;
  const iris = `miu-iris-${uid}`;
  const btn = `miu-btn-${uid}`;

  const gaze = look && p.followsPointer ? { x: look.x * 9, y: look.y * 7 } : { x: 0, y: 0 };
  const lx = p.lx + gaze.x;
  const ly = p.ly + gaze.y;
  const on = (yes) => (yes ? 1 : 0);
  const fill = p.fill ? MOUTH_FILLS[p.fill] : null;
  const [browL, browR] = BROWS[p.brow];
  const rx = p.wide ? 36 : 33;
  const ry = p.wide ? 44 : 38;

  const eye = (cx, open) => (
    <g className="miu-eye" style={{ opacity: on(open), transformOrigin: `${cx}px 168px` }}>
      <ellipse cx={cx} cy="168" rx={rx} ry={ry} fill="#FFFFFF" />
      <g className="miu-iris" style={{ transform: `translate(${lx}px, ${ly}px)` }}>
        <circle cx={cx} cy="168" r="24" fill={`url(#${iris})`} />
        <circle className="miu-pupil" cx={cx} cy="168" r={p.pupil} fill="#0B1220" />
        <circle cx={cx + 8} cy="159" r="7" fill="#FFFFFF" />
        <circle cx={cx - 7} cy="176" r="3.5" fill="#FFFFFF" />
      </g>
    </g>
  );

  return (
    <svg
      viewBox={VIEW[crop] ?? VIEW.body}
      className={['miu', `miu-e-${p.emotion}`, `miu-p-${phase}`, dim && 'miu-dim', className].filter(Boolean).join(' ')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={fur} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#C9DAFF" />
          <stop offset="0.55" stopColor="#8FB2FF" />
          <stop offset="1" stopColor="#6A90EE" />
        </radialGradient>
        <radialGradient id={cream} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E1E9F7" />
        </radialGradient>
        <radialGradient id={iris} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#9DBBFF" />
          <stop offset="0.6" stopColor="#2F6BFF" />
          <stop offset="1" stopColor="#1A56C4" />
        </radialGradient>
        <radialGradient id={btn} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#9DBBFF" />
          <stop offset="1" stopColor="#2F6BFF" />
        </radialGradient>
      </defs>

      {crop === 'body' && <ellipse className="miu-shadow" cx="200" cy="420" rx="124" ry="14" fill="#0B1220" opacity="0.12" />}

      <g className="miu-breath">
        {crop === 'body' && (<>
          <g className="miu-tail">
            <path d="M262 382 C 340 394 382 332 352 272" fill="none" stroke="#7FA4F5" strokeWidth="28" strokeLinecap="round" />
            <circle cx="352" cy="272" r="15" fill={`url(#${cream})`} />
          </g>
          <path d="M200 245 C 270 245 300 300 300 350 C 300 395 262 412 200 412 C 138 412 100 395 100 350 C 100 300 130 245 200 245 Z" fill={`url(#${fur})`} />
          <ellipse cx="200" cy="356" rx="64" ry="50" fill={`url(#${cream})`} />
          <circle className="miu-glow" cx="200" cy="354" r="28" fill="#9DBBFF" />
          <circle cx="200" cy="354" r="19" fill={`url(#${btn})`} />
          <ellipse cx="194" cy="346" rx="7" ry="4" fill="#FFFFFF" opacity="0.8" />
          <ellipse cx="160" cy="404" rx="36" ry="19" fill={`url(#${fur})`} />
          <ellipse cx="240" cy="404" rx="36" ry="19" fill={`url(#${fur})`} />
          <ellipse cx="160" cy="408" rx="13" ry="7" fill="#F8E1DE" />
          <ellipse cx="240" cy="408" rx="13" ry="7" fill="#F8E1DE" />
        </>)}

        <g className="miu-ear miu-ear-l" style={{ transform: `rotate(${p.ear[0]}deg)` }}>
          <path d="M92 142 C 80 96 82 56 96 30 C 126 44 152 70 166 92 Z" fill={`url(#${fur})`} />
          <path d="M106 124 C 100 94 102 68 110 52 C 128 64 142 78 150 96 Z" fill="#F8E1DE" />
        </g>
        <g className="miu-ear miu-ear-r" style={{ transform: `rotate(${p.ear[1]}deg)` }}>
          <path d="M308 142 C 320 96 318 56 304 30 C 274 44 248 70 234 92 Z" fill={`url(#${fur})`} />
          <path d="M294 124 C 300 94 298 68 290 52 C 272 64 258 78 250 96 Z" fill="#F8E1DE" />
        </g>

        <path d="M200 78 C 285 78 335 125 335 180 C 335 205 325 222 312 232 L 322 244 L 300 242 C 275 258 240 266 200 266 C 160 266 125 258 100 242 L 78 244 L 88 232 C 75 222 65 205 65 180 C 65 125 115 78 200 78 Z" fill={`url(#${fur})`} />
        <g fill="#5B8CFF" opacity="0.75">
          <path d="M192 80 C 193 94 196 100 200 104 C 204 100 207 94 208 80 Z" />
          <path d="M168 84 C 170 96 174 101 180 103 C 180 94 178 88 176 83 Z" />
          <path d="M232 84 C 230 96 226 101 220 103 C 220 94 222 88 224 83 Z" />
        </g>

        <path d="M200 205 C 225 196 256 205 258 228 C 260 248 236 258 200 252 C 164 258 140 248 142 228 C 144 205 175 196 200 205 Z" fill={`url(#${cream})`} />
        <g className="miu-fade" style={{ opacity: p.blush }}>
          <ellipse cx="112" cy="214" rx="18" ry="10" fill="#F7A8B4" />
          <ellipse cx="288" cy="214" rx="18" ry="10" fill="#F7A8B4" />
        </g>

        <g className="miu-eyes">
          {eye(152, p.eyes === 'open' || p.eyes === 'wink')}
          {eye(248, p.eyes === 'open')}
        </g>
        <g fill="none" stroke="#0B1220" strokeWidth="8" strokeLinecap="round">
          <path className="miu-fade" style={{ opacity: on(p.eyes === 'happy') }} d="M124 176 Q 152 140 180 176" />
          <path className="miu-fade" style={{ opacity: on(p.eyes === 'happy' || p.eyes === 'wink') }} d="M220 176 Q 248 140 276 176" />
          <path className="miu-fade" style={{ opacity: on(p.eyes === 'closed') }} d="M124 166 Q 152 190 180 166" />
          <path className="miu-fade" style={{ opacity: on(p.eyes === 'closed') }} d="M220 166 Q 248 190 276 166" />
        </g>
        <g className="miu-fade miu-hearts" fill="#EF5B6E" style={{ opacity: on(p.eyes === 'heart') }}>
          <path d="M152 196 C 112 170 118 136 139 138 C 146 139 150 144 152 150 C 154 144 158 139 165 138 C 186 136 192 170 152 196 Z" />
          <path d="M248 196 C 208 170 214 136 235 138 C 242 139 246 144 248 150 C 250 144 254 139 261 138 C 282 136 288 170 248 196 Z" />
        </g>
        <path className="miu-fade" style={{ opacity: on(p.extra === 'tear') }} d="M126 206 C 118 220 120 230 127 230 C 134 230 136 220 126 206 Z" fill="#E3ECFF" stroke="#2F6BFF" strokeWidth="2" />

        <g fill="none" stroke="#1A56C4" strokeWidth="7" strokeLinecap="round" opacity="0.85">
          <path d={browL} />
          <path d={browR} />
        </g>

        <path d="M146 226 L 104 220 M146 236 L 102 241 M254 226 L 296 220 M254 236 L 298 241" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <path d="M200 219 L 200 226" fill="none" stroke="#0B1220" strokeWidth="4.5" strokeLinecap="round" />
        {p.line && <path d={MOUTH_LINES[p.line]} fill="none" stroke="#0B1220" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />}
        {fill && <path d={fill[0]} fill="#0B1220" />}
        {fill && fill[1] > 0 && <ellipse cx="200" cy={fill[1]} rx="12" ry="6" fill="#F7A8B4" />}
        <path d="M188 207 C 188 201 212 201 212 207 C 212 213 205 219 200 219 C 195 219 188 213 188 207 Z" fill="#0B1220" />
        <ellipse cx="195" cy="206" rx="4" ry="2" fill="#FFFFFF" opacity="0.7" />

        {crop === 'body' && (<>
          <path d="M140 266 Q 200 290 260 266 L 258 279 Q 200 303 142 279 Z" fill="#2F6BFF" />
          <circle cx="200" cy="296" r="11" fill="#E3A548" stroke="#8F5A0F" strokeWidth="2" />
          <g className="miu-arm miu-arm-l" style={{ transform: `rotate(${p.arm[0]}deg)` }}>
            <ellipse cx="132" cy="318" rx="21" ry="34" fill={`url(#${fur})`} stroke="#6A90EE" strokeWidth="2" />
            <circle cx="132" cy="347" r="15" fill={`url(#${cream})`} />
          </g>
          <g className="miu-arm miu-arm-r" style={{ transform: `rotate(${p.arm[1]}deg)` }}>
            <ellipse cx="268" cy="318" rx="21" ry="34" fill={`url(#${fur})`} stroke="#6A90EE" strokeWidth="2" />
            <circle cx="268" cy="347" r="15" fill={`url(#${cream})`} />
          </g>
        </>)}
      </g>

      {crop === 'body' && (
        <g className="miu-extras">
          <g className="miu-fade miu-sparkle" fill="#E3A548" style={{ opacity: on(p.extra === 'sparkle') }}>
            <path d="M58 70 Q 58 88 76 88 Q 58 88 58 106 Q 58 88 40 88 Q 58 88 58 70 Z" />
            <path d="M346 48 Q 346 62 360 62 Q 346 62 346 76 Q 346 62 332 62 Q 346 62 346 48 Z" />
            <path d="M362 170 Q 362 180 372 180 Q 362 180 362 190 Q 362 180 352 180 Q 362 180 362 170 Z" />
          </g>
          <path className="miu-fade miu-float" style={{ opacity: on(p.extra === 'love') }} d="M336 96 C 316 82 318 64 330 65 C 334 65 336 68 336 71 C 337 68 339 65 343 65 C 355 64 357 82 336 96 Z" fill="#EF5B6E" />
          <text className="miu-fade miu-float" style={{ opacity: on(p.extra === 'question') }} x="316" y="100" fontSize="58" fontWeight="800" fill="#2F6BFF">?</text>
          <g className="miu-fade miu-zzz" fill="#1A56C4" fontWeight="800" style={{ opacity: on(p.extra === 'zzz') }}>
            <text x="300" y="98" fontSize="30">z</text>
            <text x="322" y="72" fontSize="40">z</text>
            <text x="348" y="40" fontSize="50">Z</text>
          </g>
          <g className="miu-fade miu-dots" fill="#FFFFFF" stroke="#C9D6EA" strokeWidth="3" style={{ opacity: on(p.extra === 'dots') }}>
            <circle cx="304" cy="96" r="7" />
            <circle cx="324" cy="76" r="10" />
            <circle cx="350" cy="52" r="14" />
          </g>
          <path className="miu-fade miu-waves" style={{ opacity: on(p.extra === 'waves') }} d="M54 104 Q 40 124 54 144 M36 94 Q 16 124 36 154" fill="none" stroke="#2F6BFF" strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

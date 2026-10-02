import { LOOKING, normalizeEmotion } from '../lib/emotions.js';

// Buddy's LCD face. Drawn in currentColor so the screen around it decides
// the glow; each emotion has its own idle animation in styles/motion.css.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round' };

function heart(cx, cy, s) {
  return `M${cx} ${cy + s * 0.9} C${cx - s * 1.7} ${cy - s * 0.1} ${cx - s * 0.9} ${cy - s * 1.4} ${cx} ${cy - s * 0.45} C${cx + s * 0.9} ${cy - s * 1.4} ${cx + s * 1.7} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;
}

function star(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const roundEyes = (r, t, cls = '') => (
  <g transform={t}>
    <circle className={cls} cx="40" cy="33" r={r} fill="currentColor" />
    <circle className={cls} cx="80" cy="33" r={r} fill="currentColor" />
  </g>
);

function parts(e, t) {
  switch (e) {
    case 'listening':
      return (<>
        <path className="f-arcs" d="M9 28 Q2 40 9 52 M111 28 Q118 40 111 52" {...S} strokeWidth="4" />
        {roundEyes(8.5, t)}
        <circle cx="60" cy="58" r="5.5" {...S} strokeWidth="5" />
      </>);
    case 'thinking':
      return (<>
        <g className="f-drift"><circle cx="46" cy="25" r="6.5" fill="currentColor" /><circle cx="84" cy="25" r="6.5" fill="currentColor" /></g>
        <path d="M48 57 H66" {...S} />
        <g className="f-dots"><circle cx="80" cy="57" r="3" fill="currentColor" /><circle cx="91" cy="57" r="3" fill="currentColor" /><circle cx="102" cy="57" r="3" fill="currentColor" /></g>
      </>);
    case 'happy':
      return (<>
        <path d="M29 38 Q40 23 51 38 M69 38 Q80 23 91 38" {...S} />
        <path d="M40 50 Q60 70 80 50" {...S} />
      </>);
    case 'excited':
      return (<>
        <g transform={t}>
          <polygon className="f-star" points={star(40, 32, 12, 5)} fill="currentColor" />
          <polygon className="f-star f-star--late" points={star(80, 32, 12, 5)} fill="currentColor" />
        </g>
        <path d="M42 50 H78 Q78 70 60 70 Q42 70 42 50 Z" fill="currentColor" />
      </>);
    case 'laughing':
      return (<>
        <path d="M29 26 L43 33 L29 40 M91 26 L77 33 L91 40" {...S} />
        <path d="M38 48 H82 Q82 72 60 72 Q38 72 38 48 Z" fill="currentColor" />
      </>);
    case 'love':
      return (<>
        <g transform={t}>
          <path className="f-heart" d={heart(40, 32, 9)} fill="currentColor" />
          <path className="f-heart f-heart--late" d={heart(80, 32, 9)} fill="currentColor" />
        </g>
        <path d="M44 54 Q60 67 76 54" {...S} />
      </>);
    case 'curious':
      return (<>
        <g transform={t}><circle cx="40" cy="34" r="6" fill="currentColor" /><circle cx="80" cy="32" r="9" fill="currentColor" /></g>
        <path d="M70 17 Q80 12 90 16" {...S} strokeWidth="4" />
        <path d="M46 57 Q53 51 60 57 T74 57" {...S} />
      </>);
    case 'surprised':
      return (<>
        <path d="M29 17 Q40 10 51 17 M69 17 Q80 10 91 17" {...S} strokeWidth="4" />
        {roundEyes(8.5, t)}
        <circle cx="60" cy="60" r="7.5" {...S} strokeWidth="5" />
      </>);
    case 'wink':
      return (<>
        <circle cx="40" cy="33" r="6.5" fill="currentColor" />
        <path d="M69 35 Q80 26 91 35" {...S} />
        <path d="M44 52 Q60 65 76 52" {...S} />
        <polygon className="f-star" points={star(104, 16, 6, 2.5)} fill="currentColor" />
      </>);
    case 'shy':
      return (<>
        <circle cx="42" cy="38" r="5" fill="currentColor" /><circle cx="78" cy="38" r="5" fill="currentColor" />
        <ellipse className="f-blush" cx="24" cy="51" rx="9" ry="4.5" fill="currentColor" />
        <ellipse className="f-blush" cx="96" cy="51" rx="9" ry="4.5" fill="currentColor" />
        <path d="M52 56 Q60 61 68 56" {...S} />
      </>);
    case 'confused':
      return (<>
        <circle cx="40" cy="34" r="6.5" fill="currentColor" />
        <path d="M71 32 H89" {...S} />
        <path d="M42 59 L50 53 L58 59 L66 53 L74 59" {...S} strokeWidth="5" />
        <text className="f-q" x="97" y="26" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="22" fill="currentColor">?</text>
      </>);
    case 'sad':
      return (<>
        <path d="M29 27 L48 20 M72 20 L91 27" {...S} strokeWidth="4" />
        <circle cx="40" cy="37" r="6" fill="currentColor" /><circle cx="80" cy="37" r="6" fill="currentColor" />
        <path d="M46 63 Q60 52 74 63" {...S} />
        <path className="f-tear" d="M88 46 Q92 53 88 56 Q84 53 88 46 Z" fill="currentColor" />
      </>);
    case 'sleepy':
      return (<>
        <path d="M29 35 Q40 42 51 35 M69 35 Q80 42 91 35" {...S} />
        <path d="M54 57 Q60 60 66 57" {...S} />
        <text className="f-z" x="96" y="22" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="15" fill="currentColor">z</text>
        <text className="f-z f-z--late" x="104" y="12" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="11" fill="currentColor">z</text>
      </>);
    default:
      return (<>
        {roundEyes(6.5, t, 'f-eye')}
        <path d="M46 53 Q60 64 74 53" {...S} />
      </>);
  }
}

export default function Face({ emotion, look, label, className = '' }) {
  const e = normalizeEmotion(emotion);
  const move = LOOKING.has(e) && look ? `translate(${(look.x * 5).toFixed(2)} ${(look.y * 3.5).toFixed(2)})` : undefined;
  return (
    <svg
      viewBox="0 0 120 80"
      className={`face face--${e} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {parts(e, move)}
    </svg>
  );
}

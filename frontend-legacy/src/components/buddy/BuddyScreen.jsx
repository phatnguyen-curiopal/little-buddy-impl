import BuddyFace from './BuddyFace.jsx';
import { normalizeEmotion } from '../../lib/emotions.js';
import { DEFAULT_DESIGN, normalizeDesign } from '../../lib/designs.js';

// A face on its own, for the small screens around the site (cards, chips,
// logos). It fills the box it is put in; the box keeps its own size and
// background. Without a toy to follow it is drawn in the default design.
export default function BuddyScreen({ design = DEFAULT_DESIGN, emotion, label, dim = false, look = null }) {
  const d = normalizeDesign(design);
  const e = normalizeEmotion(emotion);
  const face = <BuddyFace design={d} emotion={e} look={look} />;
  return (
    <span
      className={['bd-screen', `bd--${d}`, `bd-e-${e}`, dim && 'bd-dim'].filter(Boolean).join(' ')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {d === 'glim' ? <span className="bd-g-blob">{face}</span> : face}
    </span>
  );
}

import Miu from './Miu.jsx';
import ToyShell from './ToyShell.jsx';
import BuddyScreen from './buddy/BuddyScreen.jsx';
import { normalizeDesign } from '../lib/designs.js';
import { normalizeEmotion } from '../lib/emotions.js';

// Every place that draws a Buddy goes through these two, so a toy shows up
// in its own design everywhere: Miu as the kitten, the robots as before.
//
// BuddyFigure is the whole toy (rooms, the wizard, the Talk screen). phase is
// idle | listening | heard | thinking | answer | rest, the ToyShell phases;
// Miu only uses listening (its tummy button glows with the mic level).
export function BuddyFigure({ design, emotion, look = null, phase = 'idle', dim = false, label, className = '' }) {
  const d = normalizeDesign(design);
  const e = normalizeEmotion(emotion);
  return (
    <span className={['figure', `figure--${d}`, className].filter(Boolean).join(' ')} role={label ? 'img' : undefined} aria-label={label}>
      {d === 'miu'
        ? <Miu emotion={e} look={look} phase={phase} dim={dim} />
        : <ToyShell design={d} phase={phase} emotion={e} look={look} dim={dim} />}
    </span>
  );
}

// A small face for lists and chips: Miu's head, or a robot's screen.
export function BuddyAvatar({ design, emotion, dim = false, size = 'md', className = '' }) {
  const d = normalizeDesign(design);
  const e = normalizeEmotion(emotion);
  return (
    <span className={['buddy-avatar', `buddy-avatar--${size}`, d === 'miu' ? 'buddy-avatar--miu' : 'buddy-avatar--screen', dim && 'is-dim', className].filter(Boolean).join(' ')} aria-hidden="true">
      {d === 'miu' ? <Miu crop="head" emotion={e} dim={dim} /> : <BuddyScreen design={d} emotion={e} dim={dim} />}
    </span>
  );
}

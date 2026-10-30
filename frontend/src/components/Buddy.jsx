import Miu from './Miu.jsx';
import { normalizeEmotion } from '../lib/emotions.js';

// Every place that draws Buddy goes through these two, and Buddy is always
// Miu, the talking kitten: backend-v2's characters (Bo, Pip, Luna) differ in
// name, personality and voice, not in how the site draws them.
//
// BuddyFigure is the whole toy (rooms, the wizard, the Talk screen). Of the
// phases (idle | listening | heard | thinking | answer | rest) Miu only uses
// listening: its tummy button glows with the mic level.
export function BuddyFigure({ emotion, look = null, phase = 'idle', dim = false, label, className = '' }) {
  return (
    <span className={['figure', className].filter(Boolean).join(' ')} role={label ? 'img' : undefined} aria-label={label}>
      <Miu emotion={normalizeEmotion(emotion)} look={look} phase={phase} dim={dim} />
    </span>
  );
}

// A small face for lists and chips: Miu's head.
export function BuddyAvatar({ emotion, dim = false, size = 'md', className = '' }) {
  return (
    <span className={['buddy-avatar', `buddy-avatar--${size}`, 'buddy-avatar--miu', dim && 'is-dim', className].filter(Boolean).join(' ')} aria-hidden="true">
      <Miu crop="head" emotion={normalizeEmotion(emotion)} dim={dim} />
    </span>
  );
}

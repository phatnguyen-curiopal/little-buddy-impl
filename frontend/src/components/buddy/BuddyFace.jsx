import { LOOKING } from '../../lib/emotions.js';

// Buddy's face: eyes, mouth and the extras an expression can bring (tears,
// z's, a question mark). Which shapes show is all CSS (styles/buddy.css),
// driven by the design and expression classes on the toy or screen around
// it, so changing the expression morphs the face instead of swapping it.
// Volt acts with its eyes and hands alone, so it has no mouth.
export default function BuddyFace({ design, emotion, look = null }) {
  const gaze = look && LOOKING.has(emotion) ? { '--bd-gx': look.x.toFixed(2), '--bd-gy': look.y.toFixed(2) } : undefined;
  return (
    <span className="bd-fw" aria-hidden="true">
      <span className="bd-face">
        <span className="bd-fi">
          <span className="bd-eyes" style={gaze}>
            <span className="bd-eye bd-l" />
            <span className="bd-eye bd-r" />
          </span>
          {design !== 'volt' && <span className="bd-mouth" />}
          <span className="bd-x bd-x-arcs bd-l" />
          <span className="bd-x bd-x-arcs bd-r" />
          <span className="bd-x bd-x-dots"><span /><span /><span /></span>
          <span className="bd-x bd-x-tear" />
          <span className="bd-x bd-x-q">?</span>
          <span className="bd-x bd-x-z">z</span>
          <span className="bd-x bd-x-z bd-z2">z</span>
          <span className="bd-x bd-x-spark" />
          <span className="bd-x bd-x-blush bd-l" />
          <span className="bd-x bd-x-blush bd-r" />
        </span>
      </span>
    </span>
  );
}

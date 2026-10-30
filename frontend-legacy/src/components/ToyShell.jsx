import BuddyFace from './buddy/BuddyFace.jsx';
import { normalizeEmotion } from '../lib/emotions.js';
import { normalizeDesign } from '../lib/designs.js';

// Buddy's body in one of the three designs (lib/designs.js): Orbit, Volt or
// Glim. Pure presentation, shared by the scripted hero toy on the marketing
// page, the real web toy on the Talk screen and the design picker, so all of
// them look and move alike. phase is idle | listening | heard | thinking |
// answer | rest; live marks the web toy (its mic ring follows --level on
// ringRef), dim an asleep or offline toy. Without onTap the button is only
// drawn, for previews that sit inside another control (so the whole toy is
// spans, which a button may contain).
export default function ToyShell({
  design, phase, emotion, look = null, onTap, pressed = false, label, busy = false,
  live = false, dim = false, className = '', ringRef,
}) {
  const d = normalizeDesign(design);
  const e = normalizeEmotion(emotion);
  const face = <BuddyFace design={d} emotion={e} look={look} />;
  const press = onTap
    ? <button type="button" className={`bd-press bd-${d[0]}-press`} onClick={onTap} aria-pressed={pressed} aria-label={label} aria-disabled={busy || undefined} />
    : <span className={`bd-press bd-${d[0]}-press`} />;
  const mic = <span className={`bd-mic bd-${d[0]}-mic`} aria-hidden="true" ref={ringRef} />;
  const Body = BODIES[d];
  return (
    <span
      className={['bd', `bd--${d}`, `bd-e-${e}`, `bd-p-${phase}`, live && 'bd-live', dim && 'bd-dim', className].filter(Boolean).join(' ')}
      aria-hidden={onTap ? undefined : true}
    >
      <Body face={face} mic={mic} press={press} />
    </span>
  );
}

const ELLIPSE = 'M4 30 A96 25 0 1 1 196 30 A96 25 0 1 1 4 30';

// The ring is drawn twice, back half behind the head and front half over it.
function Ring({ side }) {
  return (
    <svg className={`bd-o-ring bd-${side}`} viewBox="0 0 200 60" aria-hidden="true">
      <path className="bd-haze" pathLength="100" d={ELLIPSE} />
      <path className="bd-trk" pathLength="100" d={ELLIPSE} />
      <path className="bd-cmt" pathLength="100" d={ELLIPSE} />
      <path className="bd-cmt bd-b" pathLength="100" d={ELLIPSE} />
    </svg>
  );
}

function OrbitBody({ face, mic, press }) {
  return (<>
    <span className="bd-o-floor" />
    <span className="bd-o-fly">
      <span className="bd-o-thrust" />
      <Ring side="back" />
      <span className="bd-o-ant" />
      <span className="bd-o-beacon" />
      <span className="bd-o-pod bd-l" />
      <span className="bd-o-pod bd-r" />
      <span className="bd-o-body" />
      <span className="bd-o-head"><span className="bd-o-visor">{face}</span></span>
      <Ring side="front" />
      {mic}
      {press}
    </span>
  </>);
}

function VoltBody({ face, mic, press }) {
  return (<>
    <span className="bd-v-floor" />
    <span className="bd-v-fly">
      <span className="bd-v-fin bd-l" />
      <span className="bd-v-fin bd-r" />
      <span className="bd-v-cap bd-l" />
      <span className="bd-v-cap bd-r" />
      <span className="bd-v-torso" />
      <span className="bd-v-head"><span className="bd-v-visor">{face}</span></span>
      {mic}
      {press}
      <span className="bd-v-hand bd-l" />
      <span className="bd-v-hand bd-r" />
    </span>
  </>);
}

function GlimBody({ face, mic, press }) {
  return (<>
    <span className="bd-g-floor" />
    <span className="bd-g-inner" />
    <span className="bd-g-ps"><span className="bd-g-p" /><span className="bd-g-p" /><span className="bd-g-p" /><span className="bd-g-p" /><span className="bd-g-p" /><span className="bd-g-p" /></span>
    <span className="bd-g-blob"><span className="bd-g-lure" />{face}</span>
    <span className="bd-g-base" />
    <span className="bd-g-rim" />
    <span className="bd-g-dome" />
    {mic}
    {press}
  </>);
}

const BODIES = { orbit: OrbitBody, volt: VoltBody, glim: GlimBody };

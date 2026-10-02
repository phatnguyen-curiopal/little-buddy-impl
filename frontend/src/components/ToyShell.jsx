import Face from './Face.jsx';

// Buddy's body: ears, shell, LCD face, the mic ring and the big button.
// Pure presentation, shared by the scripted hero toy on the marketing page
// and the real web toy on the Talk screen, so both look and move alike.
// phase picks the CSS state (idle ears and ring invite, listening ears up);
// the caller decides what a tap means.
export default function ToyShell({ phase, emotion, look = null, onTap, pressed = false, label, busy = false, className = '', ringRef }) {
  return (
    <div className={['toy', `toy--${phase}`, className].filter(Boolean).join(' ')}>
      <div className="ear l" /><div className="ear r" />
      <div className="toy-body" />
      <div className="screen"><Face emotion={emotion} look={look} /></div>
      <div className="mic-ring" aria-hidden="true" ref={ringRef} />
      <button
        type="button"
        className="press"
        onClick={onTap}
        aria-pressed={pressed}
        aria-label={label}
        aria-disabled={busy || undefined}
      />
    </div>
  );
}

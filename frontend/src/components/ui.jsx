import { useState } from 'react';

export function StatusPill({ status }) {
  return <span className={`pill pill-${status || 'none'}`}>{status || 'none'}</span>;
}

export function JsonView({ value }) {
  if (value === undefined) return <span className="muted">none</span>;
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Button({ children, kind = 'default', busy = false, ...rest }) {
  return (
    <button type="button" className={`btn btn-${kind}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? '...' : children}
    </button>
  );
}

// Two clicks within three seconds; used for unpair and revoke, the two
// actions a tester would regret doing by accident.
export function ConfirmButton({ children, onConfirm, kind = 'danger', ...rest }) {
  const [armed, setArmed] = useState(false);
  const click = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    onConfirm();
  };
  return (
    <Button kind={armed ? 'danger-armed' : kind} onClick={click} {...rest}>
      {armed ? 'click again to confirm' : children}
    </Button>
  );
}

export function ErrorLine({ error }) {
  if (!error) return null;
  return (
    <div className="error-line">
      <b>{error.status ? `${error.status} ${error.code}` : error.code}</b> {error.message}
      {error.retryAfter ? ` (retry after ${error.retryAfter} s)` : ''}
      {error.body?.error?.details ? ` ${error.body.error.details.map((d) => `${d.field}: ${d.message}`).join('; ')}` : ''}
    </div>
  );
}

export function short(id) {
  return id ? `${id.slice(0, 8)}…` : '';
}

export function ago(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

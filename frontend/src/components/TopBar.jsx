import { useEffect, useState } from 'react';
import { health } from '../api.js';
import { useSession } from '../session.js';

export default function TopBar() {
  const s = useSession();
  const [h, setH] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const probe = () => health().then((v) => alive && setH(v)).catch((err) => alive && setH({ ok: false, pg: '?', redis: '?', error: err.code }));
    probe();
    const id = setInterval(probe, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const left = s.parent ? Math.max(0, Math.round((s.parent.expiresAt - Date.now()) / 1000)) : null;

  return (
    <header className="topbar" data-tick={tick}>
      <div className="brand">Little Buddy <span className="muted">dev console</span></div>
      <div className="health">
        <span className={`pill ${h ? (h.ok ? 'pill-active' : 'pill-revoked') : 'pill-none'}`}>backend {h ? (h.ok ? 'up' : 'degraded') : '...'}</span>
        <span className={`pill ${h?.pg === 'ok' ? 'pill-active' : 'pill-disabled'}`}>pg {h?.pg ?? '...'}</span>
        <span className={`pill ${h?.redis === 'ok' ? 'pill-active' : 'pill-disabled'}`}>redis {h?.redis ?? '...'}</span>
      </div>
      <div className="who">
        {s.parent ? (
          <>
            <b>{s.parent.parent?.email}</b> <span className="muted">{s.parent.family?.name}</span>{' '}
            <span className={`pill ${left > 60 ? 'pill-active' : 'pill-disabled'}`}>token {left > 0 ? `${left} s` : 'expired'}</span>
          </>
        ) : (
          <span className="muted">no parent session</span>
        )}
      </div>
    </header>
  );
}

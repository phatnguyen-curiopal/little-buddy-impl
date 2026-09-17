import { useState } from 'react';
import { useLog, clear } from '../log.js';
import { JsonView, Button } from './ui.jsx';

function statusClass(status) {
  if (typeof status !== 'number') return 'st-ws';
  if (status === 0) return 'st-err';
  if (status < 300) return 'st-ok';
  if (status < 500) return 'st-warn';
  return 'st-err';
}

export default function LogPanel() {
  const entries = useLog();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);
  const shown = filter ? entries.filter((e) => `${e.method} ${e.path} ${e.status} ${e.res?.error?.code ?? ''}`.toLowerCase().includes(filter.toLowerCase())) : entries;

  return (
    <aside className="log">
      <div className="log-head">
        <b>Requests</b>
        <input id="log-filter" placeholder="filter: path, status, code" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button onClick={clear}>Clear</Button>
      </div>
      <div className="log-rows">
        {shown.length === 0 && <div className="muted log-empty">Nothing yet. Every request the console makes shows up here.</div>}
        {shown.map((e) => (
          <div key={e.id} className="log-row">
            <button type="button" className="log-line" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className="log-time">{new Date(e.at).toLocaleTimeString()}</span>
              <span className="log-method">{e.method}</span>
              <span className="log-path">{e.path}</span>
              <span className={`log-status ${statusClass(e.status)}`}>{e.status}</span>
              <span className="log-ms">{e.ms} ms</span>
              {e.res?.error?.code && <span className="log-code">{e.res.error.code}</span>}
            </button>
            {open === e.id && (
              <div className="log-detail">
                <div><span className="muted">request</span><JsonView value={e.req} /></div>
                <div><span className="muted">response{e.retryAfter ? ` (Retry-After ${e.retryAfter})` : ''}</span><JsonView value={e.res} /></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

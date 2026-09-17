import { useCallback, useState } from 'react';
import { adminApi } from '../api.js';
import * as session from '../session.js';
import { useSession } from '../session.js';
import { StatusPill, Field, Button, ConfirmButton, ErrorLine, short, ago } from './ui.jsx';

const STATUSES = ['', 'provisioned', 'active', 'disabled', 'revoked'];
const REVOKE_REASONS = ['lost', 'stolen', 'compromised', 'retired'];

export default function AdminLane({ onSimulate }) {
  const s = useSession();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');
  const [checked, setChecked] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filters, setFilters] = useState({ status: '', batch_id: '', family_id: '', limit: 50, offset: 0 });
  const [devices, setDevices] = useState(null);
  const [reasons, setReasons] = useState({});
  const [revokeReason, setRevokeReason] = useState({});
  const [reissued, setReissued] = useState(null);

  const run = useCallback(async (name, fn) => {
    setBusy(name);
    setErr(null);
    try {
      return await fn();
    } catch (e) {
      setErr(e);
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const loadBatches = useCallback(async () => {
    const out = await adminApi.batches();
    setBatches(out.batches);
    setChecked(true);
  }, []);

  const search = useCallback(async (f = filters) => {
    const out = await adminApi.devices(f);
    setDevices(out.devices);
  }, [filters]);

  const refreshAll = async () => {
    await loadBatches();
    if (devices !== null) await search();
  };

  return (
    <div className="lane">
      <ErrorLine error={err} />

      <section className="card">
        <h3>Operator token</h3>
        <div className="row wrap">
          <Field label="ADMIN_TOKEN"><input id="admin-token" className="wide" value={s.admin} onChange={(e) => session.set({ admin: e.target.value })} /></Field>
          <Button onClick={() => run('check', () => loadBatches().catch((e) => { setChecked(false); throw e; }))} busy={busy === 'check'}>Check (GET /admin/batches)</Button>
          {checked === true && <span className="pill pill-active">accepted</span>}
          {checked === false && <span className="pill pill-revoked">rejected</span>}
        </div>
        <p className="muted">The dev default is <code>dev-admin-token-change-me</code>; production refuses it at boot.</p>
      </section>

      <section className="card">
        <div className="row between"><h3>Batches</h3><Button onClick={() => run('batches', refreshAll)} busy={busy === 'batches'}>Refresh</Button></div>
        {batches.length === 0 ? <p className="muted">Load with the Check button. <code>npm run seed</code> creates batch <code>DEMO</code>; <code>npm run provision</code> creates more.</p> : (
          <div className="tbl">
            <table>
              <thead><tr><th>label</th><th>hw</th><th>size</th><th>devices</th><th>active</th><th>created</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td><code>{b.label}</code></td><td>{b.hardware_rev}</td><td>{b.size}</td><td>{b.device_count}</td><td>{b.active_count}</td><td>{ago(b.created_at)}</td>
                    <td><Button onClick={() => { const f = { ...filters, batch_id: b.id, offset: 0 }; setFilters(f); run('search', () => search(f)); }}>devices</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Devices</h3>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); const f = { ...filters, offset: 0 }; setFilters(f); run('search', () => search(f)); }}>
          <Field label="status">
            <select id="f-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {STATUSES.map((v) => <option key={v} value={v}>{v || 'any'}</option>)}
            </select>
          </Field>
          <Field label="batch">
            <select id="f-batch" value={filters.batch_id} onChange={(e) => setFilters({ ...filters, batch_id: e.target.value })}>
              <option value="">any</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <Field label="family_id"><input id="f-family" className="wide" value={filters.family_id} onChange={(e) => setFilters({ ...filters, family_id: e.target.value })} /></Field>
          {s.parent?.family?.id && <Button onClick={() => setFilters({ ...filters, family_id: s.parent.family.id })}>use parent's family</Button>}
          <Field label="limit"><input id="f-limit" type="number" className="narrow" value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: e.target.value })} /></Field>
          <Button kind="primary" type="submit" busy={busy === 'search'}>Search</Button>
          <Button disabled={filters.offset === 0} onClick={() => { const f = { ...filters, offset: Math.max(0, filters.offset - Number(filters.limit)) }; setFilters(f); run('search', () => search(f)); }}>Prev</Button>
          <Button disabled={!devices || devices.length < Number(filters.limit)} onClick={() => { const f = { ...filters, offset: filters.offset + Number(filters.limit) }; setFilters(f); run('search', () => search(f)); }}>Next</Button>
        </form>

        {reissued && (
          <div className="reissued">
            <b>New claim code for {reissued.serial}:</b> <code className="big">{reissued.code}</code>
            <Button onClick={() => navigator.clipboard?.writeText(reissued.code)}>Copy</Button>
            <Button kind="primary" onClick={() => { session.set({ lastClaimCode: reissued.code }); }}>Send to Parent claim field</Button>
            <Button onClick={() => setReissued(null)}>Dismiss</Button>
            <div className="muted">Shown once; it is not in the request log.</div>
          </div>
        )}

        {devices !== null && (devices.length === 0 ? <p className="muted">No devices match.</p> : (
          <div className="tbl">
            <table>
              <thead><tr><th>serial</th><th>status</th><th>reason</th><th>by</th><th>family</th><th>child</th><th>firmware</th><th>last seen</th><th>actions</th></tr></thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td><code title={d.id}>{d.serial}</code></td>
                    <td><StatusPill status={d.status} /></td>
                    <td>{d.status_reason ?? ''}</td>
                    <td>{d.disabled_by ?? ''}</td>
                    <td><code title={d.family_id ?? ''}>{short(d.family_id)}</code></td>
                    <td><code title={d.child_id ?? ''}>{short(d.child_id)}</code></td>
                    <td>{d.firmware_version ?? ''}</td>
                    <td>{ago(d.last_seen_at)}</td>
                    <td className="actions">
                      {d.status === 'active' && (
                        <>
                          <input placeholder="reason (required)" value={reasons[d.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })} className="narrow" />
                          <Button onClick={() => run('disable', async () => { await adminApi.disable(d.id, reasons[d.id] ?? ''); await search(); })}>Force disable</Button>
                        </>
                      )}
                      {d.status === 'disabled' && <Button onClick={() => run('enable', async () => { await adminApi.enable(d.id); await search(); })}>Enable</Button>}
                      {d.status === 'provisioned' && <Button onClick={() => run('reissue', async () => { const out = await adminApi.reissue(d.id); setReissued({ serial: d.serial, code: out.claim_code }); })}>Reissue claim code</Button>}
                      {d.status !== 'revoked' && (
                        <>
                          <select value={revokeReason[d.id] ?? 'lost'} onChange={(e) => setRevokeReason({ ...revokeReason, [d.id]: e.target.value })}>
                            {REVOKE_REASONS.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                          <ConfirmButton onConfirm={() => run('revoke', async () => { await adminApi.revoke(d.id, revokeReason[d.id] ?? 'lost'); await search(); })}>Revoke</ConfirmButton>
                        </>
                      )}
                      <Button onClick={() => onSimulate(d.id)}>Simulate</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}

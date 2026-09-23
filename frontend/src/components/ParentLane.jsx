import { useCallback, useEffect, useState } from 'react';
import { parentApi } from '../api.js';
import * as session from '../session.js';
import { useSession } from '../session.js';
import { StatusPill, Field, Button, ConfirmButton, ErrorLine, ago } from './ui.jsx';

export default function ParentLane({ onSimulate }) {
  const s = useSession();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');
  const [login, setLogin] = useState({ email: 'demo@littlebuddy.local', password: 'demo-password' });
  const [reg, setReg] = useState({ email: '', password: '', family_name: '', display_name: '' });
  const [reuseOld, setReuseOld] = useState(false);
  const [children, setChildren] = useState([]);
  const [newChild, setNewChild] = useState({ name: '', birth_year: 2020 });
  const [devices, setDevices] = useState([]);
  const [claim, setClaim] = useState({ claim_code: '', child_id: '' });
  const [reasons, setReasons] = useState({});
  const [me, setMe] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [turns, setTurns] = useState([]);

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

  const reload = useCallback(async () => {
    if (!session.get().parent) return;
    const [c, d, w, t] = await Promise.all([parentApi.listChildren(), parentApi.listDevices(), parentApi.wallet(), parentApi.turns()]);
    setChildren(c.children);
    setDevices(d.devices);
    setWallet(w);
    setTurns(t.turns);
  }, []);

  useEffect(() => {
    if (s.parent) reload().catch((e) => setErr(e));
    else {
      setChildren([]);
      setDevices([]);
      setMe(null);
      setWallet(null);
      setTurns([]);
    }
  }, [s.parent?.parent?.id, reload]);

  const childName = (id) => children.find((c) => c.id === id)?.name ?? (id ? id.slice(0, 8) : 'none');

  return (
    <div className="lane">
      <ErrorLine error={err} />

      <section className="card">
        <h3>Session</h3>
        {!s.parent ? (
          <div className="row wrap">
            <form className="row" onSubmit={(e) => { e.preventDefault(); run('login', () => parentApi.login(login)); }}>
              <Field label="email"><input id="login-email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></Field>
              <Field label="password"><input id="login-password" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></Field>
              <Button kind="primary" type="submit" busy={busy === 'login'}>Login</Button>
            </form>
            <form className="row" onSubmit={(e) => { e.preventDefault(); run('register', () => parentApi.register(reg)); }}>
              <Field label="email"><input id="reg-email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></Field>
              <Field label="password"><input id="reg-password" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} /></Field>
              <Field label="family"><input id="reg-family" value={reg.family_name} onChange={(e) => setReg({ ...reg, family_name: e.target.value })} /></Field>
              <Field label="display name"><input id="reg-display" value={reg.display_name} onChange={(e) => setReg({ ...reg, display_name: e.target.value })} /></Field>
              <Button type="submit" busy={busy === 'register'}>Register</Button>
            </form>
            <p className="muted">After <code>npm run seed</code> the demo login above works as-is. Register is limited to 5 per hour per IP.</p>
          </div>
        ) : (
          <div className="row wrap">
            <Button onClick={() => run('me', async () => setMe(await parentApi.me()))} busy={busy === 'me'}>GET /api/me</Button>
            <Button onClick={() => run('refresh', () => parentApi.refresh({ reuseOld }))} busy={busy === 'refresh'}>Refresh tokens</Button>
            <label className="check"><input id="reuse-old" type="checkbox" checked={reuseOld} onChange={(e) => setReuseOld(e.target.checked)} disabled={!s.prevRefreshToken} /> reuse the previous refresh token (expect <code>refresh_token_reused</code>)</label>
            <Button onClick={() => run('logout', () => parentApi.logout())} busy={busy === 'logout'}>Logout</Button>
            {me && <pre className="json">{JSON.stringify(me, null, 2)}</pre>}
          </div>
        )}
      </section>

      {s.parent && (
        <>
          <section className="card">
            <div className="row between">
              <h3>Wallet</h3>
              <Button onClick={() => run('reload', reload)} busy={busy === 'reload'}>Refresh</Button>
            </div>
            <div className="row wrap">
              <span className="balance">{wallet ? wallet.balance : '...'}</span>
              <span className="muted">credits, shared by every toy in the family. One answered turn costs one.</span>
            </div>
            {wallet && wallet.ledger.length > 0 && (
              <div className="tbl">
                <table>
                  <thead><tr><th>when</th><th>kind</th><th>delta</th><th>reason</th><th>by</th></tr></thead>
                  <tbody>
                    {wallet.ledger.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td>{ago(row.created_at)}</td><td>{row.kind}</td><td className={row.delta < 0 ? 'neg' : 'pos'}>{row.delta > 0 ? `+${row.delta}` : row.delta}</td><td>{row.reason ?? ''}</td><td>{row.actor_kind}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h3>Recent turns</h3>
            {turns.length === 0 ? <p className="muted">No button presses yet. Open the stream in the Toy lane and press the button.</p> : (
              <div className="tbl">
                <table>
                  <thead><tr><th>when</th><th>toy</th><th>status</th><th>reason</th><th>emotion</th><th>frames</th><th>answer</th></tr></thead>
                  <tbody>
                    {turns.slice(0, 10).map((t) => (
                      <tr key={t.id}>
                        <td>{ago(t.started_at)}</td>
                        <td><code>{t.device_serial ?? ''}</code></td>
                        <td><StatusPill status={t.status} /></td>
                        <td>{t.denied_reason ?? ''}</td>
                        <td>{t.emotion ?? ''}</td>
                        <td>{t.audio_frames}</td>
                        <td className="answer-cell">{t.answer_text ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted">The toy never sees <code>reason</code>; this is the only place it is shown.</p>
          </section>

          <section className="card">
            <h3>Children</h3>
            <div className="row wrap">
              {children.length === 0 && <span className="muted">none yet</span>}
              {children.map((c) => <span key={c.id} className="chip">{c.name} <span className="muted">{c.birth_year}</span></span>)}
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); run('child', async () => { await parentApi.addChild({ name: newChild.name, birth_year: Number(newChild.birth_year) }); setNewChild({ name: '', birth_year: 2020 }); await reload(); }); }}>
              <Field label="name"><input id="child-name" value={newChild.name} onChange={(e) => setNewChild({ ...newChild, name: e.target.value })} /></Field>
              <Field label="birth year"><input id="child-year" type="number" value={newChild.birth_year} onChange={(e) => setNewChild({ ...newChild, birth_year: e.target.value })} /></Field>
              <Button type="submit" busy={busy === 'child'}>Add child</Button>
            </form>
          </section>

          <section className="card">
            <h3>Claim a toy</h3>
            <form className="row wrap" onSubmit={(e) => { e.preventDefault(); run('claim', async () => { await parentApi.claim({ claim_code: claim.claim_code, ...(claim.child_id ? { child_id: claim.child_id } : {}) }); setClaim({ claim_code: '', child_id: '' }); session.set({ lastClaimCode: null }); await reload(); }); }}>
              <Field label="claim code (as printed)"><input id="claim-code" placeholder="XXXX-XXXX" value={claim.claim_code} onChange={(e) => setClaim({ ...claim, claim_code: e.target.value })} /></Field>
              <Field label="child">
                <select id="claim-child" value={claim.child_id} onChange={(e) => setClaim({ ...claim, child_id: e.target.value })}>
                  <option value="">none</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Button kind="primary" type="submit" busy={busy === 'claim'}>Claim</Button>
              {s.lastClaimCode && <Button onClick={() => setClaim({ ...claim, claim_code: s.lastClaimCode })}>Use reissued code</Button>}
            </form>
            <p className="muted">Paste the <code>claim code</code> line of the unclaimed toy from <code>npm run seed</code>. After an unpair, the same printed code works again. Limit: 10 attempts per hour.</p>
          </section>

          <section className="card">
            <div className="row between">
              <h3>Devices</h3>
              <Button onClick={() => run('reload', reload)} busy={busy === 'reload'}>Refresh list</Button>
            </div>
            {devices.length === 0 && <p className="muted">No devices in this family.</p>}
            {devices.length > 0 && (
              <div className="tbl">
                <table>
                  <thead><tr><th>serial</th><th>status</th><th>reason</th><th>by</th><th>child</th><th>firmware</th><th>last seen</th><th>actions</th></tr></thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id}>
                        <td><code title={d.id}>{d.serial}</code></td>
                        <td><StatusPill status={d.status} /></td>
                        <td>{d.status_reason ?? ''}</td>
                        <td>{d.disabled_by ?? ''}</td>
                        <td>
                          <select value={d.child_id ?? ''} onChange={(e) => run('child-' + d.id, async () => { await parentApi.setChild(d.id, e.target.value || null); await reload(); })}>
                            <option value="">none</option>
                            {children.map((c) => <option key={c.id} value={c.id}>{childName(c.id)}</option>)}
                          </select>
                        </td>
                        <td>{d.firmware_version ?? ''}</td>
                        <td>{ago(d.last_seen_at)}</td>
                        <td className="actions">
                          {d.status === 'active' && (
                            <>
                              <input placeholder="reason" value={reasons[d.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })} className="narrow" />
                              <Button onClick={() => run('disable', async () => { await parentApi.disable(d.id, reasons[d.id]); await reload(); })}>Pause</Button>
                            </>
                          )}
                          {d.status === 'disabled' && <Button onClick={() => run('enable', async () => { await parentApi.enable(d.id); await reload(); })}>Resume</Button>}
                          <ConfirmButton onConfirm={() => run('unpair', async () => { await parentApi.unpair(d.id); await reload(); })}>Unpair</ConfirmButton>
                          <Button onClick={() => onSimulate(d.id)}>Simulate</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

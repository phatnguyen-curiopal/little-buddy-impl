import { useEffect, useState } from 'react';
import { useSession, set as setSession } from '../session.js';
import { useToy } from '../useToy.js';
import { StatusPill, Field, Button } from './ui.jsx';

export default function ToyLane({ toy }) {
  const s = useSession();
  const { state, face } = toy;
  const [, setTick] = useState(0);
  const [skew, setSkew] = useState(0);

  // A 250 ms display tick for the countdown; the hook itself has no timer
  // for rendering.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  const running = state.phase !== 'idle' && state.phase !== 'halted';
  const nextIn = state.nextBeatAt ? Math.max(0, ((state.nextBeatAt - Date.now()) / 1000)).toFixed(1) : null;
  const creds = s.toy;
  const credsOk = creds.deviceId.trim().length > 0 && /^[0-9a-fA-F]{64}$/.test(creds.secretHex.trim());

  return (
    <div className="lane">
      <section className="card">
        <h3>Credentials</h3>
        <div className="row wrap">
          <Field label="device_id"><input id="toy-id" className="wide" value={creds.deviceId} onChange={(e) => setSession({ toy: { ...creds, deviceId: e.target.value } })} disabled={running} /></Field>
          <Field label="secret_hex (64 hex chars)"><input id="toy-secret" className="wide" value={creds.secretHex} onChange={(e) => setSession({ toy: { ...creds, secretHex: e.target.value } })} disabled={running} /></Field>
        </div>
        <p className="muted">From the <code>npm run seed</code> output or a factory manifest. The server never returns a secret, so it has to be pasted. Kept in this tab's sessionStorage only.</p>
      </section>

      <section className="card toy-screen">
        <div className="face">{face}</div>
        <div className="row wrap">
          <StatusPill status={state.status} />
          <span className="chip">phase <b>{state.phase}</b></span>
          {state.intervalS && <span className="chip">interval <b>{state.intervalS} s</b></span>}
          {nextIn !== null && running && <span className="chip">next beat in <b>{nextIn} s</b></span>}
          <span className="chip">clock offset <b>{state.offsetS >= 0 ? '+' : ''}{state.offsetS} s</b></span>
          {state.lastCode && <span className="chip warn">last code <b>{state.lastCode}</b></span>}
          {state.haltReason && <span className="chip warn">halted: {state.haltReason}</span>}
          {state.stream.cutBadge && <span className="chip danger">stream cut by server</span>}
        </div>
      </section>

      <section className="card">
        <h3>Heartbeat</h3>
        <div className="row wrap">
          {!running ? (
            <Button kind="primary" onClick={toy.start} disabled={!credsOk}>Start</Button>
          ) : (
            <Button onClick={toy.stop}>Stop</Button>
          )}
          <Button onClick={toy.beatNow} disabled={!credsOk}>Beat now</Button>
          <Button onClick={() => toy.syncClock().catch(() => {})}>Sync clock (/v1/time)</Button>
          <Field label="deliberate skew (s)">
            <input id="toy-skew" type="number" className="narrow" value={skew} onChange={(e) => { setSkew(e.target.value); toy.setSkew(e.target.value); }} />
          </Field>
        </div>
        <p className="muted">Start syncs the clock, then heartbeats on the interval the server returns (5 s unclaimed, 60 s claimed). Set skew to 600 and Beat now to see <code>auth_ts_skew</code> followed by the automatic corrected retry.</p>
      </section>

      <section className="card">
        <h3>Stream (/v1/stream)</h3>
        <div className="row wrap">
          {state.stream.state === 'closed' ? (
            <Button kind="primary" onClick={toy.openStream} disabled={!credsOk}>Open stream</Button>
          ) : (
            <Button onClick={() => toy.closeStream()}>Close</Button>
          )}
          <Button onClick={toy.ping} disabled={state.stream.state !== 'open'}>Ping</Button>
          <Button onClick={() => toy.burst(50)} disabled={state.stream.state !== 'open'}>Send 50 audio frames</Button>
          <span className="chip">socket <b>{state.stream.state}</b></span>
          <span className="chip">frames sent <b>{state.stream.framesSent}</b></span>
          {state.stream.lastPong && <span className="chip">last pong <b>{state.stream.lastPong}</b></span>}
          {state.stream.closeCode !== null && <span className={`chip ${state.stream.closeCode === 4003 ? 'danger' : ''}`}>closed <b>{state.stream.closeCode}</b> {state.stream.closeReason}</span>}
        </div>
        {state.stream.refusedHint && <p className="error-line">{state.stream.refusedHint}</p>}
        <p className="muted">Signed as <code>GET /v1/stream</code> with the values in the query string, the form a browser or a minimal embedded client can send. Pause the toy from the Parent or Admin lane while the socket is open to watch the kill switch close it with code 4003.</p>
      </section>

      <section className="card">
        <h3>The button (one turn = one credit)</h3>
        <div className="row wrap">
          {state.turn.phase === 'idle' ? (
            <Button kind="primary" onClick={toy.pressButton} disabled={state.stream.state !== 'open'}>Press button</Button>
          ) : (
            <>
              <Button kind="primary" onClick={toy.release} disabled={state.turn.phase !== 'listening'}>Child finished talking (turn_end)</Button>
              <Button onClick={() => toy.burst(25)} disabled={state.turn.phase !== 'listening'}>Send 25 frames</Button>
              <Button onClick={toy.cancelTurn} disabled={state.turn.phase !== 'listening'}>Cancel</Button>
            </>
          )}
          <span className="chip">turn <b>{state.turn.phase}</b></span>
          {state.turn.turnId && <span className="chip">id <b>{state.turn.turnId.slice(0, 8)}</b></span>}
          {state.turn.lastStatus && <span className={`chip ${state.turn.lastStatus === 'completed' ? '' : 'warn'}`}>last <b>{state.turn.lastStatus}</b></span>}
          {state.turn.lastError && <span className="chip danger">error {state.turn.lastError}</span>}
        </div>
        {state.turn.lastSay && (
          <div className="say">
            <span className="muted">the toy says</span>
            <div>"{state.turn.lastSay}"</div>
          </div>
        )}
        <p className="muted">Press asks the gate: claimed and active, and the family still has a credit. A refusal is only an emotion and a sentence; the reason shows up in the Parent lane's turns list. The real toy sends turn_end by itself when it hears the child stop talking (or on a second tap); this button stands in for that. The (mock) answer arrives first, then one credit is charged. Cancel, timeout and the kill switch charge nothing.</p>
      </section>
    </div>
  );
}

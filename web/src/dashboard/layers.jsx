import { useState } from 'react';
import Face from '../components/Face.jsx';
import { burst } from '../components/Confetti.js';
import { CloseButton, Icon, Layer, Pill, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { relativeTime, vnd, age } from '../lib/format.js';
import { useFamilyData } from './data.jsx';
import { toyLook, useToyName } from './parts.jsx';
import { ChildForm } from './screens.jsx';

// Same alphabet as backend/devices/claim_code.js: no I, L, O, U, 0 or 1.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const codeReady = (raw) => raw.length === 8 && [...raw].every((c) => ALPHABET.includes(c));
const formatCode = (raw) => (raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);

export function ToyDrawer({ id, onClose }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const nameOf = useToyName();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const device = d.devices.find((x) => x.id === id);
  if (!device) return null;
  const look = toyLook(device);

  const act = async (fn, okText, close = false) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await d.reload();
      toast(okText);
      if (close) onClose();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layer kind="drawer" onClose={onClose} labelledBy="toy-title">
      <div className="layer-head"><h2 id="toy-title">{nameOf(device, d.children)}</h2><CloseButton onClick={onClose} /></div>
      <div className={`hero-screen ${look.dim ? 'dim' : ''}`}><Face emotion={look.emotion} /></div>
      <div><Pill tone={look.tone}>{t(look.key)}</Pill></div>
      {device.status === 'active' && (<>
        <button type="button" className="btn ghost block" disabled={busy} onClick={() => act(() => api.pause(device.id), t('pausedToast'))}>{t('pause')}</button>
        <p className="muted small">{t('pauseExplain')}</p>
      </>)}
      {device.status === 'disabled' && device.disabled_by === 'parent' && (<>
        <button type="button" className="btn apricot block" disabled={busy} onClick={() => act(() => api.resume(device.id), t('wokeToast'))}>{t('wake')}</button>
        <p className="muted small">{t('pauseExplain')}</p>
      </>)}
      {device.status === 'disabled' && device.disabled_by === 'admin' && <div className="banner bad">{Icon.alert}<span>{t('supportExplain')}</span></div>}
      {error && <p className="msg bad">{error}</p>}
      <div className="rows">
        <div className="row">
          <label className="k" htmlFor="toy-child">{t('toyFor')}</label>
          <select id="toy-child" className="input input--auto" value={device.child_id ?? ''} disabled={busy}
            onChange={(e) => act(() => api.setChild(device.id, e.target.value || null), t('saved'))}>
            <option value="">{t('noChild')}</option>
            {d.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="row"><span className="k">{t('lastSeen')}</span><span className="v">{relativeTime(device.last_seen_at, t)}</span></div>
        <div className="row"><span className="k">{t('serial')}</span><span className="v mono">{device.serial}</span></div>
        <div className="row"><span className="k">{t('firmware')}</span><span className="v mono">{device.firmware_version ?? t('unknown')}</span></div>
      </div>
      {confirm ? (
        <div className="confirm">
          <p>{t('removeAsk')}</p>
          <div className="actions">
            <button type="button" className="btn danger-solid" disabled={busy} data-autofocus onClick={() => act(() => api.unpair(device.id), t('removed'), true)}>{t('removeYes')}</button>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>{t('cancel')}</button>
          </div>
        </div>
      ) : <button type="button" className="btn danger self-start" onClick={() => setConfirm(true)}>{t('remove')}</button>}
    </Layer>
  );
}

export function AddToyModal({ onClose }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const errText = useErrorText();
  const [step, setStep] = useState('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [child, setChild] = useState(d.children[0]?.id ?? null);
  const [adding, setAdding] = useState(d.children.length === 0);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(null);

  const bad = [...code].find((c) => !ALPHABET.includes(c));
  const onCode = (e) => {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    setError('');
  };

  const claim = async (childId) => {
    setBusy(true);
    setError('');
    try {
      const out = await api.claim({ claim_code: code, ...(childId ? { child_id: childId } : {}) });
      setDevice(out.device);
      setStep('done');
      await d.reload();
      burst();
    } catch (err) {
      // A wrong code is only discovered here; send the parent back to fix it.
      if (err.code === 'claim_code_invalid' || err.code === 'validation_error') setStep('code');
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const steps = ['code', 'child', 'done'];
  return (
    <Layer onClose={onClose} labelledBy="add-title" locked={busy}>
      <div className="layer-head"><h2 id="add-title">{t('addTitle')}</h2><CloseButton onClick={onClose} /></div>
      <div className="stepper" aria-hidden="true">{steps.map((s, i) => <span key={s} className={steps.indexOf(step) >= i ? 'on' : ''} />)}</div>

      {step === 'code' && (
        <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); if (codeReady(code)) setStep('child'); }}>
          <h3 className="step-title">{t('codeTitle')}</h3>
          <input className={`input code-input ${error ? 'shake' : ''}`} value={formatCode(code)} onChange={onCode} placeholder="XXXX-XXXX" maxLength={9}
            autoComplete="off" autoCapitalize="characters" spellCheck="false" aria-describedby="code-msg" data-autofocus aria-label={t('codeTitle')} />
          <p id="code-msg" className={`msg ${bad || error ? 'bad' : 'muted'}`}>{bad ? t('codeBad', { c: bad }) : error || t('codeHelp')}</p>
          <button type="submit" className="btn apricot lg block" disabled={!codeReady(code)}>{t('next')}</button>
        </form>
      )}

      {step === 'child' && (
        <div className="form">
          <div className="hero-screen"><Face emotion="curious" /></div>
          <div><h3 className="step-title">{t('childTitle')}</h3><p className="muted small">{t('childHelp')}</p></div>
          {d.children.length > 0 && (
            <div className="choices">
              {d.children.map((c, i) => (
                <button key={c.id} type="button" className="choice" aria-pressed={child === c.id} onClick={() => setChild(c.id)}>
                  <span className={`avatar ${i % 2 ? 'alt' : ''}`}>{c.name.slice(0, 1)}</span>
                  <span><b>{c.name}</b><br /><span className="feed-sub">{t('age', { n: age(c.birth_year) })}</span></span>
                </button>
              ))}
            </div>
          )}
          {adding
            ? <ChildForm onDone={async (c) => { await d.reload(); setChild(c.id); setAdding(false); }} />
            : <button type="button" className="link self-start" onClick={() => setAdding(true)}>+ {t('addChildInline')}</button>}
          {error && <p className="msg bad">{error}</p>}
          <button type="button" className="btn apricot lg block" disabled={busy || !child} onClick={() => claim(child)}>{busy ? t('checking') : t('addThisToy')}</button>
          <button type="button" className="btn ghost block" disabled={busy} onClick={() => claim(null)}>{t('later')}</button>
        </div>
      )}

      {step === 'done' && (
        <div className="center">
          <div className="hero-screen full"><Face emotion="excited" /></div>
          <h2>{t('readyT')}</h2>
          <p className="muted">{t('readyB')}</p>
          {device && <p className="mono muted">{device.serial}</p>}
          <button type="button" className="btn apricot lg block" data-autofocus onClick={onClose}>{t('done')}</button>
        </div>
      )}
    </Layer>
  );
}

export function PayModal({ pack: initial, onClose }) {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const errText = useErrorText();
  const [pack, setPack] = useState(initial ?? d.packs.find((p) => p.id === 'family') ?? d.packs[0]);
  const [decline, setDecline] = useState(false);
  const [phase, setPhase] = useState('confirm'); // confirm | processing | paid | declined
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);

  const pay = async () => {
    setPhase('processing');
    setError('');
    try {
      const { purchase } = await api.createPurchase(pack.id);
      const out = await api.demoPay(purchase.id, decline ? 'decline' : 'success');
      await d.reload();
      setBalance(out.balance);
      if (out.purchase.status === 'paid') {
        setPhase('paid');
        burst();
      } else setPhase('declined');
    } catch (err) {
      setError(errText(err));
      setPhase('confirm');
    }
  };

  if (!pack) return null;
  return (
    <Layer onClose={onClose} labelledBy="pay-title" locked={phase === 'processing'}>
      <div className="layer-head"><h2 id="pay-title">{t('payTitle')}</h2>{phase !== 'processing' && <CloseButton onClick={onClose} />}</div>
      {phase === 'confirm' && (
        <div className="form">
          {!initial && (
            <div className="choices choices--row">
              {d.packs.map((p) => <button key={p.id} type="button" className="choice" aria-pressed={pack.id === p.id} onClick={() => setPack(p)}><b>{t(`pack_${p.id}`)}</b><span className="feed-sub">{t('credits', { n: p.credits })}</span></button>)}
            </div>
          )}
          <div className="summary">
            <span className="muted">{t('pack')}</span><b>{t(`pack_${pack.id}`)}</b>
            <span className="muted">{t('add')}</span><b>+{t('credits', { n: pack.credits })}</b>
            <span className="muted">{t('total')}</span><span className="big">{vnd(pack.price_amount, lang)}</span>
          </div>
          <div className="banner mint">{Icon.alert}<span>{t('payNote')}</span></div>
          <label className="check" htmlFor="decline"><input id="decline" type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} /> {t('payDecline')}</label>
          {error && <p className="msg bad">{error}</p>}
          <button type="button" className="btn apricot lg block sheen" data-autofocus onClick={pay}>{t('pay', { price: vnd(pack.price_amount, lang) })}</button>
        </div>
      )}
      {phase === 'processing' && <div className="center pad"><div className="spinner" role="progressbar" aria-label={t('paying')} /><p>{t('paying')}</p></div>}
      {phase === 'paid' && (
        <div className="center">
          <div className="hero-screen full"><Face emotion="love" /></div>
          <h2>{t('paidT', { n: pack.credits })}</h2>
          <p className="muted">{t('paidB', { b: balance })}</p>
          <button type="button" className="btn apricot lg block" data-autofocus onClick={onClose}>{t('done')}</button>
        </div>
      )}
      {phase === 'declined' && (
        <div className="form">
          <div className="hero-screen"><Face emotion="sad" /></div>
          <div className="banner bad">{Icon.alert}<span><b>{t('declinedT')}</b><br />{t('declinedB')}</span></div>
          <button type="button" className="btn apricot lg block" data-autofocus onClick={() => { setDecline(false); setPhase('confirm'); }}>{t('tryAgain')}</button>
          <button type="button" className="btn ghost block" onClick={onClose}>{t('cancel')}</button>
        </div>
      )}
    </Layer>
  );
}

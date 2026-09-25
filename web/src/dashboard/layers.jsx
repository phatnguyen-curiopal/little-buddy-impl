import { useEffect, useRef, useState } from 'react';
import Face from '../components/Face.jsx';
import { burst } from '../components/Confetti.js';
import { CloseButton, Icon, Layer, Pill, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { relativeTime, vnd, age } from '../lib/format.js';
import { useFamilyData } from './data.jsx';
import { toyLook, useToyName } from './parts.jsx';
import { ChildForm } from './screens.jsx';
import { NameField, PersonalityPicker, PersonalityQuiz, ProfileEditor, ProfileSummary, RolePicker } from './profile.jsx';
import { DEFAULT_PROFILE, typeOf } from '../lib/personality.js';

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
  const [draft, setDraft] = useState(null); // non-null while editing the profile
  const [nameError, setNameError] = useState('');
  const device = d.devices.find((x) => x.id === id);
  if (!device) return null;
  const look = toyLook(device);
  const profile = device.profile ?? DEFAULT_PROFILE;

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

  const saveProfile = () => {
    if (!draft.name.trim()) {
      setNameError(t('needBuddyName'));
      return;
    }
    act(async () => {
      await api.updateProfile(device.id, { ...draft, name: draft.name.trim() });
      setDraft(null);
    }, t('profileSaved'));
  };

  if (draft) {
    return (
      <Layer kind="drawer" onClose={onClose} labelledBy="toy-title" locked={busy}>
        <div className="layer-head"><h2 id="toy-title">{t('profileTitle')}</h2><CloseButton onClick={onClose} /></div>
        <ProfileEditor value={draft} onChange={(p) => { setDraft(p); setNameError(''); }} nameError={nameError} />
        {error && <p className="msg bad">{error}</p>}
        <div className="actions">
          <button type="button" className="btn apricot" disabled={busy} onClick={saveProfile}>{busy ? t('saving') : t('saveProfile')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>{t('cancel')}</button>
        </div>
      </Layer>
    );
  }

  return (
    <Layer kind="drawer" onClose={onClose} labelledBy="toy-title">
      <div className="layer-head"><h2 id="toy-title">{nameOf(device, d.children)}</h2><CloseButton onClick={onClose} /></div>
      <div className={`hero-screen ${look.dim ? 'dim' : ''}`}><Face emotion={look.emotion} /></div>
      <div><Pill tone={look.tone}>{t(look.key)}</Pill></div>
      <div className="p-card">
        <ProfileSummary profile={profile} />
        {device.status !== 'revoked' && (
          <button type="button" className="btn ghost self-start" onClick={() => { setDraft(profile); setError(''); setNameError(''); }}>{t('editProfile')}</button>
        )}
      </div>
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

// Screens of the add-toy wizard and the stepper phase each one lights up.
const PHASES = ['code', 'child', 'name', 'role', 'personality', 'review'];
const PHASE_OF = { quiz: 'personality', pick: 'personality', done: 'review' };
const sameProfile = (a, b) => a.name === b.name && a.role === b.role && a.personality === b.personality;

// The toy is claimed as soon as the child is chosen, with the default profile,
// so a wrong code shows up before any profile work and closing the wizard
// later never loses the toy. The profile screens then save with one PATCH.
export function AddToyModal({ onClose }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const body = useRef(null);
  const [step, setStep] = useState('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [child, setChild] = useState(d.children[0]?.id ?? null);
  const [adding, setAdding] = useState(d.children.length === 0);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(null);
  const [draft, setDraft] = useState(DEFAULT_PROFILE);
  const [nameError, setNameError] = useState('');
  const [reviewed, setReviewed] = useState(false); // after the first review, "next" returns there
  const [leaving, setLeaving] = useState(false);

  // The Layer focuses once when it opens; each new screen needs it again.
  useEffect(() => {
    body.current?.querySelector('[data-autofocus]')?.focus();
  }, [step, leaving]);

  const go = (next) => {
    setError('');
    setStep(next);
  };
  const forward = (next) => go(reviewed ? 'review' : next);
  const set = (patch) => setDraft((p) => ({ ...p, ...patch }));

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
      // A retried claim returns the toy as it is, profile included.
      setDraft(out.device.profile ?? DEFAULT_PROFILE);
      go('name');
    } catch (err) {
      if (err.code === 'claim_code_invalid' || err.code === 'validation_error') setStep('code');
      setError(errText(err));
    } finally {
      setBusy(false);
      // Also after a failure: a lost response may still have claimed the toy.
      d.reload();
    }
  };

  const save = async (patch) => {
    await api.updateProfile(device.id, { ...patch, name: patch.name.trim() });
    await d.reload();
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      await save(draft);
      go('done');
      burst();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  // Once the toy is claimed, closing asks first: the toy stays either way,
  // the question is only whether the choices so far are kept.
  const requestClose = () => {
    if (busy) return;
    if (device && step !== 'done') setLeaving(true);
    else onClose();
  };

  const saveAndClose = async () => {
    const saved = device.profile ?? DEFAULT_PROFILE;
    if (!draft.name.trim() || sameProfile(draft, saved)) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await save(draft);
      toast(t('profileSaved'));
      onClose();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  const nameNext = () => {
    if (!draft.name.trim()) {
      setNameError(t('needBuddyName'));
      return;
    }
    forward('role');
  };

  const phase = PHASE_OF[step] ?? step;
  const type = typeOf(draft.personality);
  return (
    <Layer onClose={requestClose} labelledBy="add-title" locked={busy}>
      <div className="layer-head"><h2 id="add-title">{t('addTitle')}</h2><CloseButton onClick={requestClose} /></div>
      <div className="stepper" aria-hidden="true">{PHASES.map((s, i) => <span key={s} className={step === 'done' || PHASES.indexOf(phase) >= i ? 'on' : ''} />)}</div>

      <div ref={body}>
        {leaving ? (
          <div className="form">
            <div className="hero-screen"><Face emotion="curious" /></div>
            <div><h3 className="step-title">{t('leaveT')}</h3><p className="muted small">{t('leaveB')}</p></div>
            {error && <p className="msg bad">{error}</p>}
            <button type="button" className="btn apricot lg block" data-autofocus disabled={busy} onClick={() => { setLeaving(false); setError(''); }}>{t('keepGoing')}</button>
            <button type="button" className="btn ghost block" disabled={busy} onClick={saveAndClose}>{busy ? t('saving') : t('saveAndClose')}</button>
          </div>
        ) : (<>
          {step === 'code' && (
            <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); if (codeReady(code)) go('child'); }}>
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
                    <button key={c.id} type="button" className="choice" aria-pressed={child === c.id} onClick={() => setChild(c.id)} data-autofocus={child === c.id || undefined}>
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
              <button type="button" className="btn apricot lg block" disabled={busy || !child} onClick={() => claim(child)}>{busy ? t('checking') : t('next')}</button>
              <button type="button" className="btn ghost block" disabled={busy} onClick={() => claim(null)}>{t('later')}</button>
              <button type="button" className="link self-start" disabled={busy} onClick={() => go('code')}>{t('back')}</button>
            </div>
          )}

          {step === 'name' && (
            <div className="form">
              {!reviewed && <div className="banner mint">{Icon.check}<span>{t('addedB')}</span></div>}
              <div className="hero-screen"><Face emotion="excited" /></div>
              <h3 className="step-title">{t('nameStepT')}</h3>
              <NameField value={draft.name} onChange={(name) => { set({ name }); setNameError(''); }} error={nameError} autoFocus />
              <button type="button" className="btn apricot lg block" onClick={nameNext}>{t('next')}</button>
              {!reviewed && <button type="button" className="btn ghost block" onClick={requestClose}>{t('later')}</button>}
            </div>
          )}

          {step === 'role' && (
            <div className="form">
              <div><h3 className="step-title">{t('roleStepT')}</h3><p className="muted small">{t('roleStepB')}</p></div>
              <RolePicker value={draft.role} onChange={(role) => set({ role })} autoFocus />
              <button type="button" className="btn apricot lg block" onClick={() => forward('personality')}>{t('next')}</button>
              <button type="button" className="link self-start" onClick={() => go('name')}>{t('back')}</button>
            </div>
          )}

          {step === 'personality' && (
            <div className="form">
              <div><h3 className="step-title">{t('personalityStepT', { name: draft.name.trim() || 'Buddy' })}</h3><p className="muted small">{t('personalityStepB')}</p></div>
              <div className="choices">
                <button type="button" className="choice big-choice" data-autofocus onClick={() => go('quiz')}>
                  <span className="chip-screen chip-screen--sm"><Face emotion="thinking" /></span>
                  <span><b>{t('tabQuiz')}</b><br /><span className="feed-sub">{t('quizIntro')}</span></span>
                </button>
                <button type="button" className="choice big-choice" onClick={() => go('pick')}>
                  <span className="chip-screen chip-screen--sm"><Face emotion={type.emotion} /></span>
                  <span><b>{t('tabPick')}</b><br /><span className="feed-sub">{t('pickIntro')}</span></span>
                </button>
              </div>
              <button type="button" className="link self-start" onClick={() => go(reviewed ? 'review' : 'role')}>{t('back')}</button>
            </div>
          )}

          {step === 'quiz' && (
            <div className="form">
              <h3 className="step-title">{t('personalityStepT', { name: draft.name.trim() || 'Buddy' })}</h3>
              <PersonalityQuiz onExit={() => go('personality')} onPick={() => go('pick')}
                onResult={(code) => { set({ personality: code, personality_source: 'quiz' }); go('review'); }} />
            </div>
          )}

          {step === 'pick' && (
            <div className="form">
              <h3 className="step-title">{t('personalityStepT', { name: draft.name.trim() || 'Buddy' })}</h3>
              <PersonalityPicker value={draft.personality} onPick={(code) => set({ personality: code, personality_source: 'picked' })} />
              <button type="button" className="btn apricot lg block sticky-cta" onClick={() => go('review')}>{t('next')}</button>
              <button type="button" className="link self-start" onClick={() => go('personality')}>{t('back')}</button>
            </div>
          )}

          {step === 'review' && (
            <ReviewStep draft={draft} busy={busy} error={error} onEnter={() => setReviewed(true)}
              onEdit={(s) => go(s)} onSave={finish} />
          )}

          {step === 'done' && (
            <div className="center">
              <div className="hero-screen full"><Face emotion="excited" /></div>
              <h2>{t('readyNamed', { name: draft.name.trim() })}</h2>
              <p className="muted">{t('readyB')}</p>
              {device && <p className="mono muted">{device.serial}</p>}
              <button type="button" className="btn apricot lg block" data-autofocus onClick={onClose}>{t('done')}</button>
            </div>
          )}
        </>)}
      </div>
    </Layer>
  );
}

function ReviewStep({ draft, busy, error, onEnter, onEdit, onSave }) {
  const { t } = useI18n();
  useEffect(() => {
    onEnter();
    // Marks the wizard as reviewed once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="form">
      <div><h3 className="step-title">{t('reviewStepT')}</h3><p className="muted small">{t('reviewStepB')}</p></div>
      <ProfileSummary profile={draft} onEdit={onEdit} />
      {error && <p className="msg bad">{error}</p>}
      <button type="button" className="btn apricot lg block" data-autofocus disabled={busy} onClick={onSave}>{busy ? t('saving') : t('saveProfile')}</button>
    </div>
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

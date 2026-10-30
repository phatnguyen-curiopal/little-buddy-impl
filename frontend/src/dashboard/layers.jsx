import { useEffect, useRef, useState } from 'react';
import { BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { burst } from '../components/Confetti.js';
import { Chip, CloseButton, CoinStack, Icon, Layer, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { relativeTime, vnd, age } from '../lib/format.js';
import { useFamilyData } from './data.jsx';
import { toyLook, useToyName } from './parts.jsx';
import { ChildForm } from './screens.jsx';
import { DesignPicker, NameField, PersonalityPicker, PersonalityQuiz, ProfileEditor, ProfileSummary, RolePicker } from './profile.jsx';
import { DEFAULT_PROFILE } from '../lib/personality.js';
import { designOf } from '../lib/designs.js';

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
        <div className="layer-head">
          <button type="button" className="round" onClick={() => { setDraft(null); setError(''); }} aria-label={t('back')} disabled={busy}>{Icon.back}</button>
          <h2 id="toy-title">{t('profileTitle')}</h2>
          <button type="button" className="btn btn-pop btn-sm" disabled={busy} onClick={saveProfile}>{busy ? t('saving') : t('save')}</button>
        </div>
        <div className="layer-body">
          <ProfileEditor value={draft} onChange={(p) => { setDraft(p); setNameError(''); }} nameError={nameError} />
          {error && <p className="msg msg--bad">{error}</p>}
          <button type="button" className="btn btn-pop btn-lg btn-block" disabled={busy} onClick={saveProfile}>{busy ? t('saving') : t('saveProfile')}</button>
          <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>{t('cancel')}</button>
        </div>
      </Layer>
    );
  }

  return (
    <Layer kind="drawer" onClose={onClose} labelledBy="toy-title">
      <div className="layer-head">
        <CloseButton onClick={onClose} />
        <h2 id="toy-title">{nameOf(device, d.children)}</h2>
        <span className="layer-head-gap" />
      </div>
      <div className="layer-body">
        <Room size="md" night={look.dim} className="drawer-room">
          <span className="room-stage"><BuddyFigure design={designOf(device)} emotion={look.emotion === 'neutral' ? 'happy' : look.emotion} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} /></span>
          <span className="room-corner"><Chip tone={look.tone} dot>{t(look.key)}</Chip></span>
        </Room>
        {device.status === 'active' && d.me?.web_toy === true && (
          <button type="button" className="btn btn-pop btn-lg btn-block" onClick={() => { onClose(); navigate(`/app/talk?toy=${encodeURIComponent(device.id)}`); }}>
            {Icon.mic}{t('talkTo', { name: profile.name })}
          </button>
        )}
        <div className="card">
          <ProfileSummary profile={profile} />
          {device.status !== 'revoked' && (
            <button type="button" className="btn btn-soft btn-block" onClick={() => { setDraft(profile); setError(''); setNameError(''); }}>{Icon.sliders}{t('editProfile')}</button>
          )}
        </div>
        <div className="card rows">
          <div className="row">
            <label className="muted" htmlFor="toy-child">{t('toyFor')}</label>
            <select id="toy-child" className="input input--auto" value={device.child_id ?? ''} disabled={busy}
              onChange={(e) => act(() => api.setChild(device.id, e.target.value || null), t('saved'))}>
              <option value="">{t('noChild')}</option>
              {d.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="row"><span className="muted">{t('lastSeen')}</span><b>{relativeTime(device.last_seen_at, t)}</b></div>
          <div className="row"><span className="muted">{t('serial')}</span><b className="mono">{device.serial}</b></div>
          <div className="row"><span className="muted">{t('firmware')}</span><b className="mono">{device.firmware_version ?? t('unknown')}</b></div>
        </div>
        {device.status === 'active' && (<>
          <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => act(() => api.pause(device.id), t('pausedToast'))}>{Icon.moon}{t('pause')}</button>
          <p className="muted small">{t('pauseExplain')}</p>
        </>)}
        {device.status === 'disabled' && device.disabled_by === 'parent' && (<>
          <button type="button" className="btn btn-pop btn-block" disabled={busy} onClick={() => act(() => api.resume(device.id), t('wokeToast'))}>{Icon.sun}{t('wake')}</button>
          <p className="muted small">{t('pauseExplain')}</p>
        </>)}
        {device.status === 'disabled' && device.disabled_by === 'admin' && <div className="banner banner--bad">{Icon.alert}<span>{t('supportExplain')}</span></div>}
        {error && <p className="msg msg--bad">{error}</p>}
        {confirm ? (
          <div className="confirm">
            <p>{t('removeAsk')}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-danger-solid" disabled={busy} data-autofocus onClick={() => act(() => api.unpair(device.id), t('removed'), true)}>{t('removeYes')}</button>
              <button type="button" className="btn btn-soft" onClick={() => setConfirm(false)}>{t('cancel')}</button>
            </div>
          </div>
        ) : <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirm(true)}>{t('remove')}</button>}
      </div>
    </Layer>
  );
}

// Buddy introduces each step of the wizard from its own speech bubble.
function Guide({ design, emotion, title, sub }) {
  return (
    <div className="guide">
      <span className="guide-figure"><BuddyFigure design={design} emotion={emotion} /></span>
      <div className="guide-bubble">
        <h3 className="step-title">{title}</h3>
        {sub && <p className="muted small">{sub}</p>}
      </div>
    </div>
  );
}

// Screens of the add-toy wizard and the stepper phase each one lights up.
const PHASES = ['code', 'child', 'name', 'look', 'role', 'personality', 'review'];
const PHASE_OF = { quiz: 'personality', pick: 'personality', done: 'review' };
const sameProfile = (a, b) => a.name === b.name && a.design === b.design && a.role === b.role && a.personality === b.personality;

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

  // The Layer focuses once when it opens; each new screen needs it again,
  // and starts at the top.
  useEffect(() => {
    body.current?.querySelector('[data-autofocus]')?.focus();
    body.current?.scrollTo?.({ top: 0 });
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
    forward('look');
  };

  const phase = PHASE_OF[step] ?? step;
  const at = step === 'done' ? PHASES.length : PHASES.indexOf(phase) + 1;
  const name = draft.name.trim() || 'Buddy';
  const look = draft.design;
  return (
    <Layer kind="screen" onClose={requestClose} labelledBy="add-title" locked={busy}>
      <div className="wiz room-wall">
        <div className="wiz-top">
          <CloseButton onClick={requestClose} />
          <h2 id="add-title" className="sr-only">{t('addTitle')}</h2>
          <div className="steps" role="progressbar" aria-label={t('stepOf', { n: at, total: PHASES.length })} aria-valuemin={1} aria-valuemax={PHASES.length} aria-valuenow={at}>
            {PHASES.map((s, i) => <span key={s} className={i < at ? 'on' : ''} />)}
          </div>
        </div>

        <div className="wiz-body" ref={body}>
          {leaving ? (
            <div className="wiz-step">
              <Guide design={look} emotion="curious" title={t('leaveT')} sub={t('leaveB')} />
              {error && <p className="msg msg--bad">{error}</p>}
              <div className="wiz-actions">
                <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus disabled={busy} onClick={() => { setLeaving(false); setError(''); }}>{t('keepGoing')}</button>
                <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={saveAndClose}>{busy ? t('saving') : t('saveAndClose')}</button>
              </div>
            </div>
          ) : (<>
            {step === 'code' && (
              <form className="wiz-step" noValidate onSubmit={(e) => { e.preventDefault(); if (codeReady(code)) go('child'); }}>
                <Guide design={look} emotion={bad || error ? 'confused' : 'curious'} title={t('codeTitle')} />
                <div className="card stack">
                  <input className={`input code-input ${error ? 'shake' : ''}`} value={formatCode(code)} onChange={onCode} placeholder="XXXX-XXXX" maxLength={9}
                    autoComplete="off" autoCapitalize="characters" spellCheck="false" aria-describedby="code-msg" data-autofocus aria-label={t('codeTitle')} />
                  <p id="code-msg" className={`msg ${bad || error ? 'msg--bad' : 'muted'}`}>{bad ? t('codeBad', { c: bad }) : error || t('codeHelp')}</p>
                </div>
                <div className="wiz-actions">
                  <button type="submit" className="btn btn-pop btn-lg btn-block" disabled={!codeReady(code)}>{t('next')}</button>
                </div>
              </form>
            )}

            {step === 'child' && (
              <div className="wiz-step">
                <Guide design={look} emotion="happy" title={t('childTitle')} sub={t('childHelp')} />
                {d.children.length > 0 && (
                  <div className="choices" role="group" aria-label={t('childTitle')}>
                    {d.children.map((c, i) => (
                      <button key={c.id} type="button" className="choice kid-choice" aria-pressed={child === c.id} onClick={() => setChild(c.id)} data-autofocus={child === c.id || undefined}>
                        <span className={`avatar avatar--lg ${i % 2 ? 'avatar--gold' : ''}`}>{c.name.slice(0, 1)}</span>
                        <span className="kid-choice-text"><b>{c.name}</b><span className="muted small">{t('age', { n: age(c.birth_year) })}</span></span>
                        <span className="radio-dot" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
                {adding
                  ? <div className="card"><ChildForm onDone={async (c) => { await d.reload(); setChild(c.id); setAdding(false); }} /></div>
                  : <button type="button" className="add-tile add-tile--row" onClick={() => setAdding(true)}><span className="add-tile-plus">{Icon.plus}</span><b>{t('addChildInline')}</b></button>}
                {error && <p className="msg msg--bad">{error}</p>}
                <div className="wiz-actions">
                  <button type="button" className="btn btn-pop btn-lg btn-block" disabled={busy || !child} onClick={() => claim(child)}>{busy ? t('checking') : t('next')}</button>
                  <div className="wiz-row">
                    <button type="button" className="btn btn-soft" disabled={busy} onClick={() => go('code')}>{t('back')}</button>
                    <button type="button" className="btn btn-soft grow" disabled={busy} onClick={() => claim(null)}>{t('later')}</button>
                  </div>
                </div>
              </div>
            )}

            {step === 'name' && (
              <div className="wiz-step">
                {!reviewed && <div className="banner banner--ok">{Icon.check}<span>{t('addedB')}</span></div>}
                <Guide design={look} emotion="excited" title={t('nameStepT')} />
                <div className="card"><NameField value={draft.name} onChange={(n) => { set({ name: n }); setNameError(''); }} error={nameError} autoFocus /></div>
                <div className="wiz-actions">
                  <button type="button" className="btn btn-pop btn-lg btn-block" onClick={nameNext}>{t('next')}</button>
                  {!reviewed && <button type="button" className="btn btn-soft btn-block" onClick={requestClose}>{t('later')}</button>}
                </div>
              </div>
            )}

            {step === 'look' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('lookStepT', { name })}</h3><p className="muted">{t('lookStepB')}</p></div>
                <DesignPicker value={draft.design} onChange={(design) => set({ design })} autoFocus />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => go('name')}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => forward('role')}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'role' && (
              <div className="wiz-step">
                <Guide design={look} emotion="love" title={t('roleStepT')} sub={t('roleStepB')} />
                <RolePicker value={draft.role} onChange={(role) => set({ role })} autoFocus />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => go('look')}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => forward('personality')}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'personality' && (
              <div className="wiz-step">
                <Guide design={look} emotion="thinking" title={t('personalityStepT', { name })} sub={t('personalityStepB')} />
                <div className="choices">
                  <button type="button" className="choice big-choice" data-autofocus onClick={() => go('quiz')}>
                    <span className="big-choice-icon">{Icon.list}</span>
                    <span><b>{t('tabQuiz')}</b><span className="muted small">{t('quizIntro')}</span></span>
                  </button>
                  <button type="button" className="choice big-choice" onClick={() => go('pick')}>
                    <span className="big-choice-icon big-choice-icon--gold">{Icon.spark}</span>
                    <span><b>{t('tabPick')}</b><span className="muted small">{t('pickIntro')}</span></span>
                  </button>
                </div>
                <div className="wiz-actions">
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => go(reviewed ? 'review' : 'role')}>{t('back')}</button>
                </div>
              </div>
            )}

            {step === 'quiz' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('personalityStepT', { name })}</h3></div>
                <PersonalityQuiz design={look} onExit={() => go('personality')} onPick={() => go('pick')}
                  onResult={(c) => { set({ personality: c, personality_source: 'quiz' }); go('review'); }} />
              </div>
            )}

            {step === 'pick' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('personalityStepT', { name })}</h3></div>
                <PersonalityPicker design={look} value={draft.personality} onPick={(c) => set({ personality: c, personality_source: 'picked' })} />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => go('personality')}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => go('review')}>{t('useThis')}</button>
                </div>
              </div>
            )}

            {step === 'review' && (
              <ReviewStep draft={draft} busy={busy} error={error} onEnter={() => setReviewed(true)}
                onEdit={(s) => go(s)} onSave={finish} />
            )}

            {step === 'done' && (
              <div className="wiz-step wiz-done">
                <span className="wiz-done-figure"><BuddyFigure design={look} emotion="excited" /></span>
                <div className="card center">
                  <h2>{t('readyNamed', { name: draft.name.trim() })}</h2>
                  <p className="muted">{t('readyB')}</p>
                  {device && <p className="mono muted small">{device.serial}</p>}
                  <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={onClose}>{t('done')}</button>
                </div>
              </div>
            )}
          </>)}
        </div>
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
    <div className="wiz-step">
      <div className="wiz-title"><h3 className="step-title">{t('reviewStepT')}</h3><p className="muted">{t('reviewStepB')}</p></div>
      <ProfileSummary profile={draft} onEdit={onEdit} />
      {error && <p className="msg msg--bad">{error}</p>}
      <div className="wiz-actions">
        <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus disabled={busy} onClick={onSave}>{busy ? t('saving') : t('saveProfile')}</button>
      </div>
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
    <Layer kind="sheet" onClose={onClose} labelledBy="pay-title" locked={phase === 'processing'}>
      <span className="sheet-grip" aria-hidden="true" />
      <div className="layer-head">
        <h2 id="pay-title">{t('payTitle')}</h2>
        {phase !== 'processing' ? <CloseButton onClick={onClose} /> : <span className="layer-head-gap" />}
      </div>
      <div className="layer-body">
        {phase === 'confirm' && (<>
          {!initial && (
            <div className="pack-pick" role="group" aria-label={t('pack')}>
              {d.packs.map((p) => (
                <button key={p.id} type="button" className="choice pack-choice" aria-pressed={pack.id === p.id} onClick={() => setPack(p)}>
                  <CoinStack credits={p.credits} />
                  <span className="muted small">{t(`pack_${p.id}`)}</span>
                  <b>{t('credits', { n: p.credits })}</b>
                  <span className="pack-choice-price">{vnd(p.price_amount, lang)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="summary">
            <span className="muted">{t('pack')}</span><b>{t(`pack_${pack.id}`)}</b>
            <span className="muted">{t('add')}</span><b>+{t('credits', { n: pack.credits })}</b>
            <span className="summary-total">{t('total')}</span><b className="summary-price">{vnd(pack.price_amount, lang)}</b>
          </div>
          <div className="banner banner--warn">{Icon.alert}<span>{t('payNote')}</span></div>
          <label className="check" htmlFor="decline"><input id="decline" type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} /> {t('payDecline')}</label>
          {error && <p className="msg msg--bad">{error}</p>}
          <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={pay}>{t('pay', { price: vnd(pack.price_amount, lang) })}</button>
        </>)}
        {phase === 'processing' && <div className="center pad"><div className="spinner" role="progressbar" aria-label={t('paying')} /><p>{t('paying')}</p></div>}
        {phase === 'paid' && (
          <div className="pay-result">
            <span className="pay-figure"><BuddyFigure emotion="excited" /></span>
            <h3>{t('paidT', { n: pack.credits })}</h3>
            <p className="muted">{t('paidB', { b: balance })}</p>
            <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={onClose}>{t('done')}</button>
          </div>
        )}
        {phase === 'declined' && (
          <div className="pay-result">
            <span className="pay-figure"><BuddyFigure emotion="sad" /></span>
            <h3 className="bad-text">{t('declinedT')}</h3>
            <p className="muted">{t('declinedB')}</p>
            <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={() => { setDecline(false); setPhase('confirm'); }}>{t('tryAgain')}</button>
            <button type="button" className="btn btn-soft btn-block" onClick={onClose}>{t('cancel')}</button>
          </div>
        )}
      </div>
    </Layer>
  );
}

import { useEffect, useRef, useState } from 'react';
import { BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { burst } from '../components/Confetti.js';
import { Chip, CloseButton, CoinStack, Icon, Layer, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { age, isoDay, relativeTime, vnd } from '../lib/format.js';
import { designFor, toyActions, toyView } from '../lib/buddy.js';
import { DEFAULT_DESIGN } from '../lib/designs.js';
import {
  CHILD_LANGUAGES, answersKey, awakeToyOf, badCodeChar, birthDateProblem, buddyPatch, characterWho, childBody,
  cleanCode, codeReady, codeRejected, draftOf, fitVoice, formatCode, newDraft, ownVoicesOf, questionnaireAnswers, rankCharacters, rebaseDraft,
  stepNumber, toyOfChild, wizardPhases,
} from '../lib/wizard.js';
import { useFamilyData, useLayers } from './data.jsx';
import { packName, toyLook, useCanBuy } from './parts.jsx';
import {
  BuddyEditor, BuddyReview, BuddySummary, CharacterPicker, LanguagePicker, PersonalityPicker, PersonalityQuiz, RolePicker, VoicePicker,
} from './profile.jsx';
import '../styles/wizard.css';

// The words for what went wrong with a toy or a Buddy. The codes a parent
// can act on get a sentence about this toy and this child; anything else is
// the site's usual message for the code, which for a rate limit says how
// long to wait (minutes or hours after too many pairings).
function useExplain() {
  const { t } = useI18n();
  const errText = useErrorText();
  return (err, { child = '', waking = false } = {}) => {
    switch (err?.code) {
      case 'child_has_toy': return waking ? t('wzErrWakeBusy', { child }) : t('wzErrChildHasToy', { name: child });
      case 'web_toy_limit': return t('wzErrWebLimit');
      case 'web_toy_off': return t('wzErrWebOff');
      case 'toy_held': return t('wzSupport');
      case 'invalid_claim': return t('wzCodeWrong');
      default: return errText(err);
    }
  };
}

// ---------- The toy drawer ----------

// Changing the character starts a new friendship (backend-v2 makes a new
// Buddy; the child's memories stay), so it never rides along with Save: it
// asks first and then happens on its own. The new character keeps the
// personality the parent picked (onChanged gets it to carry over); its voice
// becomes the character's own. locked while the drawer saves, so the two
// never race for the same Buddy.
function CharacterChange({ child, buddy, onChanged, locked = false }) {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [failed, setFailed] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const asking = useRef(null);
  const current = d.characters.find((c) => c.slug === buddy.character_slug) ?? { slug: buddy.character_slug, name: buddy.character_name };
  const chosen = pick ? d.characters.find((c) => c.slug === pick) : null;

  // A pick asks its question at once, so the answer buttons take the focus.
  useEffect(() => {
    if (pick) asking.current?.querySelector('button')?.focus();
  }, [pick]);

  // The match is asked for with the Buddy's saved choices, so it reflects
  // the Buddy as it is, whatever the editor holds unsaved.
  const load = async () => {
    setFailed(null);
    setQuiz(null);
    try {
      setQuiz(await api.answerQuestionnaire(child.id, questionnaireAnswers(draftOf(buddy)), lang));
    } catch (err) {
      setFailed(err);
    }
  };

  const start = () => {
    setOpen(true);
    setPick(null);
    setError('');
    load();
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    let changed;
    try {
      changed = await api.changeBuddy(child.id, quiz.questionnaire_id, pick);
    } catch (err) {
      setError(errText(err));
      return;
    } finally {
      setBusy(false);
    }
    // The old Buddy is archived and the new one live from here, so the
    // question closes whatever happens next: asking again would change the
    // character a second time.
    setOpen(false);
    setPick(null);
    onChanged(changed, buddy.personality);
  };

  return (
    <section className="pe-section card">
      <p className="pe-label" id="ed-character">{t('wzCharacterLabel')}</p>
      {!open && (<>
        <div className="p-current">
          <span className="wz-char-mini"><BuddyFigure design={designFor(current.slug)} emotion="happy" /></span>
          <span><b>{current.name}</b><br /><span className="small">{characterWho(current, t)}</span></span>
        </div>
        <button type="button" className="btn btn-soft btn-block" disabled={locked} onClick={start}>{Icon.refresh}{t('wzCharChange')}</button>
      </>)}
      {open && (<>
        <p className="muted small">{t('wzCharChangeB', { child: child.name })}</p>
        {quiz ? (
          <CharacterPicker characters={rankCharacters(d.characters, quiz)} value={pick ?? current.slug} labelledBy="ed-character"
            matchSlug={quiz.match?.character?.slug} currentSlug={current.slug}
            onChange={(slug) => { setPick(slug === current.slug ? null : slug); setError(''); }} />
        ) : failed ? (
          <div className="banner banner--bad banner--action">{Icon.alert}<span>{errText(failed)}</span><button type="button" className="btn btn-sm btn-soft" onClick={load}>{t('tryAgain')}</button></div>
        ) : (
          <div className="center pad"><div className="spinner" role="progressbar" aria-label={t('wzCharLoading')} /><p>{t('wzCharLoading')}</p></div>
        )}
        {chosen && (
          <div ref={asking} className="confirm" role="alertdialog" aria-labelledby="char-confirm-t" aria-describedby="char-confirm-b">
            <b id="char-confirm-t">{t('wzCharConfirmT', { name: chosen.name })}</b>
            <p id="char-confirm-b">{t('wzCharConfirmB', { name: chosen.name, child: child.name })}</p>
            {error && <p className="msg msg--bad" role="alert">{error}</p>}
            <div className="row-actions">
              <button type="button" className="btn btn-pop" disabled={busy || locked} onClick={confirm}>{busy ? t('saving') : t('wzCharConfirmYes', { name: chosen.name })}</button>
              <button type="button" className="btn btn-soft" disabled={busy} onClick={() => { setOpen(false); setPick(null); }}>{t('wzCharKeep', { name: current.name })}</button>
            </div>
          </div>
        )}
        {!chosen && <button type="button" className="btn btn-soft btn-block" onClick={() => setOpen(false)}>{t('wzCharKeep', { name: current.name })}</button>}
      </>)}
    </section>
  );
}

export function ToyDrawer({ id, onClose }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const explain = useExplain();
  const { openAdd } = useLayers();
  const panel = useRef(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // While editing: the Buddy as loaded (its etag guards the save) and the
  // parent's unsaved choices.
  const [edit, setEdit] = useState(null);
  const editing = Boolean(edit);
  const wasEditing = useRef(editing);
  const removeArea = useRef(null);
  const wasConfirming = useRef(confirm);

  // The summary and the editor are two pages in one drawer: switching starts
  // at the top, with focus on the editor's first choice, or back on the
  // button that opened the editor. (Opening the drawer is the Layer's job.)
  useEffect(() => {
    if (wasEditing.current === editing) return;
    wasEditing.current = editing;
    panel.current?.closest('.layer')?.scrollTo?.({ top: 0 });
    const target = panel.current?.querySelector(editing ? '[data-autofocus]' : '[data-edit]');
    (target ?? panel.current?.querySelector('button'))?.focus();
  }, [editing]);

  // A stale save is reported at the top of the editor; the parent may be
  // anywhere down the page when it happens.
  useEffect(() => {
    if (notice) panel.current?.closest('.layer')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [notice]);

  // The removal question takes the focus while it is asked, and gives it
  // back to the button that asked it.
  useEffect(() => {
    if (wasConfirming.current === confirm) return;
    wasConfirming.current = confirm;
    removeArea.current?.querySelector(confirm ? '[data-autofocus]' : 'button')?.focus();
  }, [confirm]);

  const device = d.devices.find((x) => x.id === id);
  if (!device) return null;
  const view = toyView(device, d.children, d.buddies);
  const { child, buddy, web } = view;
  const can = toyActions(view, d.me?.web_toy === true);
  const look = toyLook(device);
  const kid = child?.name ?? t('wzKid');
  const title = buddy
    ? t('wzBuddyOf', { name: buddy.character_name, child: kid })
    : child ? t('wzForChild', { name: child.name }) : t('wzToyNoChild', { serial: device.serial });
  const name = buddy?.character_name ?? 'Buddy';
  const staffHeld = device.status === 'disabled' && device.disabled_by === 'staff';
  const alerts = child ? (d.alerts[child.id] ?? 0) : 0;
  // Removing a toy never removes the child's Buddy, so the question says so
  // by name; a web Buddy cannot come back once deleted.
  const removeAsk = web
    ? (buddy ? t('wzRemoveAskWeb', { name, child: kid }) : t('wzRemoveAskWebBare'))
    : (buddy ? t('wzRemoveAsk', { name, child: kid }) : t('wzRemoveAskBare'));

  const act = async (fn, okText, { close = false, waking = false } = {}) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await d.reload();
      toast(okText);
      if (close) onClose();
    } catch (err) {
      setError(explain(err, { child: kid, waking }));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setEdit({ base: buddy, draft: draftOf(buddy) });
    setError('');
    setNotice('');
  };
  const stopEdit = () => {
    setEdit(null);
    setError('');
    setNotice('');
  };

  const save = async () => {
    const patch = buddyPatch(edit.base, edit.draft);
    if (!Object.keys(patch).length) {
      stopEdit();
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.updateBuddy(child.id, patch, edit.base.etag);
      await d.reload();
      toast(t('wzSaved', { name: edit.base.character_name }));
      setEdit(null);
    } catch (err) {
      // Someone saved this Buddy since it was loaded: load the newest one,
      // keep the parent's edits on top and say so, rather than overwrite.
      const fresh = err.code === 'stale_write' ? await api.buddy(child.id).catch(() => null) : null;
      if (fresh) {
        setEdit({ base: fresh, draft: rebaseDraft(edit.base, edit.draft, fresh, d.voices, child) });
        setNotice(t('wzStale', { name: fresh.character_name }));
        d.reload();
      } else {
        setError(explain(err, { child: kid }));
      }
    } finally {
      setBusy(false);
    }
  };

  // The new character is a new Buddy, live as soon as the change answers, so
  // the editor moves onto it at once. It starts with no personality: the old
  // Buddy's is written back here, and the draft keeps its personality either
  // way, so if that write fails, Save still applies it.
  const characterChanged = async (fresh, personality) => {
    setEdit((e) => (e ? { base: fresh, draft: { ...rebaseDraft(e.base, e.draft, fresh, d.voices, child), personality: e.draft.personality } } : e));
    setNotice('');
    d.reload();
    toast(t('wzCharChanged', { name: fresh.character_name, child: kid }));
    if (!personality) return;
    // Save waits for this write, which moves the new Buddy's etag on.
    setBusy(true);
    try {
      const kept = await api.updateBuddy(child.id, { personality }, fresh.etag);
      setEdit((e) => (e?.base.id === kept.id ? { ...e, base: kept } : e));
      d.reload();
    } catch {
      setNotice(t('wzCharPersonalityLost', { name: fresh.character_name }));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const editName = edit.base.character_name;
    return (
      <Layer kind="drawer" onClose={onClose} labelledBy="toy-title" locked={busy}>
        <div ref={panel}>
          <div className="layer-head">
            <button type="button" className="round" onClick={stopEdit} aria-label={t('back')} disabled={busy}>{Icon.back}</button>
            <h2 id="toy-title">{t('wzEditT', { name: editName })}</h2>
            <button type="button" className="btn btn-pop btn-sm" disabled={busy} onClick={save}>{busy ? t('saving') : t('save')}</button>
          </div>
          <div className="layer-body">
            {notice && <div className="banner banner--warn" role="status">{Icon.alert}<span>{notice}</span></div>}
            <BuddyEditor value={edit.draft} onChange={(draft) => setEdit((e) => ({ ...e, draft }))} buddy={edit.base} child={child} voices={d.voices}
              character={<CharacterChange key={edit.base.id} child={child} buddy={edit.base} onChanged={characterChanged} locked={busy} />} />
            {error && <p className="msg msg--bad" role="alert">{error}</p>}
            <button type="button" className="btn btn-pop btn-lg btn-block" disabled={busy} onClick={save}>{busy ? t('saving') : t('wzSaveBuddy')}</button>
            <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={stopEdit}>{t('cancel')}</button>
          </div>
        </div>
      </Layer>
    );
  }

  return (
    <Layer kind="drawer" onClose={onClose} labelledBy="toy-title">
      <div ref={panel}>
        <div className="layer-head">
          <CloseButton onClick={onClose} />
          <h2 id="toy-title">{title}</h2>
          <span className="layer-head-gap" />
        </div>
        <div className="layer-body">
          <Room size="md" night={look.dim} className="drawer-room">
            <span className="room-stage"><BuddyFigure design={view.design} emotion={look.emotion === 'neutral' ? 'happy' : look.emotion} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} label={name} /></span>
            <span className="room-corner"><Chip tone={look.tone} dot>{t(look.key)}</Chip></span>
          </Room>

          {can.talk && (
            <button type="button" className="btn btn-pop btn-lg btn-block" onClick={() => { onClose(); navigate(`/app/talk?toy=${encodeURIComponent(device.id)}`); }}>
              {Icon.mic}{t('wzTalkTo', { name })}
            </button>
          )}

          {buddy && (
            <div className="card">
              <BuddySummary buddy={buddy} voices={d.voices} />
              {device.status !== 'revoked' && (
                <button type="button" className="btn btn-soft btn-block" data-edit onClick={startEdit}>{Icon.sliders}{t('wzEditBuddy')}</button>
              )}
            </div>
          )}
          {can.setup && (
            <div className="card">
              <b className="card-title">{t('wzNoBuddyT', { child: child.name })}</b>
              <p className="muted small">{web ? t('wzNoBuddyWebB') : t('wzNoBuddyB')}</p>
              <button type="button" className="btn btn-pop btn-block" onClick={() => openAdd(child.id)}>{Icon.spark}{t('wzFinishSetup')}</button>
            </div>
          )}

          {child && (
            <button type="button" className="choice wz-care" onClick={() => { onClose(); navigate(`/app/care?child=${encodeURIComponent(child.id)}`); }}>
              <span className="big-choice-icon">{Icon.heart}</span>
              <span className="wz-care-text">
                <b>{t('wzCareT', { name })}</b>
                <span className="muted small">{t('wzCareB', { name, child: child.name })}</span>
                {alerts > 0 && <Chip tone="bad">{Icon.alert}{t('wzCareAlerts', { n: alerts })}</Chip>}
              </span>
              <span className="wz-care-go" aria-hidden="true">{Icon.arrow}</span>
            </button>
          )}

          <div className="card rows wz-facts">
            <div className="row"><span className="muted">{t('wzKind')}</span><b>{web ? t('wzKindWeb') : t('wzKindToy')}</b></div>
            {child && <div className="row"><span className="muted">{t('wzFor')}</span><b>{child.name}</b></div>}
            <div className="row">
              <span className="muted">{t('wzOnline')}</span>
              <Chip tone={device.online ? 'ok' : 'rest'} dot>{device.online ? t('wzOnlineYes') : t('wzOnlineNo')}</Chip>
            </div>
            <div className="row"><span className="muted">{t('wzLastSeen')}</span><b>{relativeTime(device.last_seen_at, t)}</b></div>
            <div className="row"><span className="muted">{t('wzSerial')}</span><b className="mono">{device.serial}</b></div>
            {!web && <div className="row"><span className="muted">{t('wzFirmware')}</span><b className="mono">{device.firmware_version ?? t('unknown')}</b></div>}
          </div>

          {can.pause && (<>
            <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => act(() => api.pause(device.id), t('wzPausedToast', { name }))}>{Icon.moon}{t('wzPause')}</button>
            <p className="muted small">{web ? t('wzPauseExplainWeb') : t('wzPauseExplain')}</p>
          </>)}
          {can.wake && (<>
            <button type="button" className="btn btn-pop btn-block" disabled={busy} onClick={() => act(() => api.resume(device.id), t('wzWokeToast', { name }), { waking: true })}>{Icon.sun}{t('wzWake')}</button>
            <p className="muted small">{web ? t('wzPauseExplainWeb') : t('wzPauseExplain')}</p>
          </>)}
          {staffHeld && <div className="banner banner--bad">{Icon.alert}<span>{t('wzSupport')}</span></div>}
          {error && <p className="msg msg--bad" role="alert">{error}</p>}

          {!staffHeld && device.status !== 'revoked' && <div ref={removeArea} className="stack">{confirm ? (
            <div className="confirm" role="alertdialog" aria-labelledby="remove-ask">
              <p id="remove-ask">{removeAsk}</p>
              <div className="row-actions">
                <button type="button" className="btn btn-danger-solid" disabled={busy} data-autofocus
                  onClick={() => act(() => api.unpair(device.id), web ? t('wzRemovedWeb') : t('wzRemoved'), { close: true })}>
                  {web ? t('wzRemoveYesWeb') : t('wzRemoveYes')}
                </button>
                <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setConfirm(false)}>{t('cancel')}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirm(true)}>{web ? t('wzRemoveWeb') : t('wzRemove')}</button>
          )}</div>}
        </div>
      </div>
    </Layer>
  );
}

// ---------- Adding a Buddy ----------

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

// A child added from inside the wizard: name, an optional birthday (Buddy
// talks at the child's age) and the languages the child speaks, with the
// browser's time zone so Buddy's day follows the child's clock.
function ChildForm({ onDone, onCancel, autoFocus = false }) {
  const { t, lang } = useI18n();
  const errText = useErrorText();
  const nameRef = useRef(null);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [langs, setLangs] = useState(lang === 'en' ? 'en' : 'vi');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const birthIssue = birthDateProblem(birth);

  // Opened with a tap, the form takes the focus at once; opened with the
  // wizard, the wizard's own focus handling finds it.
  useEffect(() => {
    if (!autoFocus) nameRef.current?.focus();
    // Runs once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(t('wzNeedChildName'));
      nameRef.current?.focus();
      return;
    }
    if (birthIssue) return;
    setBusy(true);
    setError('');
    try {
      onDone(await api.addChild(childBody({ name, birthDate: birth, languages: langs })));
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <form className="child-form" onSubmit={submit} noValidate>
      <h3 className="card-title">{t('wzAddChild')}</h3>
      <div className="field">
        <label htmlFor="wz-child-name">{t('wzChildName')}</label>
        <input ref={nameRef} id="wz-child-name" className="input" value={name} maxLength={60} autoComplete="off" data-autofocus={autoFocus || undefined}
          aria-invalid={Boolean(nameError) || undefined} aria-describedby={nameError ? 'wz-child-name-msg' : undefined}
          onChange={(e) => { setName(e.target.value); setNameError(''); }} />
        {nameError && <p id="wz-child-name-msg" className="msg msg--bad">{nameError}</p>}
      </div>
      <div className="field">
        <label htmlFor="wz-child-birth">{t('wzBirthDate')} <span className="muted small">({t('optional')})</span></label>
        <input id="wz-child-birth" type="date" className="input" value={birth} max={isoDay()} aria-describedby="wz-child-birth-msg"
          aria-invalid={Boolean(birthIssue) || undefined} onChange={(e) => setBirth(e.target.value)} />
        <p id="wz-child-birth-msg" className={birthIssue ? 'msg msg--bad' : 'muted small'}>{birthIssue ? t(`wzBirth_${birthIssue}`) : t('wzBirthHelp')}</p>
      </div>
      <div className="field">
        <span className="field-label" id="wz-child-langs">{t('wzChildLangs')}</span>
        <div className="seg" role="group" aria-labelledby="wz-child-langs">
          {Object.keys(CHILD_LANGUAGES).map((k) => (
            <button key={k} type="button" aria-pressed={langs === k} onClick={() => setLangs(k)}>{t(`wzChildLang_${k}`)}</button>
          ))}
        </div>
      </div>
      {error && <p className="msg msg--bad" role="alert">{error}</p>}
      <div className="row-actions">
        <button type="submit" className="btn btn-pop" disabled={busy}>{busy ? t('saving') : t('wzChildSave')}</button>
        {onCancel && <button type="button" className="btn btn-soft" disabled={busy} onClick={onCancel}>{t('cancel')}</button>}
      </div>
    </form>
  );
}

// The toy is made as soon as the child is chosen (a claimed card, or a
// Buddy that lives in the browser), so a wrong code shows up before any
// Buddy work and closing later never loses the toy. A child with a Buddy
// already is done right there; otherwise the parent picks a personality, a
// role and a language, which become the questionnaire backend-v2 matches a
// character from, then a character and a voice, and everything is saved at
// the end. childId resumes a child's unfinished setup on the toy it has.
export function AddToyModal({ onClose, childId: resumeId = null }) {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const explain = useExplain();
  const { openToy } = useLayers();
  const body = useRef(null);
  const webToy = d.me?.web_toy === true;

  // Everything below starts from what the family has when the wizard opens.
  // Only a child who holds a toy resumes; a child with no toy yet starts at
  // the toy, already chosen, because the wizard is toy first (a Buddy saved
  // with no toy would end on a screen promising a toy that does not exist).
  const [start] = useState(() => {
    const asked = typeof resumeId === 'string' ? d.children.find((c) => c.id === resumeId) ?? null : null;
    const toy = asked ? toyOfChild(d.devices, asked.id) : null;
    const kid = toy ? asked : null;
    const free = (asked && !toy ? asked : null) ?? d.children.find((c) => !awakeToyOf(d.devices, c.id)) ?? null;
    const buddy = kid ? d.buddies[kid.id] ?? null : null;
    return {
      kid, free, buddy, toy,
      step: kid ? (buddy ? 'existing' : 'personality') : webToy ? 'child' : 'code',
    };
  });
  const [resume, setResume] = useState(Boolean(start.kid));
  const [withCode, setWithCode] = useState(!webToy);
  const [step, setStep] = useState(start.step);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [childId, setChildId] = useState(start.kid?.id ?? start.free?.id ?? null);
  const [adding, setAdding] = useState(!start.kid && !start.free);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(start.toy);
  const [justAdded, setJustAdded] = useState(false);
  const [existing, setExisting] = useState(start.buddy);
  const [draft, setDraft] = useState(() => newDraft(start.kid));
  const [slug, setSlug] = useState(null);
  const [slugPicked, setSlugPicked] = useState(false);
  const [confirmed, setConfirmed] = useState(false); // the parent has decided on a character once
  const [quiz, setQuiz] = useState(null); // { key, id, match, alternatives } for the answers in key
  const [quizError, setQuizError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [reviewed, setReviewed] = useState(false); // after the first review, "next" returns there
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const child = d.children.find((c) => c.id === childId) ?? start.kid;
  const kid = child?.name ?? t('wzKid');
  const isWeb = device?.hardware_rev === 'web';
  const character = d.characters.find((c) => c.slug === slug) ?? null;
  const charName = character?.name ?? 'Buddy';
  const answers = questionnaireAnswers(draft);
  const key = answersKey(answers);
  const quizReady = quiz?.key === key;
  // The characters arriving replace the spinner, which is a new screen too.
  const charsShown = step === 'character' && quizReady;

  // The Layer focuses once when it opens; each new screen needs it again,
  // and starts at the top.
  useEffect(() => {
    body.current?.querySelector('[data-autofocus]')?.focus();
    body.current?.scrollTo?.({ top: 0 });
  }, [step, leaving, charsShown]);

  useEffect(() => {
    if (step === 'review') setReviewed(true);
  }, [step]);

  // The match for the current choices, asked for again only when one of
  // them changed since the last answer.
  useEffect(() => {
    if (step !== 'character' || !child || quizReady) return undefined;
    let live = true;
    setQuizError(null);
    api.answerQuestionnaire(child.id, answers, lang).then((out) => {
      if (!live) return;
      setQuiz({ key, id: out.questionnaire_id, match: out.match, alternatives: out.alternatives ?? [] });
      if (!slugPicked) setSlug(out.match?.character?.slug ?? null);
    }, (err) => {
      if (live) setQuizError(err);
    });
    return () => {
      live = false;
    };
    // answers is rebuilt every render; key is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, key, child?.id, quizReady, retry]);

  const go = (next) => {
    setError('');
    setStep(next);
  };
  const forward = (next) => go(reviewed ? 'review' : next);
  const set = (patch) => setDraft((p) => ({ ...p, ...patch }));

  const bad = badCodeChar(code);
  const onCode = (e) => {
    setCode(cleanCode(e.target.value));
    setError('');
  };

  // The child now has a toy: carry on with the child's Buddy, or make one.
  const continueWith = async (kidRow, toy) => {
    setDevice(toy);
    const buddy = await api.buddy(kidRow.id).catch(() => d.buddies[kidRow.id] ?? null);
    if (buddy) {
      setExisting(buddy);
      go('existing');
    } else {
      setDraft(newDraft(kidRow));
      go('personality');
    }
  };

  const makeToy = async () => {
    if (!child) return;
    setBusy(true);
    setError('');
    try {
      const toy = withCode ? await api.claim(formatCode(code), child.id) : await api.createWebToy(child.id);
      setJustAdded(true);
      await continueWith(child, toy);
    } catch (err) {
      if (withCode && codeRejected(err)) {
        setStep('code');
        setError(t('wzCodeWrong'));
      } else {
        setError(explain(err, { child: child.name }));
      }
    } finally {
      setBusy(false);
      // Also after a failure: a lost answer may still have made the toy.
      d.reload();
    }
  };

  // A child whose toy is awake but who has no Buddy yet: finish that setup
  // instead of adding another toy.
  const resumeFor = (kidRow) => {
    const toy = awakeToyOf(d.devices, kidRow.id);
    setChildId(kidRow.id);
    setResume(true);
    setJustAdded(false);
    setDevice(toy);
    setDraft(newDraft(kidRow));
    go('personality');
  };

  // Creates the child's Buddy and applies what the questionnaire does not
  // carry (personality, voice) plus any role or language changed after the
  // character step. A Buddy that already exists is fine when it is the one
  // chosen here (a lost answer to an earlier save); a different one is
  // never overwritten.
  const saveBuddy = async () => {
    // Any questionnaire of this child will do: role, language and personality
    // all go in the PATCH below.
    const qid = quiz?.id ?? (await api.answerQuestionnaire(child.id, answers, lang)).questionnaire_id;
    let buddy;
    try {
      buddy = await api.createBuddy(child.id, qid, slug);
    } catch (err) {
      if (err.code !== 'buddy_exists') throw err;
      buddy = await api.buddy(child.id);
      if (!buddy || buddy.character_slug !== slug) throw Object.assign(new Error('buddy_exists'), { existing: buddy });
    }
    const patch = buddyPatch(buddy, draft);
    if (!Object.keys(patch).length) return buddy;
    try {
      return await api.updateBuddy(child.id, patch, buddy.etag);
    } catch (err) {
      if (err.code !== 'stale_write') throw err;
      const fresh = await api.buddy(child.id);
      return api.updateBuddy(child.id, buddyPatch(fresh, draft), fresh.etag);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      setSaved(await saveBuddy());
      await d.reload();
      go('done');
      burst();
    } catch (err) {
      if (err.existing) {
        setExisting(err.existing);
        d.reload();
        go('existing');
      } else {
        setError(explain(err, { child: kid }));
      }
    } finally {
      setBusy(false);
    }
  };

  // Once the toy exists, closing asks first: the toy stays either way, the
  // question is only whether the choices so far become the child's Buddy.
  const requestClose = () => {
    if (busy) return;
    if (device && step !== 'done' && step !== 'existing') setLeaving(true);
    else onClose();
  };

  const canSave = confirmed && Boolean(slug);
  const saveAndClose = async () => {
    setBusy(true);
    setError('');
    try {
      const buddy = await saveBuddy();
      d.reload();
      toast(t('wzSaved', { name: buddy.character_name }));
      onClose();
    } catch (err) {
      if (err.existing) {
        d.reload();
        onClose();
        return;
      }
      setError(explain(err, { child: kid }));
      setBusy(false);
    }
  };

  const phases = wizardPhases({ withCode, resume });
  const at = stepNumber(phases, step);
  const guide = confirmed && slug ? designFor(slug) : DEFAULT_DESIGN;
  const someAwake = d.children.some((c) => awakeToyOf(d.devices, c.id));
  const done = saved ?? existing;
  const doneName = done?.character_name ?? charName;
  const backToReview = reviewed ? () => go('review') : null;

  return (
    <Layer kind="screen" onClose={requestClose} labelledBy="add-title" locked={busy}>
      <div className="wiz room-wall">
        <div className="wiz-top">
          <CloseButton onClick={requestClose} />
          <h2 id="add-title" className="sr-only">{t('wzTitle')}</h2>
          <div className="steps" role="progressbar" aria-label={t('wzStepOf', { n: at, total: phases.length })} aria-valuemin={1} aria-valuemax={phases.length} aria-valuenow={at}>
            {phases.map((s, i) => <span key={s} className={i < at ? 'on' : ''} />)}
          </div>
        </div>

        <div className="wiz-body" ref={body}>
          {leaving ? (
            <div className="wiz-step">
              <Guide design={guide} emotion="curious" title={t('wzLeaveT')}
                sub={canSave ? t('wzLeaveSaveB', { name: charName }) : isWeb ? t('wzLeaveLaterWebB', { child: kid }) : t('wzLeaveLaterB', { child: kid })} />
              {error && <p className="msg msg--bad" role="alert">{error}</p>}
              <div className="wiz-actions">
                <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus disabled={busy} onClick={() => { setLeaving(false); setError(''); }}>{t('wzKeepGoing')}</button>
                {canSave
                  ? <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={saveAndClose}>{busy ? t('saving') : t('wzSaveClose')}</button>
                  : <button type="button" className="btn btn-soft btn-block" onClick={onClose}>{t('wzCloseLater')}</button>}
              </div>
            </div>
          ) : (<>
            {step === 'code' && (
              <form className="wiz-step" noValidate onSubmit={(e) => { e.preventDefault(); if (codeReady(code)) go('child'); }}>
                <Guide design={DEFAULT_DESIGN} emotion={bad || error ? 'confused' : 'curious'} title={t('wzCodeT')} />
                <div className="card stack">
                  <input className={`input code-input ${error ? 'shake' : ''}`} value={formatCode(code)} onChange={onCode} placeholder="XXXX-XXXX" maxLength={9}
                    autoComplete="off" autoCapitalize="characters" spellCheck="false" aria-describedby="code-msg" data-autofocus aria-label={t('wzCodeT')}
                    aria-invalid={Boolean(bad || error) || undefined} />
                  <p id="code-msg" className={`msg ${bad || error ? 'msg--bad' : 'muted'}`} aria-live="polite">{bad ? t('wzCodeBad', { c: bad }) : error || t('wzCodeHelp')}</p>
                </div>
                <div className="wiz-actions">
                  <button type="submit" className="btn btn-pop btn-lg btn-block" disabled={!codeReady(code)}>{t('next')}</button>
                  {webToy && <button type="button" className="btn btn-soft btn-block wz-btn-wrap" onClick={() => { setWithCode(false); setCode(''); go('child'); }}>{t('wzNoCode')}</button>}
                </div>
              </form>
            )}

            {step === 'child' && (
              <div className="wiz-step">
                <Guide design={DEFAULT_DESIGN} emotion="happy" title={t('wzChildT')} sub={withCode ? t('wzChildHelpCode') : t('wzChildHelpWeb')} />
                {d.children.length > 0 && (
                  <div className="choices" role="group" aria-label={t('wzChildT')}>
                    {d.children.map((c, i) => {
                      const awake = awakeToyOf(d.devices, c.id);
                      const buddy = d.buddies[c.id] ?? null;
                      const years = age(c.birth_date);
                      const sub = [
                        years !== null ? t('wzAgeYears', { n: years }) : null,
                        buddy ? t('wzKidHasBuddy', { name: buddy.character_name }) : null,
                        awake ? t('wzChildAwake') : null,
                      ].filter(Boolean).join(' · ');
                      return (
                        <div key={c.id} className="wz-kid">
                          <button type="button" className="choice kid-choice" aria-pressed={childId === c.id} disabled={Boolean(awake) || busy}
                            onClick={() => { setChildId(c.id); setError(''); }} data-autofocus={(childId === c.id && !awake) || undefined}>
                            <span className={`avatar avatar--lg ${i % 2 ? 'avatar--gold' : ''}`}>{c.name.slice(0, 1).toUpperCase()}</span>
                            <span className="kid-choice-text"><b>{c.name}</b>{sub && <span className="muted small">{sub}</span>}</span>
                            <span className="radio-dot" aria-hidden="true" />
                          </button>
                          {awake && !buddy && !withCode && (
                            <button type="button" className="link wz-kid-resume" disabled={busy} onClick={() => resumeFor(c)}>{t('wzChildResume', { name: c.name })}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {someAwake && <p className="muted small">{t('wzChildAwakeHelp')}</p>}
                {adding
                  ? <div className="card"><ChildForm autoFocus={!start.free && !start.kid} onCancel={d.children.length ? () => setAdding(false) : null}
                    onDone={async (c) => { await d.reload(); setChildId(c.id); setAdding(false); }} /></div>
                  : <button type="button" className="add-tile add-tile--row" onClick={() => setAdding(true)}><span className="add-tile-plus">{Icon.plus}</span><b>{t('wzAddChild')}</b></button>}
                <div className="wiz-actions">
                  {/* In the action bar, so a refusal shows where the parent tapped even on a long list. */}
                  {error && <p className="msg msg--bad" role="alert">{error}</p>}
                  <button type="button" className="btn btn-pop btn-lg btn-block" disabled={busy || !child || Boolean(awakeToyOf(d.devices, childId))} onClick={makeToy}>
                    {busy ? (withCode ? t('wzClaiming') : t('wzCreating')) : t('next')}
                  </button>
                  {withCode && <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => go('code')}>{t('back')}</button>}
                  {!withCode && webToy && <button type="button" className="link" disabled={busy} onClick={() => { setWithCode(true); go('code'); }}>{t('wzHaveCode')}</button>}
                </div>
              </div>
            )}

            {step === 'existing' && existing && (
              <div className="wiz-step">
                <Guide design={designFor(existing.character_slug)} emotion="love" title={t('wzExistingT', { name: existing.character_name, child: kid })}
                  sub={resume && !justAdded ? t('wzExistingResumeB', { name: existing.character_name, child: kid })
                    : isWeb ? t('wzExistingWebB', { name: existing.character_name, child: kid }) : t('wzExistingB', { name: existing.character_name, child: kid })} />
                <div className="card"><BuddySummary buddy={existing} voices={d.voices} /></div>
                <div className="wiz-actions">
                  <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={() => { go('done'); burst(); }}>{t('wzExistingDone')}</button>
                  {device && <button type="button" className="btn btn-soft btn-block" onClick={() => openToy(device.id)}>{Icon.sliders}{t('wzAdjust', { name: existing.character_name })}</button>}
                </div>
              </div>
            )}

            {step === 'personality' && (
              <div className="wiz-step">
                {justAdded && !reviewed && <div className="banner banner--ok">{Icon.check}<span>{isWeb ? t('wzAddedWeb', { name: kid }) : t('wzAdded', { name: kid })}</span></div>}
                <Guide design={guide} emotion="thinking" title={t('wzPersonalityT', { child: kid })} sub={t('wzPersonalityB')} />
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
                  {backToReview
                    ? <button type="button" className="btn btn-soft btn-lg" onClick={backToReview}>{t('back')}</button>
                    : <button type="button" className="btn btn-soft btn-block" onClick={requestClose}>{t('later')}</button>}
                </div>
              </div>
            )}

            {step === 'quiz' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('wzPersonalityT', { child: kid })}</h3></div>
                <PersonalityQuiz design={guide} onExit={() => go('personality')} onPick={() => go('pick')}
                  onResult={(c) => { set({ personality: c }); forward('role'); }} />
              </div>
            )}

            {step === 'pick' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('wzPersonalityT', { child: kid })}</h3></div>
                <PersonalityPicker design={guide} value={draft.personality} onPick={(c) => set({ personality: c })} />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => go('personality')}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" disabled={!draft.personality} onClick={() => forward('role')}>{t('useThis')}</button>
                </div>
              </div>
            )}

            {step === 'role' && (
              <div className="wiz-step">
                <Guide design={guide} emotion="love" title={t('wzRoleT')} sub={t('wzRoleB')} />
                <RolePicker value={draft.role} onChange={(role) => set({ role })} autoFocus />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={backToReview ?? (() => go('personality'))}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => forward('language')}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'language' && (
              <div className="wiz-step">
                <Guide design={guide} emotion="curious" title={t('wzLangT')} sub={t('wzLangB')} />
                <LanguagePicker value={draft.language} autoFocus
                  onChange={(language) => set({ language, voice_id: fitVoice(draft.voice_id, d.voices, language, child) })} />
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={backToReview ?? (() => go('role'))}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => forward('character')}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'character' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title" id="wz-char-title">{t('wzCharT', { child: kid })}</h3><p className="muted">{t('wzCharB')}</p></div>
                {quizReady ? (
                  <CharacterPicker characters={rankCharacters(d.characters, quiz)} value={slug} matchSlug={quiz.match?.character?.slug} autoFocus labelledBy="wz-char-title"
                    onChange={(s) => { setSlug(s); setSlugPicked(true); }} />
                ) : quizError ? (
                  <div className="card center">
                    <BuddyFigure design={DEFAULT_DESIGN} emotion="confused" className="figure--md" />
                    <p className="msg msg--bad" role="alert">{errText(quizError)}</p>
                    <button type="button" className="btn btn-pop" data-autofocus onClick={() => setRetry((n) => n + 1)}>{t('tryAgain')}</button>
                  </div>
                ) : (
                  <div className="center pad"><div className="spinner" role="progressbar" aria-label={t('wzCharLoading')} /><p>{t('wzCharLoading')}</p></div>
                )}
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={backToReview ?? (() => go('language'))}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" disabled={!quizReady || !character} onClick={() => { setConfirmed(true); forward('voice'); }}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'voice' && (
              <div className="wiz-step">
                <Guide design={designFor(slug)} emotion="happy" title={t('wzVoiceT', { name: charName })} sub={t('wzVoiceB', { name: charName })} />
                <section className="card pe-section">
                  <p className="pe-label" id="wz-voice">{t('wzVoiceLabel')}</p>
                  <VoicePicker voices={d.voices} own={ownVoicesOf(character)} mode={draft.language} child={child} value={draft.voice_id} autoFocus
                    onChange={(voice_id) => set({ voice_id })} name={charName} labelledBy="wz-voice" />
                </section>
                <div className="wiz-actions wiz-row">
                  <button type="button" className="btn btn-soft btn-lg" onClick={backToReview ?? (() => go('character'))}>{t('back')}</button>
                  <button type="button" className="btn btn-pop btn-lg grow" onClick={() => forward('review')}>{t('next')}</button>
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="wiz-step">
                <div className="wiz-title"><h3 className="step-title">{t('wzReviewT', { child: kid })}</h3><p className="muted">{t('wzReviewB')}</p></div>
                <BuddyReview draft={draft} character={character} voices={d.voices} onEdit={(s) => go(s)} />
                <div className="wiz-actions">
                  {error && <p className="msg msg--bad" role="alert">{error}</p>}
                  <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus disabled={busy || !character} onClick={finish}>{busy ? t('saving') : t('wzSaveBuddy')}</button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="wiz-step wiz-done">
                <span className="wiz-done-figure"><BuddyFigure design={designFor(done?.character_slug ?? slug)} emotion="excited" /></span>
                <div className="card center">
                  <h2>{t('wzReadyT', { name: doneName })}</h2>
                  <p className="muted">{isWeb ? t('wzReadyWebB', { name: doneName }) : t('wzReadyB')}</p>
                  {device && !isWeb && <p className="mono muted small">{device.serial}</p>}
                  {isWeb && webToy && device?.status === 'active' && (
                    <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={() => { onClose(); navigate(`/app/talk?toy=${encodeURIComponent(device.id)}`); }}>
                      {Icon.mic}{t('wzTalkTo', { name: doneName })}
                    </button>
                  )}
                  <button type="button" className={`btn ${isWeb && webToy ? 'btn-soft' : 'btn-pop'} btn-lg btn-block`} data-autofocus={isWeb && webToy ? undefined : true} onClick={onClose}>{t('done')}</button>
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </Layer>
  );
}

// ---------- Buying credits ----------

// The demo checkout: open a purchase, then confirm it the way a payment
// provider would. Where buying is not open yet (production), the sheet says
// so instead of opening a checkout that would only be refused.
export function PayModal({ pack: initial, onClose }) {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const errText = useErrorText();
  const canBuy = useCanBuy();
  const [pack, setPack] = useState(initial ?? d.packs.find((p) => p.id === 'family') ?? d.packs[0] ?? null);
  const [decline, setDecline] = useState(false);
  const [phase, setPhase] = useState(canBuy ? 'confirm' : 'off'); // off | confirm | processing | paid | declined
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
      if (err.code === 'payments_disabled') {
        setPhase('off');
        d.reload();
        return;
      }
      setError(errText(err));
      setPhase('confirm');
    }
  };

  if (phase !== 'off' && !pack) return null;
  return (
    <Layer kind="sheet" onClose={onClose} labelledBy="pay-title" locked={phase === 'processing'}>
      <span className="sheet-grip" aria-hidden="true" />
      <div className="layer-head">
        <h2 id="pay-title">{t('payTitle')}</h2>
        {phase !== 'processing' ? <CloseButton onClick={onClose} /> : <span className="layer-head-gap" />}
      </div>
      <div className="layer-body">
        {phase === 'off' && (
          <div className="pay-result">
            <span className="pay-figure"><BuddyFigure emotion="curious" /></span>
            <h3>{t('wzPayOffT')}</h3>
            <p className="muted">{t('wzPayOffB')}</p>
            {d.wallet && <p><b>{t('wzPayBalance', { b: d.wallet.balance })}</b></p>}
            <button type="button" className="btn btn-pop btn-lg btn-block" data-autofocus onClick={onClose}>{t('done')}</button>
          </div>
        )}
        {phase === 'confirm' && (<>
          {!initial && (
            <div className="pack-pick" role="group" aria-label={t('pack')}>
              {d.packs.map((p) => (
                <button key={p.id} type="button" className="choice pack-choice" aria-pressed={pack.id === p.id} onClick={() => setPack(p)}>
                  <CoinStack credits={p.credits} />
                  <span className="muted small">{packName(p, t)}</span>
                  <b>{t('credits', { n: p.credits })}</b>
                  <span className="pack-choice-price">{vnd(p.price_amount, lang)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="summary">
            <span className="muted">{t('pack')}</span><b>{packName(pack, t)}</b>
            <span className="muted">{t('add')}</span><b>+{t('credits', { n: pack.credits })}</b>
            <span className="summary-total">{t('total')}</span><b className="summary-price">{vnd(pack.price_amount, lang)}</b>
          </div>
          <div className="banner banner--warn">{Icon.alert}<span>{t('payNote')}</span></div>
          <label className="check" htmlFor="decline"><input id="decline" type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} /> {t('payDecline')}</label>
          {error && <p className="msg msg--bad" role="alert">{error}</p>}
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

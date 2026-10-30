import { useEffect, useRef, useState } from 'react';
import { BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Icon, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { LANGUAGE_MODES, toyView } from '../lib/buddy.js';
import { Link, navigate, useLocation } from '../lib/router.js';
import { useIdleActs, usePetting, usePointerLook } from '../lib/motion.js';
import { STARTLE_MS } from '../lib/catplay.js';
import { normalizeEmotion } from '../lib/emotions.js';
import { useWebToy, webToySupported } from '../talk/useWebToy.js';
import { canListen, canSend, gateFor, tapAction } from '../talk/machine.js';
import { micSupported } from '../talk/mic.js';
import { PLAYBACK } from '../talk/player.js';
import { useFamilyData, useLayers } from './data.jsx';
import '../styles/talk-v2.css';

// The Talk screen: the browser plays one of the family's web Buddies,
// hands-free, over backend-v2's toy protocol. Buddy fills its room as in a
// talking-pet game, drawn as its character; the mic opens on arrival, the
// child just talks, and after a pause Buddy answers aloud. No words cross
// the wire to the page, so nothing of the conversation is written here.
// Buddy can be petted and has small moves of its own while it waits
// (lib/catplay.js). Every answer goes through the same gate and credits as a
// physical toy, and whatever would only get the napping clip (asleep, no
// Buddy yet, no credits) is said up front, with the way out.

// Typed turns reach Buddy only where the server allows them, which
// production refuses, so the keyboard and the log behind it are a
// development aid.
const TYPING = import.meta.env.DEV;

const TOY_PHASE = {
  idle: 'idle', denied: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  answered: 'answer', speaking: 'answer',
  connecting: 'rest', asleep: 'rest', offline: 'rest', replaced: 'rest',
};

const DOT = { listening: 'listening', thinking: 'thinking', answered: 'answer', speaking: 'answer' };
const RESTING = new Set(['asleep', 'offline', 'replaced']);
const LANG_SHORT = { vi: 'VI', en: 'EN', bilingual: 'VI+EN' };

function faceFor(state) {
  switch (state.status) {
    case 'connecting': return 'neutral';
    case 'asleep':
    case 'replaced': return 'sleepy';
    case 'offline': return 'confused';
    case 'listening': return 'listening';
    case 'thinking': return 'thinking';
    default: return state.emotion;
  }
}

// What a clip says on a toy, as a line on the screen.
function useClipText() {
  const { t } = useI18n();
  return (clip, name) => {
    switch (clip) {
      case 'napping': return t('talkClipNapping', { name });
      case 'sleepy': return t('talkClipSleepy', { name });
      case 'didnt_catch': return t('talkClipDidntCatch', { name });
      default: return '';
    }
  };
}

function useStatusText(state, name) {
  const { t } = useI18n();
  const clipText = useClipText();
  switch (state.status) {
    case 'connecting': return t('talkConnecting', { name });
    case 'idle':
      if (state.mic === 'on') return t('talkSpeakNow', { name });
      if (state.mic === 'opening') return t('talkMicOpening');
      if (state.sleepy === 'quiet') return t('talkSleepyQuiet', { name });
      if (state.sleepy === 'limit') return t('talkSleepyLimit', { name });
      return t('talkMuted', { name });
    case 'listening': return t('talkListening', { name });
    case 'thinking': return state.mode === 'buddy' ? t('talkBuddyFirst', { name }) : t('talkThinking', { name });
    case 'answered': return t('talkAnswered', { name });
    case 'speaking': return t('talkSpeaking', { name });
    case 'denied':
      // A tap opened the mic again after the refusal: say it listens; the
      // reason stays below as a hint.
      if (state.mic === 'on') return t('talkSpeakNow', { name });
      if (state.mic === 'opening') return t('talkMicOpening');
      return clipText(state.clip, name) || t('talkDenied', { name });
    case 'asleep': return t('talkAsleep', { name });
    case 'replaced': return t('talkReplaced', { name });
    default: return t('talkOffline', { name });
  }
}

// What the big button would do, as its label.
function useTapLabel(action, name) {
  const { t } = useI18n();
  switch (action) {
    case 'listen': return t('talkUnmute');
    case 'end': return t('talkSendNow');
    case 'interrupt': return t('talkInterrupt', { name });
    case 'mute': return t('talkMute');
    default: return t('talkMicBusy', { name });
  }
}

function useErrorHint(code, name) {
  const { t } = useI18n();
  const errText = useErrorText();
  switch (code) {
    case null:
    case undefined:
    case 'offline':
    case 'stream_failed':
    case 'bad_message':
      return '';
    case 'mic_denied': return t('talkErr_mic_denied');
    case 'mic_unavailable': return t('talkErr_mic_unavailable');
    case 'insecure': return t('talkInsecure', { name });
    case 'auth_failed': return t('talkErr_auth_failed', { name });
    case 'slow_down': return t('talkErr_slow_down', { name });
    case 'protocol': return t('talkErr_protocol');
    default: return errText({ code });
  }
}

function useLangName() {
  const { t } = useI18n();
  return (mode) => (mode === 'en' ? t('talkLangEn') : mode === 'bilingual' ? t('talkLangBoth') : t('talkLangVi'));
}

// The conversation language as one round button, like the toy's own
// switch: each tap moves the child's Buddy to the next of Vietnamese,
// English and both (answering in whichever the child just used).
function LanguageButton({ child, buddy, name }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const langName = useLangName();
  const [busy, setBusy] = useState(false);
  const current = LANGUAGE_MODES.includes(buddy.language_mode) ? buddy.language_mode : 'vi';
  const next = LANGUAGE_MODES[(LANGUAGE_MODES.indexOf(current) + 1) % LANGUAGE_MODES.length];

  const flip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        await api.updateBuddy(child.id, { language_mode: next }, buddy.etag);
      } catch (err) {
        // Changed meanwhile (the drawer, another parent): the switch still
        // means the same thing, so it is said again on the fresh etag.
        if (err.status !== 412) throw err;
        const fresh = await api.buddy(child.id);
        if (!fresh) throw err;
        await api.updateBuddy(child.id, { language_mode: next }, fresh.etag);
      }
      await d.reload();
      toast(next === 'bilingual' ? t('talkLangNowBoth', { name }) : t('talkLangNowOne', { name, lang: langName(next) }));
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`round round--text ${current === 'bilingual' ? 'talk-lang--both' : ''}`} disabled={busy} onClick={flip}
      aria-label={t('talkLangAria', { lang: langName(current) })} title={t('talkLangHelp', { name })}>
      {LANG_SHORT[current]}
    </button>
  );
}

// In place of the mic when every answer would be the napping clip: why,
// and the one thing that fixes it.
function TalkGate({ kind, device, child, name }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const { openAdd, openPay } = useLayers();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);

  const wake = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.resume(device.id);
      await d.reload();
      toast(t('talkWoke', { name }));
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };

  let title;
  let body;
  let action = null;
  switch (kind) {
    case 'credits':
      title = t('talkGateCreditsT');
      body = t('talkGateCreditsB', { name });
      action = d.me?.payments === 'disabled'
        ? <p className="talk-gate-note">{t('talkGateNoPay')}</p>
        : <button type="button" className="btn btn-gold" onClick={() => openPay(null)}>{Icon.plus}{t('talkGateBuy')}</button>;
      break;
    case 'paused':
      title = t('talkGatePausedT', { name });
      body = t('talkGatePausedB', { name });
      action = (
        <button type="button" className="btn btn-pop" onClick={wake} disabled={busy}>
          {Icon.sun}{busy ? t('talkWaking') : t('talkGateWake', { name })}
        </button>
      );
      break;
    case 'held':
      title = t('talkGateHeldT', { name });
      body = t('talkGateHeldB', { name });
      break;
    case 'setup':
      title = child ? t('talkGateSetupT', { child: child.name }) : t('talkGateReadyT');
      body = t('talkGateSetupB');
      action = <button type="button" className="btn btn-pop" onClick={() => openAdd(child?.id)}>{Icon.spark}{t('talkGateSetup')}</button>;
      break;
    default:
      title = t('talkGateAsleepT', { name });
      body = t('talkGateAsleepB', { name });
      action = <Link className="btn btn-soft" to="/app/toys">{t('talkGoToys')}</Link>;
  }

  return (
    <section className="talk-gate" aria-labelledby="talk-gate-title" aria-live="polite">
      <h2 id="talk-gate-title">{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

// The log is a development aid (see TYPING): what was typed, and what the
// server said back without words (a face, a clip).
function Bubble({ m, name }) {
  const { t } = useI18n();
  const clipText = useClipText();
  if (m.from === 'system') return <p className="chat-divider"><span>{t('talkNewConvStarted')}</span></p>;
  if (m.from === 'child') {
    return (
      <p className="msg-bubble msg-bubble--child">
        <span className="who">{m.voice ? t('talkVoiceWho') : t('talkTyped')}</span>
        {m.voice ? t('talkVoiceTurn') : m.text}
      </p>
    );
  }
  return (
    <p className={`msg-bubble msg-bubble--buddy ${m.clip ? 'msg-bubble--rest' : ''}`}>
      <span className="who">{name} · {t(`emo_${normalizeEmotion(m.emotion)}`)}</span>
      {m.clip ? clipText(m.clip, name) || t('talkDenied', { name }) : m.kind === 'greet' ? t('talkGreeted') : t('talkAnsweredAloud')}
    </p>
  );
}

// Buddy's voice starts a moment after its first frame arrives (the player's
// lead), so the mouth waits as long before it moves; it stops at once.
function useLagged(on, ms) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) {
      setLate(false);
      return undefined;
    }
    const timer = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on && late;
}

// Miu wakes with a start when something happens while it dozes.
function useStartle(drowsy) {
  const [startled, setStartled] = useState(false);
  const wasDrowsy = useRef(false);
  useEffect(() => {
    const was = wasDrowsy.current;
    wasDrowsy.current = drowsy;
    if (!was || drowsy) return undefined;
    setStartled(true);
    const timer = setTimeout(() => setStartled(false), STARTLE_MS);
    return () => clearTimeout(timer);
  }, [drowsy]);
  return startled;
}

function TalkRoom({ device, toys }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const { openToy } = useLayers();
  const { child, buddy, name, design } = toyView(device, d.children, d.buddies);
  const balance = d.wallet?.balance ?? null;
  const gate = gateFor({ device, child, buddy, balance });
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const micRef = useRef(null);
  const look = usePointerLook(stageRef);
  const [text, setText] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const mic = micSupported();
  const secure = webToySupported();
  const awake = device.status === 'active';

  const toy = useWebToy(device.id, {
    enabled: awake,
    hold: gate !== null,
    // A turn only moves the wallet and the activity: the light refresh, not
    // a full reload, and it knows which results changed anything.
    onSettled: (msg) => d.refreshAfterTurn?.(msg.result),
    onBlocked: () => d.reload(),
  });
  const { state, onLevel } = toy;

  // The mic ring, Buddy's tummy glow and its body follow the level without
  // re-rendering 50 times a second: it goes straight into a CSS variable.
  useEffect(() => onLevel((level) => {
    sceneRef.current?.style.setProperty('--level', level.toFixed(3));
  }), [onLevel]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, state.status, logOpen]);

  // The gate's button (wake, buy, finish setup) goes away with the gate, and
  // focus with it; the mic is what there is to do next.
  const gated = useRef(gate !== null);
  useEffect(() => {
    const was = gated.current;
    gated.current = gate !== null;
    if (was && !gate && (!document.activeElement || document.activeElement === document.body)) micRef.current?.focus({ preventScroll: true });
  }, [gate]);

  // Buddy naps while something stands in the way, once its last words (if
  // any) have been said.
  const napping = gate !== null && !state.playing;
  const resting = napping || RESTING.has(state.status);

  // Cat life: petting wins over everything, then a doze or its wake, then
  // whatever the conversation says.
  const petting = usePetting(stageRef);
  const free = canListen(state) && !napping;
  const { act, drowsy } = useIdleActs(free && !petting);
  const startled = useStartle(drowsy);

  const status = useStatusText(state, name);
  const hint = useErrorHint(state.error, name);
  const clipText = useClipText();
  const action = tapAction(state);
  const tapLabel = useTapLabel(action, name);
  const sendable = canSend(state) && !gate;
  const face = petting ?? (startled ? 'surprised' : drowsy ? 'sleepy' : napping ? 'sleepy' : faceFor(state));
  const phase = napping ? 'rest' : (TOY_PHASE[state.status] ?? 'rest');
  const typing = state.status === 'thinking' && state.mode === 'text';
  const listening = state.status === 'listening';
  const talking = useLagged(state.status === 'speaking', PLAYBACK.leadSec * 1000);
  const micOn = state.mic === 'on';
  const figureClass = [act && `miu-act-${act}`, petting && 'miu-petting', talking && 'is-talking'].filter(Boolean).join(' ');
  const follows = (phase === 'idle' || phase === 'listening') && !petting && !drowsy;
  const dot = napping ? 'rest' : (DOT[state.status] ?? (resting ? 'rest' : 'idle'));
  // The last clip as a hint while the chip says something else: nothing was
  // heard, or the mic is open again after a refusal.
  const clipHint = (state.status === 'idle' && state.clip === 'didnt_catch') || (state.status === 'denied' && state.mic !== 'off')
    ? clipText(state.clip, name) : '';
  // The last turn was given up on: said while Buddy listens again, or
  // reconnects first.
  const stallHint = state.notice === 'stalled' && (state.status === 'idle' || state.status === 'connecting')
    ? t('talkStalled', { name }) : '';

  const openTyping = () => {
    setLogOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const tap = () => {
    // No microphone in this browser: in development the button opens the
    // keyboard instead.
    if (!mic && TYPING && action === 'listen') {
      openTyping();
      return;
    }
    toy.tap();
  };

  const submit = (e) => {
    e.preventDefault();
    if (toy.sendText(text)) setText('');
  };

  const nameOf = (x) => {
    const v = toyView(x, d.children, d.buddies);
    return v.child ? t('talkToyOption', { name: v.name, child: v.child.name }) : v.name;
  };
  const micClass = listening ? 'is-live' : micOn ? 'is-on' : action === 'listen' ? 'is-muted' : '';

  return (
    <div className={`talk ${logOpen ? 'talk--log' : ''}`}>
      <Room size="full" scene night={resting} className={`talk-scene talk-scene--${phase}`} ref={sceneRef}>
        <div className="talk-top">
          <Link className="round" to="/app" aria-label={t('back')}>{Icon.back}</Link>
          <div className="talk-plate">
            {toys.length > 1 ? (
              <select className="plate-select" aria-label={t('talkPick')} value={device.id}
                onChange={(e) => navigate(`/app/talk?toy=${encodeURIComponent(e.target.value)}`, { replace: true })}>
                {toys.map((x) => <option key={x.id} value={x.id}>{nameOf(x)}</option>)}
              </select>
            ) : <span className="plate-name">{name}</span>}
            <i className={`plate-dot plate-dot--${dot}`} aria-hidden="true" />
          </div>
          {balance !== null && (
            <Link to="/app/credits" className={`coin-mini ${balance < 1 ? 'is-out' : balance <= 5 ? 'is-low' : ''}`} aria-label={t('talkCredits', { n: balance })}>
              <span className="coin coin--sm" aria-hidden="true"><span>C</span></span><b>{balance}</b>
            </Link>
          )}
        </div>

        <div className="talk-side">
          {child && buddy && <LanguageButton child={child} buddy={buddy} name={name} />}
          <button type="button" className="round" disabled={!canListen(state) || Boolean(gate)} onClick={toy.newConversation} aria-label={t('talkNewConv')} title={t('talkNewConv')}>{Icon.refresh}</button>
          <button type="button" className="round" onClick={() => openToy(device.id)} aria-label={t('talkSettings', { name })} title={t('talkSettings', { name })}>{Icon.sliders}</button>
        </div>

        <div className="scene-stage">
          <span className="room-stage talk-stage" ref={stageRef} aria-label={t('talkPet', { name })} title={t('talkPet', { name })}>
            <BuddyFigure design={design} emotion={face} phase={phase} look={follows ? look : null} dim={resting} className={figureClass} />
          </span>
        </div>

        <div className="scene-ground talk-ground">
          {gate ? (
            <TalkGate kind={gate} device={device} child={child} name={name} />
          ) : (
            <>
              <div className="talk-status" aria-live="polite">
                <p className={`status-chip status-chip--${dot}`}>{status}</p>
                {clipHint && <p className="talk-hint">{clipHint}</p>}
                {stallHint && <p className="talk-hint">{stallHint}</p>}
                {hint && <p className="talk-hint">{hint}</p>}
                {!mic && secure && <p className="talk-hint">{t('talkMicNote', { name })}</p>}
                {RESTING.has(state.status) && awake && secure && (
                  <button type="button" className="btn btn-soft btn-sm" onClick={toy.reconnect}>
                    {state.status === 'replaced' ? t('talkTakeOver') : t('talkReconnect')}
                  </button>
                )}
              </div>

              <div className="talk-controls">
                {TYPING && <button type="button" className="round round--lg talk-type" onClick={openTyping} aria-label={t('talkKeyboard')}>{Icon.keyboard}</button>}
                <button
                  ref={micRef}
                  type="button"
                  className={`mic-btn ${micClass}`}
                  onClick={tap}
                  aria-pressed={micOn || listening}
                  aria-label={tapLabel}
                  title={tapLabel}
                  aria-disabled={!action || (!mic && action === 'listen') || undefined}
                >
                  <span className="mic-ring" aria-hidden="true" />
                  {listening || action === 'interrupt' ? Icon.stop : Icon.mic}
                </button>
                {TYPING && <button type="button" className="round round--lg talk-log-btn" onClick={() => setLogOpen(true)} aria-label={t('talkLog')}>{Icon.chat}</button>}
              </div>
            </>
          )}
        </div>
      </Room>

      {TYPING && (
        <section className="talk-log card" aria-label={t('talkLog')} aria-hidden={!logOpen} inert={!logOpen}>
          <div className="card-head">
            <h2>{t('talkLog')}</h2>
            <button type="button" className="round round--sm talk-log-close" onClick={() => setLogOpen(false)} aria-label={t('talkHideLog')}>{Icon.x}</button>
          </div>
          <p className="talk-dev-note">{t('talkDevNote', { name })}</p>
          <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label={t('talkLog')}>
            {state.messages.length === 0 && !typing && <p className="empty">{t('talkEmpty', { name })}</p>}
            {state.messages.map((m) => <Bubble key={m.id} m={m} name={name} />)}
            {typing && (
              <p className="msg-bubble msg-bubble--buddy msg-bubble--typing" aria-label={t('talkThinking', { name })}>
                <span className="dots"><i /><i /><i /></span>
              </p>
            )}
          </div>
          <form className="chat-input" onSubmit={submit}>
            <label className="sr-only" htmlFor="talk-text">{t('talkInputLabel')}</label>
            <input id="talk-text" ref={inputRef} className="input" value={text} maxLength={2000} autoComplete="off"
              placeholder={t('talkInputPh', { name })} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn btn-pop" disabled={!sendable || !text.trim()}>{t('talkSend')}</button>
          </form>
        </section>
      )}
    </div>
  );
}

function TalkEmpty({ title, body, cta }) {
  return (
    <Room size="lg" night className="talk-empty">
      <span className="room-stage"><BuddyFigure emotion="sleepy" dim phase="rest" /></span>
      <div className="room-card">
        <h2>{title}</h2>
        <p className="muted">{body}</p>
        {cta}
      </div>
    </Room>
  );
}

export default function Talk() {
  const { t } = useI18n();
  const d = useFamilyData();
  const { openAdd } = useLayers();
  const { search } = useLocation();
  const wanted = search.get('toy');

  // Only a Buddy that lives in the browser can be played here. ?toy= picks
  // one; otherwise the first awake one, or else the first at all, so a
  // sleeping Buddy is offered a wake-up rather than hidden.
  const web = d.devices.filter((x) => x.hardware_rev === 'web' && x.status !== 'revoked');
  const selected = web.find((x) => x.id === wanted)
    ?? web.find((x) => x.status === 'active')
    ?? web[0]
    ?? null;
  // The picker lists awake Buddies, plus the chosen one while it sleeps so
  // the screen can say so instead of silently switching.
  const toys = web.filter((x) => x.status === 'active' || x.id === selected?.id);

  useEffect(() => {
    if (selected && selected.id !== wanted) navigate(`/app/talk?toy=${encodeURIComponent(selected.id)}`, { replace: true });
  }, [selected, wanted]);

  if (d.me && d.me.web_toy === false) return <TalkEmpty title={t('talkOffT')} body={t('talkOffB')} />;
  if (!selected) {
    return (
      <TalkEmpty title={t('talkNoWebT')} body={t('talkNoWebB')}
        cta={<button type="button" className="btn btn-pop" onClick={() => openAdd()}>{Icon.plus}{t('talkMakeWeb')}</button>} />
    );
  }
  // key: a different toy is a different device session from scratch.
  return <TalkRoom key={selected.id} device={selected} toys={toys} />;
}

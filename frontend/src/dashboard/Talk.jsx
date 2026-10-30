import { useEffect, useRef, useState } from 'react';
import { BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Icon, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Link, navigate, useLocation } from '../lib/router.js';
import { usePointerLook } from '../lib/motion.js';
import { normalizeEmotion } from '../lib/emotions.js';
import { designOf } from '../lib/designs.js';
import { useWebToy, webToySupported } from '../talk/useWebToy.js';
import { canSend, tapAction } from '../talk/machine.js';
import { micSupported } from '../talk/mic.js';
import { useFamilyData, useLayers } from './data.jsx';
import { Onboard, useToyName } from './parts.jsx';

// The Talk screen: the browser plays the chosen toy. Buddy fills its room,
// as in a talking-pet game, with round buttons around it and one big button
// to talk (tap, talk, the toy notices the end of speech). The conversation
// as text sits beside the room on a wide screen and slides up over it on a
// phone, with a box to type instead of talking. Every answer goes through
// the same gate and credits as the real toy.

const TOY_PHASE = {
  idle: 'idle', denied: 'idle',
  starting: 'thinking', thinking: 'thinking', cancelling: 'idle',
  listening: 'listening',
  answered: 'answer', speaking: 'answer',
  connecting: 'rest', asleep: 'rest', offline: 'rest',
};

const DOT = { listening: 'listening', starting: 'thinking', thinking: 'thinking', answered: 'answer', speaking: 'answer' };

function faceFor(state) {
  if (state.status === 'connecting') return 'neutral';
  if (state.status === 'asleep') return 'sleepy';
  if (state.status === 'offline') return 'confused';
  if (state.status === 'listening') return 'listening';
  if (state.status === 'thinking' || state.status === 'starting') return 'thinking';
  return state.emotion;
}

function useStatusText(state, name) {
  const { t } = useI18n();
  switch (state.status) {
    case 'connecting': return t('talkConnecting', { name });
    case 'idle': return t('talkIdle', { name });
    case 'starting': return t('talkStarting', { name });
    case 'cancelling': return t('talkCancelling');
    case 'listening': return state.heardSpeech ? t('talkListening', { name }) : t('talkSpeakNow', { name });
    case 'thinking': return t('talkThinking', { name });
    case 'answered': return t('talkAnswered', { name });
    case 'speaking': return t('talkSpeaking', { name });
    case 'denied': return t('talkDenied', { name });
    case 'asleep': return t('talkAsleep', { name });
    default: return t('talkOffline', { name });
  }
}

function useErrorHint(code, name) {
  const { t } = useI18n();
  const errText = useErrorText();
  if (!code || code === 'no_turn' || code === 'stream_failed' || code === 'offline') return '';
  switch (code) {
    case 'mic_denied': return t('talkErr_mic_denied');
    case 'mic_unavailable': return t('talkErr_mic_unavailable');
    case 'no_speech': return t('talkErr_no_speech', { name });
    case 'turn_in_flight': return t('talkErr_turn_in_flight', { name });
    case 'insecure': return t('talkInsecure', { name });
    default: return errText({ code });
  }
}

// The conversation language as one round button, VI or EN, like the toy's
// own switch.
function LanguageButton({ device, disabled }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  const current = device.profile?.language ?? 'vi';
  const next = current === 'vi' ? 'en' : 'vi';
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.updateProfile(device.id, { language: next });
      await d.reload();
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="round round--text" disabled={busy || disabled} onClick={flip}
      aria-label={`${t('convLang')}: ${current === 'vi' ? t('langVi') : t('langEn')}`} title={t('convLangHelp')}>
      {current.toUpperCase()}
    </button>
  );
}

function Bubble({ m, buddyName }) {
  const { t } = useI18n();
  if (m.from === 'system') return <p className="chat-divider"><span>{t('talkNewConvStarted')}</span></p>;
  if (m.from === 'child') {
    return (
      <p className="msg-bubble msg-bubble--child">
        <span className="who">{m.voice ? t('talkHeard', { name: buddyName }) : t('talkTyped')}</span>
        {m.text}
      </p>
    );
  }
  return (
    <p className={`msg-bubble msg-bubble--buddy ${m.denied ? 'msg-bubble--rest' : ''}`}>
      <span className="who">{buddyName} · {t(`emo_${normalizeEmotion(m.emotion)}`)}</span>
      {m.text}
    </p>
  );
}

function TalkRoom({ device, toys }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const { openToy } = useLayers();
  const nameOf = useToyName();
  const buddyName = device.profile?.name || 'Buddy';
  const design = designOf(device);
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const look = usePointerLook(stageRef);
  const [text, setText] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const mic = micSupported();
  const secure = webToySupported();

  const toy = useWebToy(device.id, {
    enabled: device.status === 'active',
    onSettled: () => d.reload(),
    onBlocked: () => d.reload(),
  });
  const { state, onLevel } = toy;

  // The mic ring and Buddy's tummy glow follow the level without
  // re-rendering 50 times a second: it goes straight into a CSS variable.
  useEffect(() => onLevel((level) => {
    sceneRef.current?.style.setProperty('--level', level.toFixed(3));
  }), [onLevel]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, state.status, logOpen]);

  const status = useStatusText(state, buddyName);
  const hint = useErrorHint(state.error, buddyName);
  const action = tapAction(state);
  const sendable = canSend(state);
  const face = faceFor(state);
  const phase = TOY_PHASE[state.status] ?? 'rest';
  const typing = state.status === 'thinking' || (state.status === 'starting' && state.mode === 'text');
  const resting = state.status === 'asleep' || state.status === 'offline';
  const listening = state.status === 'listening';

  const lastBuddy = [...state.messages].reverse().find((m) => m.from === 'buddy');
  const lastChild = [...state.messages].reverse().find((m) => m.from === 'child');

  const openTyping = () => {
    setLogOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const tap = () => {
    if (!mic && action !== 'end') {
      openTyping();
      return;
    }
    toy.tap();
  };

  const submit = (e) => {
    e.preventDefault();
    if (toy.sendText(text)) setText('');
  };

  const balance = d.wallet?.balance ?? null;

  return (
    <div className={`talk ${logOpen ? 'talk--log' : ''}`}>
      <Room size="full" scene night={resting} className={`talk-scene talk-scene--${phase}`} ref={sceneRef}>
        <div className="talk-top">
          <Link className="round" to="/app" aria-label={t('back')}>{Icon.back}</Link>
          <div className="talk-plate">
            {toys.length > 1 ? (
              <select className="plate-select" aria-label={t('talkPick')} value={device.id}
                onChange={(e) => navigate(`/app/talk?toy=${encodeURIComponent(e.target.value)}`, { replace: true })}>
                {toys.map((x) => <option key={x.id} value={x.id}>{nameOf(x, d.children)}</option>)}
              </select>
            ) : <span className="plate-name">{buddyName}</span>}
            <i className={`plate-dot plate-dot--${DOT[state.status] ?? (resting ? 'rest' : 'idle')}`} aria-hidden="true" />
          </div>
          {balance !== null && (
            <Link to="/app/credits" className={`coin-mini ${balance === 0 ? 'is-out' : balance <= 5 ? 'is-low' : ''}`} aria-label={`${t('balLabel')}: ${balance}`}>
              <span className="coin coin--sm" aria-hidden="true"><span>C</span></span><b>{balance}</b>
            </Link>
          )}
        </div>

        <div className="talk-side">
          <LanguageButton device={device} disabled={device.status === 'revoked'} />
          <button type="button" className="round" disabled={!sendable || state.messages.length === 0} onClick={toy.newConversation} aria-label={t('talkNewConv')}>{Icon.refresh}</button>
          <button type="button" className="round" onClick={() => openToy(device.id)} aria-label={t('profileTitle')}>{Icon.sliders}</button>
        </div>

        <div className="talk-say" aria-hidden="true">
          {lastChild && !listening && <span className="heard-chip">{lastChild.voice ? t('talkHeard', { name: buddyName }) : t('talkTyped')}: {lastChild.text}</span>}
          {typing && <span className="say-bubble say-bubble--dots"><span className="dots"><i /><i /><i /></span></span>}
          {!typing && lastBuddy && !listening && <span key={lastBuddy.id} className={`say-bubble pop-in ${lastBuddy.denied ? 'say-bubble--rest' : ''}`}>{lastBuddy.text}</span>}
        </div>

        <div className="scene-stage">
          <span className="room-stage talk-stage" ref={stageRef}>
            <BuddyFigure design={design} emotion={face} phase={phase} look={phase === 'idle' ? look : null} dim={resting} />
          </span>
        </div>

        <div className="scene-ground talk-ground">
          <div className="talk-status" aria-live="polite">
            <p className={`status-chip status-chip--${DOT[state.status] ?? (resting ? 'rest' : 'idle')}`}>{status}</p>
            {hint && <p className="talk-hint">{hint}</p>}
            {!mic && secure && <p className="talk-hint">{t('talkMicNote')}</p>}
            {resting && device.status === 'active' && secure && (
              <button type="button" className="btn btn-soft btn-sm" onClick={toy.reconnect}>{t('talkReconnect')}</button>
            )}
            {state.status === 'asleep' && device.status !== 'active' && (
              <Link className="btn btn-pop btn-sm" to="/app/toys">{t('talkGoToys')}</Link>
            )}
          </div>

          <div className="talk-controls">
            <button type="button" className="round round--lg talk-type" onClick={openTyping} aria-label={t('talkKeyboard')}>{Icon.keyboard}</button>
            <button
              type="button"
              className={`mic-btn ${listening ? 'is-on' : ''}`}
              onClick={tap}
              aria-pressed={listening}
              aria-label={listening ? t('toyTapStop') : t('talkTapStart', { name: buddyName })}
              aria-disabled={!action || undefined}
            >
              <span className="mic-ring" aria-hidden="true" />
              {listening ? Icon.stop : Icon.mic}
            </button>
            <button type="button" className="round round--lg talk-log-btn" onClick={() => setLogOpen(true)} aria-label={t('talkLog')}>{Icon.chat}</button>
          </div>
          <p className="talk-note">{t('talkDemoNote')}</p>
        </div>
      </Room>

      <section className="talk-log card" aria-label={t('talkLog')}>
        <div className="card-head">
          <h2>{t('talkLog')}</h2>
          <button type="button" className="round round--sm talk-log-close" onClick={() => setLogOpen(false)} aria-label={t('talkHideLog')}>{Icon.x}</button>
        </div>
        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label={t('talkLog')}>
          {state.messages.length === 0 && !typing && <p className="empty">{t('talkEmpty', { name: buddyName })}</p>}
          {state.messages.map((m) => <Bubble key={m.id} m={m} buddyName={buddyName} />)}
          {typing && (
            <p className="msg-bubble msg-bubble--buddy msg-bubble--typing" aria-label={t('talkThinking', { name: buddyName })}>
              <span className="dots"><i /><i /><i /></span>
            </p>
          )}
        </div>
        <form className="chat-input" onSubmit={submit}>
          <label className="sr-only" htmlFor="talk-text">{t('talkInputLabel')}</label>
          <input id="talk-text" ref={inputRef} className="input" value={text} maxLength={2000} autoComplete="off"
            placeholder={t('talkInputPh', { name: buddyName })} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn btn-pop" disabled={!sendable || !text.trim()}>{t('talkSend')}</button>
        </form>
      </section>
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
  const { search } = useLocation();
  const wanted = search.get('toy');

  const selected = d.devices.find((x) => x.id === wanted && x.status !== 'revoked')
    ?? d.devices.find((x) => x.status === 'active')
    ?? null;
  // The picker lists awake toys, plus the chosen one while it sleeps so
  // the screen can say so instead of silently switching toys.
  const toys = d.devices.filter((x) => x.status === 'active' || x.id === selected?.id);

  useEffect(() => {
    if (selected && selected.id !== wanted) navigate(`/app/talk?toy=${encodeURIComponent(selected.id)}`, { replace: true });
  }, [selected, wanted]);

  if (d.me && d.me.web_toy === false) return <TalkEmpty title={t('talkOffT')} body={t('talkOffB')} />;
  if (!d.devices.length) return <Onboard />;
  if (!selected) {
    return <TalkEmpty title={t('talkNoToyT')} body={t('talkNoToyB')} cta={<Link className="btn btn-pop" to="/app/toys">{t('talkGoToys')}</Link>} />;
  }
  // key: a different toy is a different device session from scratch.
  return <TalkRoom key={selected.id} device={selected} toys={toys} />;
}

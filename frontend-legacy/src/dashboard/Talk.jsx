import { useEffect, useRef, useState } from 'react';
import BuddyScreen from '../components/buddy/BuddyScreen.jsx';
import ToyShell from '../components/ToyShell.jsx';
import { Icon, Pill, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Link, navigate, useLocation } from '../lib/router.js';
import { usePointerLook } from '../lib/motion.js';
import { normalizeEmotion } from '../lib/emotions.js';
import { designOf } from '../lib/designs.js';
import { useWebToy, webToySupported } from '../talk/useWebToy.js';
import { canSend, tapAction } from '../talk/machine.js';
import { micSupported } from '../talk/mic.js';
import { useFamilyData } from './data.jsx';
import { Onboard, useToyName } from './parts.jsx';

// The Talk screen: the browser plays the chosen toy. Left, Buddy's body
// with the real button (tap to talk, the toy notices the end of speech);
// right, the conversation as text, with a box to type instead of talking.
// Every answer goes through the same gate and credits as the real toy.

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

function LanguageSwitch({ device, disabled }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  const current = device.profile?.language ?? 'vi';
  const pick = async (language) => {
    if (language === current || busy) return;
    setBusy(true);
    try {
      await api.updateProfile(device.id, { language });
      await d.reload();
    } catch (err) {
      toast(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="seg seg--sm" role="group" aria-label={t('convLang')} title={t('convLangHelp')}>
      {['vi', 'en'].map((code) => (
        <button key={code} type="button" aria-pressed={current === code} disabled={busy || disabled} onClick={() => pick(code)}>
          {code === 'vi' ? t('langVi') : t('langEn')}
        </button>
      ))}
    </div>
  );
}

function Bubble({ m, buddyName }) {
  const { t } = useI18n();
  if (m.from === 'system') return <p className="chat-divider"><span>{t('talkNewConvStarted')}</span></p>;
  if (m.from === 'child') {
    return (
      <p className="bubble bubble--child">
        <span className="who">{m.voice ? t('talkHeard', { name: buddyName }) : t('talkTyped')}</span>
        {m.text}
      </p>
    );
  }
  return (
    <p className={`bubble bubble--buddy ${m.denied ? 'bubble--rest' : ''}`}>
      <span className="who">{buddyName} · {t(`emo_${normalizeEmotion(m.emotion)}`)}</span>
      {m.text}
    </p>
  );
}

function TalkRoom({ device, toys }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const nameOf = useToyName();
  const buddyName = device.profile?.name || 'Buddy';
  const design = designOf(device);
  const stageRef = useRef(null);
  const ringRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const look = usePointerLook(stageRef);
  const [text, setText] = useState('');
  const mic = micSupported();
  const secure = webToySupported();

  const toy = useWebToy(device.id, {
    enabled: device.status === 'active',
    onSettled: () => d.reload(),
    onBlocked: () => d.reload(),
  });
  const { state, onLevel } = toy;

  // The ring follows the mic level without re-rendering the screen 50
  // times a second: the level goes straight into a CSS variable.
  useEffect(() => onLevel((level) => {
    ringRef.current?.style.setProperty('--level', level.toFixed(3));
  }), [onLevel]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, state.status]);

  const status = useStatusText(state, buddyName);
  const hint = useErrorHint(state.error, buddyName);
  const action = tapAction(state);
  const sendable = canSend(state);
  const face = faceFor(state);
  const phase = TOY_PHASE[state.status] ?? 'rest';
  const typing = state.status === 'thinking' || (state.status === 'starting' && state.mode === 'text');

  const tap = () => {
    if (!mic && action !== 'end') {
      inputRef.current?.focus();
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
    <div className="talk-layout">
      <section className="talk-stage" ref={stageRef} aria-label={t('talkTo', { name: buddyName })}>
        <ToyShell
          design={design}
          phase={phase}
          emotion={face}
          look={phase === 'idle' ? look : null}
          onTap={tap}
          pressed={state.status === 'listening'}
          label={state.status === 'listening' ? t('toyTapStop') : t('talkTapStart', { name: buddyName })}
          busy={!action}
          live
          dim={state.status === 'asleep' || state.status === 'offline'}
          ringRef={ringRef}
        />
        <div className="talk-status" aria-live="polite">
          <p className="status"><i className={`status-dot status-dot--${DOT[state.status] ?? 'idle'}`} />{status}</p>
          {hint && <p className="talk-hint">{hint}</p>}
          {!mic && secure && <p className="talk-hint">{t('talkMicNote')}</p>}
          {(state.status === 'offline' || state.status === 'asleep') && device.status === 'active' && secure && (
            <button type="button" className="btn ghost-light sm" onClick={toy.reconnect}>{t('talkReconnect')}</button>
          )}
          {state.status === 'asleep' && device.status !== 'active' && (
            <Link className="btn ghost-light sm" to="/app/toys">{t('talkGoToys')}</Link>
          )}
        </div>
      </section>

      <section className="panel chat" aria-label={t('nav_talk')}>
        <div className="chat-head">
          <div className="chat-who">
            <span className={`chip-screen chip-screen--sm ${state.status === 'asleep' ? 'dim' : ''}`}><BuddyScreen design={design} emotion={face} dim={state.status === 'asleep'} /></span>
            <div className="chat-name">
              {toys.length > 1 ? (
                <select className="input input--auto chat-pick" aria-label={t('talkPick')} value={device.id}
                  onChange={(e) => navigate(`/app/talk?toy=${encodeURIComponent(e.target.value)}`, { replace: true })}>
                  {toys.map((x) => <option key={x.id} value={x.id}>{nameOf(x, d.children)}</option>)}
                </select>
              ) : <b>{nameOf(device, d.children)}</b>}
              <span className="feed-sub">{t('talkDemoNote')}</span>
            </div>
          </div>
          <div className="chat-tools">
            <LanguageSwitch device={device} disabled={device.status === 'revoked'} />
            {balance !== null && (
              <Pill tone={balance === 0 ? 'bad' : balance <= 5 ? 'warn' : 'ok'} icon={Icon.coin}>
                <span className="sr-only">{t('balLabel')}: </span>{t('credits', { n: balance })}
              </Pill>
            )}
            <button type="button" className="btn ghost sm" disabled={!sendable || state.messages.length === 0} onClick={toy.newConversation}>
              {t('talkNewConv')}
            </button>
          </div>
        </div>

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label={t('talkLog')}>
          {state.messages.length === 0 && !typing && <p className="empty">{t('talkEmpty', { name: buddyName })}</p>}
          {state.messages.map((m) => <Bubble key={m.id} m={m} buddyName={buddyName} />)}
          {typing && (
            <p className="bubble bubble--buddy bubble--typing" aria-label={t('talkThinking', { name: buddyName })}>
              <span className="dots"><i /><i /><i /></span>
            </p>
          )}
        </div>

        <form className="chat-input" onSubmit={submit}>
          <label className="sr-only" htmlFor="talk-text">{t('talkInputLabel')}</label>
          <input id="talk-text" ref={inputRef} className="input" value={text} maxLength={2000} autoComplete="off"
            placeholder={t('talkInputPh', { name: buddyName })} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn pop" disabled={!sendable || !text.trim()}>{t('talkSend')}</button>
        </form>
      </section>
    </div>
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

  if (d.me && d.me.web_toy === false) {
    return (
      <section className="panel center pad">
        <span className="chip-screen chip-screen--xl dim"><BuddyScreen emotion="sleepy" dim /></span>
        <h2>{t('talkOffT')}</h2>
        <p className="muted">{t('talkOffB')}</p>
      </section>
    );
  }
  if (!d.devices.length) return <Onboard />;
  if (!selected) {
    return (
      <section className="panel center pad">
        <span className="chip-screen chip-screen--xl dim"><BuddyScreen emotion="sleepy" dim /></span>
        <h2>{t('talkNoToyT')}</h2>
        <p className="muted">{t('talkNoToyB')}</p>
        <Link className="btn pop" to="/app/toys">{t('talkGoToys')}</Link>
      </section>
    );
  }
  // key: a different toy is a different device session from scratch.
  return <TalkRoom key={selected.id} device={selected} toys={toys} />;
}

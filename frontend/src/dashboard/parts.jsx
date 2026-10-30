import { useEffect, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Chip, Coin, Icon, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Link } from '../lib/router.js';
import { relativeTime } from '../lib/format.js';
import { normalizeEmotion } from '../lib/emotions.js';
import { reducedMotion, useCountUp } from '../lib/motion.js';
import { designOf } from '../lib/designs.js';
import { useFamilyData, useLayers } from './data.jsx';

export function childOf(children, id) {
  return children.find((c) => c.id === id) ?? null;
}

export function useToyName() {
  const { t } = useI18n();
  return (device, children) => {
    const c = childOf(children, device.child_id);
    const own = device.profile?.name;
    if (own) return c ? t('buddyOf', { name: own, child: c.name }) : own;
    return c ? t('forChild', { name: c.name }) : t('buddyUnassigned', { serial: device.serial });
  };
}

// The name on its own, and the child it belongs to as a second line.
export function useToyLines() {
  const { t } = useI18n();
  return (device, children) => {
    const c = childOf(children, device.child_id);
    const own = device.profile?.name;
    return {
      name: own || (c ? t('forChild', { name: c.name }) : t('buddyUnassigned', { serial: device.serial })),
      sub: c ? t('forChild', { name: c.name }) : t('noChild'),
    };
  };
}

export function toyLook(device) {
  if (device.status === 'active') return { emotion: 'neutral', dim: false, tone: 'ok', key: 'awake' };
  if (device.status === 'disabled' && device.disabled_by === 'admin') return { emotion: 'sad', dim: true, tone: 'bad', key: 'support' };
  if (device.status === 'revoked') return { emotion: 'sad', dim: true, tone: 'bad', key: 'revoked' };
  return { emotion: 'sleepy', dim: true, tone: 'rest', key: 'resting' };
}

// An awake toy is never quite still: now and then it winks or looks around,
// the way the real screen idles.
const IDLE_MOODS = ['wink', 'curious', 'happy', 'neutral'];
export function useIdleFace(base, enabled) {
  const [face, setFace] = useState(base);
  useEffect(() => {
    setFace(base);
    if (!enabled || reducedMotion()) return undefined;
    let back;
    const id = setInterval(() => {
      setFace(IDLE_MOODS[Math.floor(Math.random() * IDLE_MOODS.length)]);
      back = setTimeout(() => setFace(base), 1800);
    }, 6500 + Math.random() * 4000);
    return () => {
      clearInterval(id);
      clearTimeout(back);
    };
  }, [base, enabled]);
  return face;
}

// Pause and wake from a card, with the same toast and error as the drawer.
export function useToyActions() {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      await d.reload();
      toast(okText);
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    pause: (device) => run(() => api.pause(device.id), t('pausedToast')),
    wake: (device) => run(() => api.resume(device.id), t('wokeToast')),
  };
}

export function BalanceCard({ balance, className = '' }) {
  const { t } = useI18n();
  const shown = useCountUp(balance) ?? 0;
  const { openPay } = useLayers();
  const out = balance === 0;
  const low = balance !== null && balance > 0 && balance <= 5;
  return (
    <section className={`balance ${className}`} aria-label={t('balLabel')}>
      <div className="balance-figure"><BuddyFigure emotion={out ? 'sleepy' : low ? 'curious' : 'love'} /></div>
      <span className="balance-label">{t('balLabel')}</span>
      <div className="balance-num" aria-live="polite"><Coin size="lg" /><b>{shown}</b><small>{t('balUnit')}</small></div>
      <p className="balance-hint">{t('balHint')}</p>
      {(out || low) && <div className={`banner banner--${out ? 'bad' : 'warn'}`}>{Icon.alert}<span>{t(out ? 'outLong' : 'lowLong')}</span></div>}
      <button type="button" className="btn btn-gold" onClick={() => openPay(null)}>{Icon.plus}{t('buy')}</button>
    </section>
  );
}

// One toy: its room, its state and the three things a parent does with it.
export function ToyCard({ device, kids }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const lines = useToyLines()(device, kids);
  const look = toyLook(device);
  const face = useIdleFace(look.emotion, device.status === 'active');
  const { openToy } = useLayers();
  const { busy, pause, wake } = useToyActions();
  const canTalk = device.status === 'active' && d.me?.web_toy === true;
  const parentPaused = device.status === 'disabled' && device.disabled_by === 'parent';
  return (
    <article className="toy-card">
      <div className="toy-card-top">
        <Room size="sm" night={look.dim} className="toy-card-room">
          <span className="room-stage"><BuddyFigure design={designOf(device)} emotion={face} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} /></span>
        </Room>
        <div className="toy-card-text">
          <h3>{lines.name}</h3>
          <span className="muted">{lines.sub}</span>
          <Chip tone={look.tone} dot>{t(look.key)}</Chip>
          <span className="muted small">{t('seen', { t: relativeTime(device.last_seen_at, t) })}</span>
        </div>
      </div>
      <div className="toy-card-actions">
        {canTalk && <Link className="btn btn-pop btn-sm" to={`/app/talk?toy=${encodeURIComponent(device.id)}`}>{Icon.mic}{t('nav_talk')}</Link>}
        {device.status === 'active' && <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => pause(device)}>{t('pause')}</button>}
        {parentPaused && <button type="button" className="btn btn-pop btn-sm" disabled={busy} onClick={() => wake(device)}>{t('wake')}</button>}
        <button type="button" className="btn btn-soft btn-sm" onClick={() => openToy(device.id)}>{t('manage')}</button>
      </div>
    </article>
  );
}

export function AddTile() {
  const { t } = useI18n();
  const { openAdd } = useLayers();
  return (
    <button type="button" className="add-tile" onClick={() => openAdd()}>
      <span className="add-tile-plus">{Icon.plus}</span>
      <span><b>{t('addToy')}</b><span className="muted">{t('codeTitle')}</span></span>
    </button>
  );
}

export function Onboard() {
  const { t } = useI18n();
  const { openAdd } = useLayers();
  const webToy = useFamilyData().me?.web_toy === true;
  return (
    <section className="onboard">
      <Room size="lg" className="onboard-room">
        <span className="room-stage"><BuddyFigure emotion="excited" /></span>
      </Room>
      <div className="onboard-text">
        <h2>{t('onboardT')}</h2>
        <p>{webToy ? t('onboardWebB') : t('onboardB')}</p>
        <button type="button" className="btn btn-pop btn-lg" onClick={() => openAdd()}>{Icon.plus}{t('addToy')}</button>
      </div>
    </section>
  );
}

export function TurnRow({ turn }) {
  const { t } = useI18n();
  // Drawn as the toy that answered; a toy since removed falls back to the default.
  const design = designOf(useFamilyData().devices.find((x) => x.id === turn.device_id));
  const who = turn.child_name ?? turn.device_serial ?? 'Buddy';
  const when = relativeTime(turn.started_at, t);
  if (turn.status === 'completed') {
    const emotion = normalizeEmotion(turn.emotion);
    return (
      <div className="turn">
        <BuddyAvatar design={design} emotion={emotion} />
        <div className="turn-body">
          <div className="turn-head"><b>{t('answered', { name: who })}</b><span className="muted small">{when}</span></div>
          <span className="muted small">{t(`emo_${emotion}`)}</span>
          {turn.answer_text && <p className="turn-quote">{turn.answer_text}</p>}
        </div>
        <span className="tag">-1</span>
      </div>
    );
  }
  const reason = turn.status === 'denied' ? t(`r_${turn.denied_reason}`) : t(`r_${turn.status}`);
  return (
    <div className="turn">
      <BuddyAvatar design={design} emotion={turn.status === 'denied' ? 'sleepy' : 'confused'} dim />
      <div className="turn-body">
        <div className="turn-head"><b>{turn.status === 'accepted' ? t('answering', { name: who }) : t('notAnswered', { name: who })}</b><span className="muted small">{when}</span></div>
        <span className="muted small">{reason}</span>
      </div>
      <span className="tag tag--free">{t('free')}</span>
    </div>
  );
}

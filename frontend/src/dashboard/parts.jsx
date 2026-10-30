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
import { designFor, toyActions, toyView } from '../lib/buddy.js';
import { useFamilyData, useLayers } from './data.jsx';

export function childOf(children, id) {
  return children.find((c) => c.id === id) ?? null;
}

// Buying happens only where the backend takes payments (the demo checkout).
// Production starts with payments off, and then no screen offers to buy.
export function useCanBuy() {
  return useFamilyData()?.me?.payments === 'demo';
}

// A pack's name in the site's language, or the backend's own name for a pack
// the dictionaries do not know yet.
export function packName(pack, t) {
  const key = `pack_${pack.id}`;
  const text = t(key);
  return text === key ? (pack.name ?? pack.id) : text;
}

export function toyLook(device) {
  if (device.status === 'active') return { emotion: 'neutral', dim: false, tone: 'ok', key: 'awake' };
  if (device.status === 'disabled' && device.disabled_by === 'staff') return { emotion: 'sad', dim: true, tone: 'bad', key: 'support' };
  if (device.status === 'revoked') return { emotion: 'sad', dim: true, tone: 'bad', key: 'revoked' };
  return { emotion: 'sleepy', dim: true, tone: 'rest', key: 'resting' };
}

// When the toy was last connected, in words; a toy that never connected
// says so instead of "seen never".
export function useSeenText() {
  const { t } = useI18n();
  return (device) => {
    if (device.online) return t('onlineNow');
    return device.last_seen_at ? t('seen', { t: relativeTime(device.last_seen_at, t) }) : t('neverSeen');
  };
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
  const canBuy = useCanBuy();
  const out = balance === 0;
  const low = balance !== null && balance > 0 && balance <= 5;
  return (
    <section className={`balance ${className}`} aria-label={t('balLabel')}>
      <div className="balance-figure"><BuddyFigure emotion={out ? 'sleepy' : low ? 'curious' : 'love'} /></div>
      <span className="balance-label">{t('balLabel')}</span>
      <div className="balance-num" aria-live="polite"><Coin size="lg" /><b>{shown}</b><small>{t('balUnit')}</small></div>
      <p className="balance-hint">{t('balHint')}</p>
      {(out || low) && <div className={`banner banner--${out ? 'bad' : 'warn'}`}>{Icon.alert}<span>{t(out ? 'outLong' : 'lowLong')}</span></div>}
      {canBuy
        ? <button type="button" className="btn btn-gold" onClick={() => openPay(null)}>{Icon.plus}{t('buy')}</button>
        : <p className="balance-soon">{Icon.spark}<span>{t('buySoon')}</span></p>}
    </section>
  );
}

// One toy: its room, its state and what a parent can do with it now.
export function ToyCard({ device }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const seen = useSeenText();
  const view = toyView(device, d.children, d.buddies);
  const can = toyActions(view, d.me?.web_toy === true);
  const look = toyLook(device);
  const face = useIdleFace(look.emotion, device.status === 'active');
  const { openToy, openAdd } = useLayers();
  const { busy, pause, wake } = useToyActions();
  return (
    <article className="toy-card">
      <div className="toy-card-top">
        <Room size="sm" night={look.dim} className="toy-card-room">
          <span className="room-stage"><BuddyFigure design={view.design} emotion={face} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} /></span>
        </Room>
        <div className="toy-card-text">
          <h3>{view.name}</h3>
          <span className="muted">{view.child ? t('forChild', { name: view.child.name }) : t('noChild')}</span>
          <span className="chips"><Chip tone={look.tone} dot>{t(look.key)}</Chip>{view.web && <Chip tone="pop">{t('webTag')}</Chip>}</span>
          <span className="muted small">{seen(device)}</span>
        </div>
      </div>
      {can.setup && <p className="note">{Icon.spark}<span>{t('needsBuddy')}</span></p>}
      <div className="toy-card-actions">
        {can.talk && <Link className="btn btn-pop btn-sm" to={`/app/talk?toy=${encodeURIComponent(device.id)}`}>{Icon.mic}{t('nav_talk')}</Link>}
        {can.setup && <button type="button" className="btn btn-pop btn-sm" onClick={() => openAdd(view.child.id)}>{Icon.spark}{t('finishSetup')}</button>}
        {can.pause && <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => pause(device)}>{t('pause')}</button>}
        {can.wake && <button type="button" className="btn btn-pop btn-sm" disabled={busy} onClick={() => wake(device)}>{t('wake')}</button>}
        <button type="button" className="btn btn-soft btn-sm" onClick={() => openToy(device.id)}>{t('manage')}</button>
      </div>
    </article>
  );
}

export function AddTile() {
  const { t } = useI18n();
  const { openAdd } = useLayers();
  const webToy = useFamilyData().me?.web_toy === true;
  return (
    <button type="button" className="add-tile" onClick={() => openAdd()}>
      <span className="add-tile-plus">{Icon.plus}</span>
      <span><b>{t('addToy')}</b><span className="muted">{webToy ? t('addTileWeb') : t('codeTitle')}</span></span>
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

// The kind of turn names what Buddy did (told a story, comforted...);
// GET /turns never carries the words.
const TURN_TYPES = new Set(['answer', 'react', 'comfort', 'encourage', 'follow_up', 'share', 'play', 'story', 'teach', 'wind_down', 'greet', 'clarify']);

export function TurnRow({ turn }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const child = childOf(d.children, turn.child_id);
  const buddy = child ? (d.buddies[child.id] ?? null) : null;
  const emotion = normalizeEmotion(turn.face);
  const vars = { buddy: buddy?.character_name ?? 'Buddy', name: child?.name ?? t('yourChild') };
  const what = TURN_TYPES.has(turn.turn_type) ? t(`tt_${turn.turn_type}`, vars) : t('turnTalked', vars);
  return (
    <div className="turn">
      <BuddyAvatar design={designFor(buddy?.character_slug)} emotion={emotion} />
      <div className="turn-body">
        <div className="turn-head"><b>{what}</b><span className="muted small">{relativeTime(turn.created_at, t)}</span></div>
        <span className="muted small">{t(`emo_${emotion}`)}</span>
      </div>
      {turn.charged
        ? <span className="tag"><span aria-hidden="true">-1</span><span className="sr-only">{t('costOne')}</span></span>
        : <span className="tag tag--free">{t('free')}</span>}
    </div>
  );
}

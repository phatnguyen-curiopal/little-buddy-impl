import { useEffect, useState } from 'react';
import Face from '../components/Face.jsx';
import { Icon, Pill } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { relativeTime } from '../lib/format.js';
import { normalizeEmotion } from '../lib/emotions.js';
import { reducedMotion, useCountUp } from '../lib/motion.js';
import { useLayers } from './data.jsx';

export function childOf(children, id) {
  return children.find((c) => c.id === id) ?? null;
}

export function useToyName() {
  const { t } = useI18n();
  return (device, children) => {
    const c = childOf(children, device.child_id);
    return c ? t('forChild', { name: c.name }) : t('buddyUnassigned', { serial: device.serial });
  };
}

export function toyLook(device) {
  if (device.status === 'active') return { emotion: 'neutral', dim: false, tone: 'ok', key: 'awake' };
  if (device.status === 'disabled' && device.disabled_by === 'admin') return { emotion: 'sad', dim: true, tone: 'bad', key: 'support' };
  if (device.status === 'revoked') return { emotion: 'sad', dim: true, tone: 'bad', key: 'revoked' };
  return { emotion: 'sleepy', dim: true, tone: 'rest', key: 'resting' };
}

// An awake toy's face is never quite still: now and then it winks or looks
// around, the way the real screen idles.
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

export function BalanceCard({ balance, className = '' }) {
  const { t } = useI18n();
  const shown = useCountUp(balance ?? 0);
  const { openPay } = useLayers();
  const out = balance === 0;
  const low = balance !== null && balance > 0 && balance <= 5;
  return (
    <section className={`panel balance ${className}`} aria-label={t('balLabel')}>
      <div className="bal-top">
        <span className="coin">{Icon.coin}</span>
        <span className="bal-label">{t('balLabel')}</span>
        {out && <Pill tone="bad" icon={Icon.alert}>{t('out')}</Pill>}
        {low && <Pill tone="warn" icon={Icon.alert}>{t('low')}</Pill>}
      </div>
      <div className="bal-num" aria-live="polite">{shown}<small>{t('balUnit')}</small></div>
      <p className="muted">{t('balHint')}</p>
      {(out || low) && <div className={`banner ${out ? 'bad' : 'warn'}`}>{Icon.alert}<span>{t(out ? 'outLong' : 'lowLong')}</span></div>}
      <button type="button" className="btn apricot sheen" onClick={() => openPay(null)}>{t('buy')}</button>
    </section>
  );
}

export function ToyCard({ device, kids, index = 0 }) {
  const { t } = useI18n();
  const name = useToyName()(device, kids);
  const look = toyLook(device);
  const face = useIdleFace(look.emotion, device.status === 'active');
  const { openToy } = useLayers();
  return (
    <button type="button" className="toy-card lift" style={{ '--i': index }} onClick={(e) => openToy(device.id, e.currentTarget)}>
      <span className={`tc-screen ${look.dim ? 'dim' : ''}`}><Face emotion={face} /></span>
      <span className="tc-body">
        <span className="tc-name">{name}</span>
        <span className="tc-meta"><Pill tone={look.tone}>{t(look.key)}</Pill><span>{t('seen', { t: relativeTime(device.last_seen_at, t) })}</span></span>
      </span>
    </button>
  );
}

export function AddTile() {
  const { t } = useI18n();
  const { openAdd } = useLayers();
  return (
    <button type="button" className="add-tile" onClick={(e) => openAdd(e.currentTarget)}>
      <span className="plus">{Icon.plus}</span>{t('addToy')}
    </button>
  );
}

export function Onboard() {
  const { t } = useI18n();
  const { openAdd } = useLayers();
  return (
    <section className="panel onboard">
      <span className="chip-screen chip-screen--xl float"><Face emotion="excited" /></span>
      <div>
        <h2>{t('onboardT')}</h2>
        <p>{t('onboardB')}</p>
        <button type="button" className="btn apricot sheen" onClick={(e) => openAdd(e.currentTarget)}>{Icon.plus}{t('addToy')}</button>
      </div>
    </section>
  );
}

export function TurnRow({ turn, index = 0 }) {
  const { t } = useI18n();
  const who = turn.child_name ?? turn.device_serial ?? 'Buddy';
  const when = relativeTime(turn.started_at, t);
  if (turn.status === 'completed') {
    return (
      <div className="feed-item" style={{ '--i': index }}>
        <span className="chip-screen chip-screen--sm"><Face emotion={normalizeEmotion(turn.emotion)} /></span>
        <div>
          <div className="feed-title">{t('answered', { name: who })}</div>
          <div className="feed-sub">{when} · {t(`emo_${normalizeEmotion(turn.emotion)}`)}</div>
          {turn.answer_text && <p className="quote">“{turn.answer_text}”</p>}
        </div>
        <span className="delta">-1</span>
      </div>
    );
  }
  const reason = turn.status === 'denied' ? t(`r_${turn.denied_reason}`) : t(`r_${turn.status}`);
  return (
    <div className="feed-item" style={{ '--i': index }}>
      <span className="chip-screen chip-screen--sm dim"><Face emotion={turn.status === 'denied' ? 'sleepy' : 'confused'} /></span>
      <div>
        <div className="feed-title">{turn.status === 'accepted' ? t('answering', { name: who }) : t('notAnswered', { name: who })}</div>
        <div className="feed-sub">{reason} · {when}</div>
      </div>
      <span className="delta zero">{t('free')}</span>
    </div>
  );
}

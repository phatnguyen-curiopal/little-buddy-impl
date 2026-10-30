import { useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Chip, CoinStack, Icon, LangSwitch, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Link, navigate } from '../lib/router.js';
import { age, relativeTime, vnd, pricePerAnswer } from '../lib/format.js';
import { groupLedger } from '../lib/stats.js';
import { designOf } from '../lib/designs.js';
import { useFamilyData, useLayers } from './data.jsx';
import { AddTile, BalanceCard, Onboard, ToyCard, TurnRow, toyLook, useIdleFace, useToyActions, useToyLines } from './parts.jsx';
import WeekChart from './WeekChart.jsx';

// The toy in its room, like the home screen of a talking-pet game: big
// Buddy, a few round buttons around it and one big way to talk.
function HomeRoom({ device }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const lines = useToyLines()(device, d.children);
  const look = toyLook(device);
  const face = useIdleFace(look.emotion === 'neutral' ? 'happy' : look.emotion, device.status === 'active');
  const { openToy } = useLayers();
  const { busy, pause, wake } = useToyActions();
  const canTalk = device.status === 'active' && d.me?.web_toy === true;
  const parentPaused = device.status === 'disabled' && device.disabled_by === 'parent';
  return (
    <Room size="lg" scene night={look.dim} className="home-room">
      <div className="scene-stage">
        <span className="room-stage"><BuddyFigure design={designOf(device)} emotion={face} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} label={lines.name} /></span>
      </div>
      <div className="room-side">
        <button type="button" className="round" onClick={() => openToy(device.id)} aria-label={t('profileTitle')}>{Icon.sliders}</button>
        {device.status === 'active' && <button type="button" className="round" disabled={busy} onClick={() => pause(device)} aria-label={t('pause')}>{Icon.moon}</button>}
        {parentPaused && <button type="button" className="round" disabled={busy} onClick={() => wake(device)} aria-label={t('wake')}>{Icon.sun}</button>}
      </div>
      <div className="scene-ground home-ground">
        <div className="room-plate">
          <b>{lines.name}</b>
          <Chip tone={look.tone} dot>{t(look.key)} · {lines.sub}</Chip>
        </div>
        {canTalk && (
          <Link className="btn btn-pop" to={`/app/talk?toy=${encodeURIComponent(device.id)}`}>{Icon.mic}{t('nav_talk')}</Link>
        )}
      </div>
    </Room>
  );
}

function BalanceNotice({ balance }) {
  const { t } = useI18n();
  const { openPay } = useLayers();
  if (balance === null || balance > 5) return null;
  const out = balance === 0;
  return (
    <div className={`banner banner--${out ? 'bad' : 'warn'} banner--action`}>
      {Icon.alert}<span>{t(out ? 'outLong' : 'lowLong')}</span>
      <button type="button" className="btn btn-sm btn-gold" onClick={() => openPay(null)}>{t('buy')}</button>
    </div>
  );
}

export function Overview() {
  const { t } = useI18n();
  const d = useFamilyData();
  const [picked, setPicked] = useState(null);
  const recent = d.turns.slice(0, 4);
  const main = d.devices.find((x) => x.id === picked) ?? d.devices.find((x) => x.status === 'active') ?? d.devices[0];
  return (
    <div className="home">
      {main ? <HomeRoom key={main.id} device={main} /> : <Onboard />}
      {d.devices.length > 1 && (
        <div className="toy-switch" role="group" aria-label={t('yourToys')}>
          {d.devices.map((dev) => {
            const look = toyLook(dev);
            return (
              <button key={dev.id} type="button" className="toy-chip" aria-pressed={dev.id === main?.id} onClick={() => setPicked(dev.id)}>
                <BuddyAvatar design={designOf(dev)} emotion={look.emotion === 'neutral' ? 'happy' : look.emotion} dim={look.dim} size="sm" />
                <span>{dev.profile?.name || dev.serial}</span>
              </button>
            );
          })}
        </div>
      )}
      <BalanceNotice balance={d.wallet?.balance ?? null} />
      <div className="home-grid">
        <WeekChart turns={d.turns} />
        <section className="card">
          <div className="card-head"><h2>{t('recent')}</h2>{recent.length > 0 && <Link className="link" to="/app/activity">{t('seeAll')}</Link>}</div>
          <div className="turns">{recent.length ? recent.map((turn) => <TurnRow key={turn.id} turn={turn} />) : <p className="empty">{t('noTurns')}</p>}</div>
        </section>
      </div>
    </div>
  );
}

export function Toys() {
  const d = useFamilyData();
  if (!d.devices.length) return <Onboard />;
  return <div className="toy-grid">{d.devices.map((dev) => <ToyCard key={dev.id} device={dev} kids={d.children} />)}<AddTile /></div>;
}

function ledgerLabel(row, t) {
  if (row.kind === 'debit') return t('l_debit', { n: row.count });
  if (row.kind === 'purchase') {
    const pack = String(row.reason ?? '').replace(/^pack:/, '');
    return t('l_purchase', { pack: t(`pack_${pack}`) });
  }
  if (row.kind === 'grant') return row.reason === 'welcome' ? t('l_welcome') : t('l_grant');
  return t(`l_${row.kind}`);
}

export function Credits() {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const { openPay } = useLayers();
  const rows = groupLedger(d.wallet?.ledger ?? []);
  return (
    <div className="credits">
      <BalanceCard balance={d.wallet?.balance ?? null} />
      <section className="credits-shop">
        <h2 className="section-title">{t('packs')}</h2>
        <div className="shop">
          {d.packs.map((p) => {
            const best = p.id === 'big';
            return (
              <button key={p.id} type="button" className={`shop-item ${best ? 'shop-item--best' : ''}`} onClick={() => openPay(p)}>
                {best && <span className="ribbon">{t('best')}</span>}
                <CoinStack credits={p.credits} />
                <span className="shop-name">{t(`pack_${p.id}`)}</span>
                <span className="shop-credits">{t('credits', { n: p.credits })}</span>
                <span className="shop-per">{t('perAnswer', { p: vnd(pricePerAnswer(p), lang) })}</span>
                <span className="shop-price">{vnd(p.price_amount, lang)}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="card credits-history">
        <div className="card-head"><h2>{t('history')}</h2></div>
        <div className="ledger">
          {rows.length ? rows.map((r) => (
            <div key={r.id} className="ledger-row">
              <span className={`ledger-icon ${r.delta > 0 ? 'is-plus' : ''}`}>{r.delta > 0 ? Icon.plus : Icon.check}</span>
              <span className="ledger-text"><b>{ledgerLabel(r, t)}</b><span className="muted small">{relativeTime(r.created_at, t)}</span></span>
              <span className={`ledger-delta ${r.delta > 0 ? 'is-plus' : ''}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
            </div>
          )) : <p className="empty">{t('noLedger')}</p>}
        </div>
      </section>
    </div>
  );
}

export function Activity() {
  const { t } = useI18n();
  const d = useFamilyData();
  const [filter, setFilter] = useState('all');
  const list = d.turns.filter((u) => (filter === 'all' ? true : filter === 'answered' ? u.status === 'completed' : u.status !== 'completed'));
  return (
    <div className="activity">
      <div className="pills" role="group" aria-label={t('filter')}>
        {[['all', 'fAll'], ['answered', 'fAnswered'], ['not', 'fNot']].map(([v, k]) => (
          <button key={v} type="button" className="pill-btn" aria-pressed={filter === v} onClick={() => setFilter(v)}>{t(k)}</button>
        ))}
      </div>
      <p className="note">{Icon.lock}<span>{t('activityNote')}</span></p>
      <div className="turns turns--cards">{list.length ? list.map((turn) => <TurnRow key={turn.id} turn={turn} />) : <p className="empty">{t('noTurns')}</p>}</div>
    </div>
  );
}

export function ChildForm({ onDone, autoFocus = true }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear() - 6);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const years = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 2 - i);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('needName')); return; }
    setBusy(true);
    try {
      const out = await api.addChild({ name: name.trim(), birth_year: Number(year) });
      setName('');
      setError('');
      onDone?.(out.child);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="child-form" onSubmit={submit} noValidate>
      <div className="field-row">
        <div className="field"><label htmlFor="child-name">{t('childName')}</label><input id="child-name" className="input" value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} data-autofocus={autoFocus || undefined} /></div>
        <div className="field"><label htmlFor="child-year">{t('birthYear')}</label>
          <select id="child-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
      </div>
      {error && <p className="msg msg--bad">{error}</p>}
      <button type="submit" className="btn btn-pop" disabled={busy}>{busy ? t('saving') : t('addChild')}</button>
    </form>
  );
}

export function Family() {
  const { t } = useI18n();
  const d = useFamilyData();
  const auth = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <div className="family">
      <section className="family-kids">
        <div className="card-head"><h2 className="section-title">{t('children')}</h2>{!adding && <button type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>{Icon.plus}{t('addChild')}</button>}</div>
        {d.children.length ? (
          <div className="kids">
            {d.children.map((c, i) => {
              const n = d.devices.filter((x) => x.child_id === c.id).length;
              return (
                <div key={c.id} className="kid-card">
                  <span className={`avatar avatar--lg ${i % 2 ? 'avatar--gold' : ''}`}>{c.name.slice(0, 1)}</span>
                  <b>{c.name}</b>
                  <span className="muted small">{t('age', { n: age(c.birth_year) })}</span>
                  <Chip tone="pop">{n ? t('buddies', { n }) : t('noBuddy')}</Chip>
                </div>
              );
            })}
          </div>
        ) : !adding && <p className="empty">{t('noKids')}</p>}
        {adding && (
          <div className="card">
            <h3 className="card-title">{t('addChild')}</h3>
            <ChildForm onDone={async () => { setAdding(false); await d.reload(); toast(t('saved')); }} />
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head"><h2>{t('account')}</h2></div>
        <div className="rows">
          <div className="row"><span className="muted">{t('familyName')}</span><b>{d.me?.family.name}</b></div>
          <div className="row"><span className="muted">{t('email')}</span><b>{d.me?.parent.email}</b></div>
          <div className="row"><span className="muted">{t('language')}</span><LangSwitch /></div>
        </div>
        <button type="button" className="btn btn-soft btn-block" onClick={async () => { await auth.logout(); navigate('/'); }}>{Icon.out}{t('signOut')}</button>
      </section>
    </div>
  );
}


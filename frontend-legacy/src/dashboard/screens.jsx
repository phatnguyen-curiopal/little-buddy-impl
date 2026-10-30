import { useState } from 'react';
import { Icon, LangSwitch, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { age, relativeTime, vnd, pricePerAnswer } from '../lib/format.js';
import { groupLedger } from '../lib/stats.js';
import { useFamilyData, useLayers } from './data.jsx';
import { AddTile, BalanceCard, Onboard, ToyCard, TurnRow } from './parts.jsx';
import WeekChart from './WeekChart.jsx';

export function Overview() {
  const { t } = useI18n();
  const d = useFamilyData();
  const recent = d.turns.slice(0, 4);
  return (
    <div className="grid-12">
      <BalanceCard balance={d.wallet?.balance ?? null} className="span-5" />
      <div className="span-7"><WeekChart turns={d.turns} /></div>
      <section className="span-12">
        {d.devices.length ? (
          <>
            <div className="section-title"><h2>{t('yourToys')}</h2><button type="button" className="link" onClick={() => navigate('/app/toys')}>{t('manage')}</button></div>
            <div className="toy-grid">{d.devices.map((dev, i) => <ToyCard key={dev.id} device={dev} kids={d.children} />)}<AddTile /></div>
          </>
        ) : <Onboard />}
      </section>
      <section className="panel span-12">
        <div className="panel-head"><h2>{t('recent')}</h2>{recent.length > 0 && <button type="button" className="link" onClick={() => navigate('/app/activity')}>{t('seeAll')}</button>}</div>
        <div className="feed">{recent.length ? recent.map((turn, i) => <TurnRow key={turn.id} turn={turn} />) : <p className="empty">{t('noTurns')}</p>}</div>
      </section>
    </div>
  );
}

export function Toys() {
  const d = useFamilyData();
  if (!d.devices.length) return <Onboard />;
  return <div className="toy-grid">{d.devices.map((dev, i) => <ToyCard key={dev.id} device={dev} kids={d.children} />)}<AddTile /></div>;
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
    <div className="grid-12">
      <BalanceCard balance={d.wallet?.balance ?? null} className="span-5" />
      <section className="panel span-7">
        <div className="panel-head"><h2>{t('packs')}</h2></div>
        <div className="pack-list">
          {d.packs.map((p) => (
            <button key={p.id} type="button" className={`pack lift ${p.id === 'big' ? 'pack--best' : ''}`} onClick={(e) => openPay(p, e.currentTarget)}>
              <span className="pack-name">{t(`pack_${p.id}`)}{p.id === 'big' && <span className="badge">{t('best')}</span>}</span>
              <span className="pack-sub">{t('credits', { n: p.credits })} · {t('perAnswer', { p: vnd(pricePerAnswer(p), lang) })}</span>
              <span className="pack-price">{vnd(p.price_amount, lang)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel span-12">
        <div className="panel-head"><h2>{t('history')}</h2></div>
        <div className="feed">
          {rows.length ? rows.map((r, i) => (
            <div key={r.id} className="feed-item">
              <span className={`dot ${r.delta > 0 ? 'dot--coin' : 'dot--rest'}`}>{r.delta > 0 ? Icon.plus : Icon.check}</span>
              <div><div className="feed-title">{ledgerLabel(r, t)}</div><div className="feed-sub">{relativeTime(r.created_at, t)}</div></div>
              <span className={`delta ${r.delta > 0 ? 'pos' : ''}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
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
    <section className="panel">
      <div className="panel-head">
        <div className="seg" role="group" aria-label={t('filter')}>
          {[['all', 'fAll'], ['answered', 'fAnswered'], ['not', 'fNot']].map(([v, k]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{t(k)}</button>
          ))}
        </div>
      </div>
      <div className="feed">{list.length ? list.map((turn, i) => <TurnRow key={turn.id} turn={turn} />) : <p className="empty">{t('noTurns')}</p>}</div>
      <p className="muted small">{t('activityNote')}</p>
    </section>
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
    <form className="form child-form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="child-name">{t('childName')}</label><input id="child-name" className="input" value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} data-autofocus={autoFocus || undefined} /></div>
      <div className="field"><label htmlFor="child-year">{t('birthYear')}</label>
        <select id="child-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
      {error && <p className="msg bad">{error}</p>}
      <button type="submit" className="btn pop" disabled={busy}>{busy ? t('saving') : t('save')}</button>
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
    <div className="grid-12">
      <section className="panel span-7">
        <div className="panel-head"><h2>{t('children')}</h2>{!adding && <button type="button" className="link" onClick={() => setAdding(true)}>+ {t('addChild')}</button>}</div>
        {d.children.length ? (
          <div className="rows">
            {d.children.map((c, i) => {
              const n = d.devices.filter((x) => x.child_id === c.id).length;
              return (
                <div key={c.id} className="row">
                  <div className="kid"><span className={`avatar ${i % 2 ? 'alt' : ''}`}>{c.name.slice(0, 1)}</span>
                    <div><div className="feed-title">{c.name}</div><div className="feed-sub">{t('age', { n: age(c.birth_year) })}</div></div></div>
                  <span className="feed-sub">{n ? t('buddies', { n }) : t('noBuddy')}</span>
                </div>
              );
            })}
          </div>
        ) : !adding && <p className="muted">{t('noKids')}</p>}
        {adding && <ChildForm onDone={async () => { setAdding(false); await d.reload(); toast(t('saved')); }} />}
      </section>
      <section className="panel span-5">
        <div className="panel-head"><h2>{t('account')}</h2></div>
        <div className="rows">
          <div className="row"><span className="k">{t('email')}</span><span className="v">{d.me?.parent.email}</span></div>
          <div className="row"><span className="k">{t('familyName')}</span><span className="v">{d.me?.family.name}</span></div>
          <div className="row"><span className="k">{t('language')}</span><LangSwitch /></div>
        </div>
        <button type="button" className="btn ghost signout" onClick={async () => { await auth.logout(); navigate('/'); }}>{Icon.out}{t('signOut')}</button>
      </section>
    </div>
  );
}

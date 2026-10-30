import { useEffect, useRef, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Chip, CoinStack, Icon, LangSwitch, useErrorText, useToast } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Link, navigate } from '../lib/router.js';
import { age, isoDay, relativeTime, vnd, pricePerAnswer } from '../lib/format.js';
import { CHILD_LANGUAGES, MAX_CHILD_AGE, birthDateProblem, childBody } from '../lib/wizard.js';
import { groupLedger } from '../lib/stats.js';
import { ROLES, toyActions, toyView } from '../lib/buddy.js';
import { useFamilyData, useLayers } from './data.jsx';
import { AddTile, BalanceCard, Onboard, ToyCard, TurnRow, childOf, packName, toyLook, useCanBuy, useIdleFace, useToyActions } from './parts.jsx';
import WeekChart from './WeekChart.jsx';

// The toy in its room, like the home screen of a talking-pet game: big
// Buddy, a few round buttons around it and one big thing to do.
function HomeRoom({ device }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const view = toyView(device, d.children, d.buddies);
  const can = toyActions(view, d.me?.web_toy === true);
  const look = toyLook(device);
  const face = useIdleFace(look.emotion === 'neutral' ? 'happy' : look.emotion, device.status === 'active');
  const { openToy, openAdd } = useLayers();
  const { busy, pause, wake } = useToyActions();
  return (
    <Room size="lg" scene night={look.dim} className="home-room">
      <div className="scene-stage">
        <span className="room-stage"><BuddyFigure emotion={face} dim={look.dim} phase={look.dim ? 'rest' : 'idle'} label={view.name} /></span>
      </div>
      <div className="room-side">
        <button type="button" className="round" onClick={() => openToy(device.id)} aria-label={t('profileTitle')}>{Icon.sliders}</button>
        {can.pause && <button type="button" className="round" disabled={busy} onClick={() => pause(device)} aria-label={t('pause')}>{Icon.moon}</button>}
        {can.wake && <button type="button" className="round" disabled={busy} onClick={() => wake(device)} aria-label={t('wake')}>{Icon.sun}</button>}
      </div>
      <div className="scene-ground home-ground">
        <div className="room-plate">
          <b>{view.name}</b>
          <Chip tone={look.tone} dot>{t(look.key)} · {view.child ? t('forChild', { name: view.child.name }) : t('noChild')}</Chip>
        </div>
        {can.talk && <Link className="btn btn-pop" to={`/app/talk?toy=${encodeURIComponent(device.id)}`}>{Icon.mic}{t('nav_talk')}</Link>}
        {can.setup && <button type="button" className="btn btn-pop" onClick={() => openAdd(view.child.id)}>{Icon.spark}{t('finishSetup')}</button>}
      </div>
    </Room>
  );
}

// A child with safety alerts nobody has looked at yet comes first on the
// home screen, one banner per child, each opening that child's alerts.
function AlertBanners() {
  const { t } = useI18n();
  const d = useFamilyData();
  const flagged = d.children.filter((c) => (d.alerts[c.id] ?? 0) > 0);
  return flagged.map((c) => (
    <div key={c.id} className="banner banner--bad banner--action alert-banner">
      {Icon.alert}<span>{t('alertBanner', { name: c.name, n: d.alerts[c.id] })}</span>
      <Link className="btn btn-sm btn-danger" to={`/app/care?tab=safety&child=${encodeURIComponent(c.id)}`}>{t('alertBannerGo')}</Link>
    </div>
  ));
}

function BalanceNotice({ balance }) {
  const { t } = useI18n();
  const { openPay } = useLayers();
  const canBuy = useCanBuy();
  if (balance === null || balance > 5) return null;
  const out = balance === 0;
  return (
    <div className={`banner banner--${out ? 'bad' : 'warn'} banner--action`}>
      {Icon.alert}<span>{t(out ? 'outLong' : 'lowLong')}{canBuy ? '' : ` ${t('buySoon')}`}</span>
      {canBuy && <button type="button" className="btn btn-sm btn-gold" onClick={() => openPay(null)}>{t('buy')}</button>}
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
      <h1 className="sr-only">{t('nav_overview')}</h1>
      <AlertBanners />
      {main ? <HomeRoom key={main.id} device={main} /> : <Onboard />}
      {d.devices.length > 1 && (
        <div className="toy-switch" role="group" aria-label={t('yourToys')}>
          {d.devices.map((dev) => {
            const view = toyView(dev, d.children, d.buddies);
            const look = toyLook(dev);
            return (
              <button key={dev.id} type="button" className="toy-chip" aria-pressed={dev.id === main?.id} onClick={() => setPicked(dev.id)}>
                <BuddyAvatar emotion={look.emotion === 'neutral' ? 'happy' : look.emotion} dim={look.dim} size="sm" />
                <span>{view.child ? t('buddyOf', { name: view.name, child: view.child.name }) : view.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <BalanceNotice balance={d.wallet?.balance ?? null} />
      <div className="home-grid">
        {/* The week comes from every child's usage rows, since the family's newest turns can cover less than a week. */}
        <WeekChart usage={Object.values(d.usage).flat()} />
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
  return <div className="toy-grid">{d.devices.map((dev) => <ToyCard key={dev.id} device={dev} />)}<AddTile /></div>;
}

// backend-v2's ledger: a debit per answered turn (reason 'turn'), a purchase
// per paid pack (reason 'pack:<id>'), grants (the 'welcome' credits, or from
// support) and refunds.
function ledgerLabel(row, t, children, packs) {
  if (row.kind === 'debit') {
    const child = childOf(children, row.child_id);
    return child ? t('l_debitFor', { n: row.count, name: child.name }) : t('l_debit', { n: row.count });
  }
  if (row.kind === 'purchase') {
    const id = String(row.reason ?? '').replace(/^pack:/, '');
    return t('l_purchase', { pack: packName(packs.find((p) => p.id === id) ?? { id }, t) });
  }
  if (row.kind === 'grant') return row.reason === 'welcome' ? t('l_welcome') : t('l_grant');
  if (row.kind === 'refund') return t('l_refund');
  return t('l_other');
}

export function Credits() {
  const { t, lang } = useI18n();
  const d = useFamilyData();
  const { openPay } = useLayers();
  const canBuy = useCanBuy();
  const rows = groupLedger(d.wallet?.ledger ?? []);
  return (
    <div className="credits">
      <BalanceCard balance={d.wallet?.balance ?? null} />
      <section className="credits-shop">
        <h2 className="section-title">{t(canBuy ? 'packs' : 'packsTitle')}</h2>
        {!canBuy && <p className="note credits-soon">{Icon.spark}<span>{t('buySoonLong')}</span></p>}
        <div className="shop">
          {d.packs.map((p) => {
            const best = p.id === 'big';
            const face = (<>
              {best && <span className="ribbon">{t('best')}</span>}
              <CoinStack credits={p.credits} />
              <span className="shop-name">{packName(p, t)}</span>
              <span className="shop-credits">{t('credits', { n: p.credits })}</span>
              <span className="shop-per">{t('perAnswer', { p: vnd(pricePerAnswer(p), lang) })}</span>
              <span className="shop-price">{vnd(p.price_amount, lang)}</span>
            </>);
            const cls = `shop-item ${best ? 'shop-item--best' : ''}`;
            return canBuy
              ? <button key={p.id} type="button" className={cls} onClick={() => openPay(p)}>{face}</button>
              : <div key={p.id} className={cls}>{face}</div>;
          })}
        </div>
      </section>
      <section className="card credits-history">
        <div className="card-head"><h2>{t('history')}</h2></div>
        <div className="ledger">
          {rows.length ? rows.map((r) => (
            <div key={r.id} className="ledger-row">
              <span className={`ledger-icon ${r.delta > 0 ? 'is-plus' : ''}`}>{r.delta > 0 ? Icon.plus : Icon.check}</span>
              <span className="ledger-text"><b>{ledgerLabel(r, t, d.children, d.packs)}</b><span className="muted small">{relativeTime(r.created_at, t)}</span></span>
              <span className={`ledger-delta ${r.delta > 0 ? 'is-plus' : ''}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
            </div>
          )) : <p className="empty">{t('noLedger')}</p>}
        </div>
      </section>
    </div>
  );
}

// The family's list holds only its newest turns, where one child can have
// few or none, so a picked child gets their own, asked again after each
// family load to stay as fresh. Until that lands, or if it fails, the
// child's rows in the family's list stand in.
function useChildTurns(childId, familyTurns) {
  const [own, setOwn] = useState(null);
  useEffect(() => {
    if (!childId) return undefined;
    let current = true;
    api.turns({ childId, limit: 200 })
      .then((out) => { if (current) setOwn({ childId, rows: out.data ?? [] }); })
      .catch(() => {});
    return () => { current = false; };
  }, [childId, familyTurns]);
  if (!childId) return familyTurns;
  return own?.childId === childId ? own.rows : familyTurns.filter((u) => u.child_id === childId);
}

export function Activity() {
  const { t } = useI18n();
  const d = useFamilyData();
  const [picked, setPicked] = useState(null);
  const child = childOf(d.children, picked);
  const list = useChildTurns(child?.id ?? null, d.turns);
  return (
    <div className="activity">
      {d.children.length > 1 && (
        <div className="pills" role="group" aria-label={t('filterChild')}>
          <button type="button" className="pill-btn" aria-pressed={!child} onClick={() => setPicked(null)}>{t('fAll')}</button>
          {d.children.map((c) => (
            <button key={c.id} type="button" className="pill-btn" aria-pressed={child?.id === c.id} onClick={() => setPicked(c.id)}>{c.name}</button>
          ))}
        </div>
      )}
      <p className="note">
        {Icon.lock}
        <span>
          {t('activityNote')}{' '}
          <Link className="link" to={child ? `/app/care?child=${encodeURIComponent(child.id)}` : '/app/care'}>{t('activityCare')}</Link>
        </span>
      </p>
      <div className="turns turns--cards">{list.length ? list.map((turn) => <TurnRow key={turn.id} turn={turn} />) : <p className="empty">{t('noTurns')}</p>}</div>
    </div>
  );
}

// The child form's language choices (lib/wizard.js CHILD_LANGUAGES) and how
// a child's languages read on the card.
const LANG_LABELS = { vi: 'langVi', en: 'langEn', both: 'langBoth' };
const SPEAKS = { vi: 'kidLang_vi', en: 'kidLang_en', both: 'kidLang_both' };
const langChoice = (languages = []) => (languages.includes('vi') && languages.includes('en') ? 'both' : languages[0] === 'en' ? 'en' : 'vi');

// Adding a child from the Family screen. onDone gets the new child as
// POST /children returns it. The rules (an optional birthday that is a real
// day, not in the future, at most MAX_CHILD_AGE years ago; the browser's time
// zone) are the add-toy wizard's, from lib/wizard.js.
export function ChildForm({ onDone, onCancel, autoFocus = true }) {
  const { t, lang } = useI18n();
  const errText = useErrorText();
  const nameRef = useRef(null);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [langs, setLangs] = useState(lang === 'en' ? 'en' : 'vi');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = isoDay();

  // The form opens from a tap on "Add a child", so typing can start at once.
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
    // Runs once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('needName')); nameRef.current?.focus(); return; }
    const problem = birthDateProblem(birth);
    if (problem) { setError(problem === 'too_old' ? t('birthTooOld', { n: MAX_CHILD_AGE }) : t('badBirth')); return; }
    setBusy(true);
    setError('');
    try {
      const child = await api.addChild(childBody({ name, birthDate: birth, languages: langs }));
      setName('');
      setBirth('');
      onDone?.(child);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="child-form" onSubmit={submit} noValidate>
      <div className="field-row">
        <div className="field">
          <label htmlFor="child-name">{t('childName')}</label>
          <input ref={nameRef} id="child-name" className="input" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="child-birth">{t('birthDate')} <span className="muted">({t('optional')})</span></label>
          <input id="child-birth" className="input" type="date" value={birth} max={today} aria-describedby="child-birth-help" onChange={(e) => setBirth(e.target.value)} />
          <span id="child-birth-help" className="muted small">{t('birthHelp')}</span>
        </div>
      </div>
      <div className="field">
        <span className="field-label" id="child-langs">{t('childLangs')}</span>
        <div className="seg" role="group" aria-labelledby="child-langs">
          {Object.keys(CHILD_LANGUAGES).map((k) => (
            <button key={k} type="button" aria-pressed={langs === k} onClick={() => setLangs(k)}>{t(LANG_LABELS[k])}</button>
          ))}
        </div>
        <span className="muted small">{t('childLangsHelp')}</span>
      </div>
      {error && <p className="msg msg--bad" role="alert">{error}</p>}
      <div className="row-actions">
        <button type="submit" className="btn btn-pop" disabled={busy}>{busy ? t('saving') : t('addChild')}</button>
        {onCancel && <button type="button" className="btn btn-soft" disabled={busy} onClick={onCancel}>{t('cancel')}</button>}
      </div>
    </form>
  );
}

// One child: age and languages, their Buddy and toys, and the next step when
// the setup is not finished.
function KidCard({ child, index }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const { openAdd } = useLayers();
  const buddy = d.buddies[child.id] ?? null;
  const toys = d.devices.filter((x) => x.child_id === child.id);
  const holdsToy = toys.some((x) => x.status !== 'revoked');
  const years = age(child.birth_date);
  const alerts = d.alerts[child.id] ?? 0;
  const facts = [years >= 1 ? t('age', { n: years }) : null, t(SPEAKS[langChoice(child.languages)])].filter(Boolean);
  return (
    <article className="kid-card">
      <div className="kid-head">
        <span className={`avatar avatar--lg ${index % 2 ? 'avatar--gold' : ''}`} aria-hidden="true">{child.name.slice(0, 1).toUpperCase()}</span>
        <span className="kid-names"><b>{child.name}</b><span className="muted small">{facts.join(' · ')}</span></span>
      </div>
      <div className="kid-row">
        {buddy ? (<>
          <BuddyAvatar emotion="happy" size="sm" />
          <span className="kid-row-text"><b>{buddy.character_name}</b>{ROLES.includes(buddy.role) && <span className="muted small">{t(`role_${buddy.role}`)}</span>}</span>
        </>) : (<>
          <span className="kid-row-icon">{Icon.spark}</span>
          <span className="muted">{t('noBuddy')}</span>
        </>)}
      </div>
      <div className="kid-row">
        <span className="kid-row-icon">{Icon.cat}</span>
        <span className="kid-row-text">
          {toys.length ? toys.map((dev) => (
            <span key={dev.id}>{dev.hardware_rev === 'web' ? t('webBuddyName') : t('toySerial', { serial: dev.serial })} · {t(toyLook(dev).key)}</span>
          )) : <span className="muted">{t('noToyYet')}</span>}
        </span>
      </div>
      {alerts > 0 && <Chip tone="bad" icon={Icon.alert}>{t('careBadge', { n: alerts })}</Chip>}
      <div className="row-actions">
        {/* With a child id the wizard resumes the Buddy on the toy this child holds, or, with no toy yet, starts at the toy with this child chosen. */}
        {holdsToy && !buddy && <button type="button" className="btn btn-pop btn-sm" onClick={() => openAdd(child.id)}>{Icon.spark}{t('finishSetup')}</button>}
        {!holdsToy && <button type="button" className="btn btn-pop btn-sm" onClick={() => openAdd(child.id)}>{Icon.plus}{t('addToy')}</button>}
        <Link className="btn btn-soft btn-sm" to={`/app/care?child=${encodeURIComponent(child.id)}`}>{Icon.heart}{t('nav_care')}</Link>
      </div>
    </article>
  );
}

// The family name, editable in place; the top bar follows the family data.
function FamilyNameRow() {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editButton = useRef(null);
  const wasEditing = useRef(false);
  const name = d.me?.family?.name ?? '';

  // Focus goes back to the button that opened the editor, so a keyboard
  // user does not lose their place after saving or cancelling.
  useEffect(() => {
    if (draft === null && wasEditing.current) editButton.current?.focus();
    wasEditing.current = draft !== null;
  }, [draft]);

  const save = async (e) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next) { setError(t('needFamily')); return; }
    setBusy(true);
    setError('');
    try {
      await api.updateFamily(next);
      await d.reload();
      setDraft(null);
      toast(t('saved'));
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  if (draft === null) {
    return (
      <div className="row">
        <span className="muted">{t('familyName')}</span>
        <span className="row-value">
          <b>{name}</b>
          <button ref={editButton} type="button" className="btn btn-soft btn-sm" aria-label={t('editFamilyName')} onClick={() => { setDraft(name); setError(''); }}>{t('edit')}</button>
        </span>
      </div>
    );
  }
  return (
    <form className="row-edit" onSubmit={save} noValidate>
      <label htmlFor="family-name" className="muted">{t('familyName')}</label>
      {/* Focus moves into the field because it replaces the row the parent just asked to edit. */}
      <input id="family-name" className="input" value={draft} maxLength={80} autoComplete="off" autoFocus onChange={(e) => setDraft(e.target.value)} />
      {error && <p className="msg msg--bad" role="alert">{error}</p>}
      <div className="row-actions">
        <button type="submit" className="btn btn-pop btn-sm" disabled={busy}>{busy ? t('saving') : t('save')}</button>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => setDraft(null)}>{t('cancel')}</button>
      </div>
    </form>
  );
}

export function Family() {
  const { t } = useI18n();
  const d = useFamilyData();
  const auth = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const addButton = useRef(null);
  const wasAdding = useRef(false);

  // Closing the form puts focus back on the button that opened it.
  useEffect(() => {
    if (!adding && wasAdding.current) addButton.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  return (
    <div className="family">
      <section className="family-kids">
        <div className="card-head"><h2 className="section-title">{t('children')}</h2>{!adding && <button ref={addButton} type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>{Icon.plus}{t('addChild')}</button>}</div>
        {d.children.length ? (
          <div className="kids">{d.children.map((c, i) => <KidCard key={c.id} child={c} index={i} />)}</div>
        ) : !adding && <p className="empty">{t('noKids')}</p>}
        {adding && (
          <div className="card">
            <h3 className="card-title">{t('addChild')}</h3>
            <ChildForm onCancel={() => setAdding(false)} onDone={async () => { setAdding(false); await d.reload(); toast(t('saved')); }} />
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head"><h2>{t('account')}</h2></div>
        <div className="rows">
          <FamilyNameRow />
          <div className="row"><span className="muted">{t('email')}</span><b>{d.me?.parent?.email}</b></div>
          <div className="row"><span className="muted">{t('language')}</span><LangSwitch /></div>
        </div>
        <button type="button" className="btn btn-soft btn-block" onClick={async () => { await auth.logout(); navigate('/'); }}>{Icon.out}{t('signOut')}</button>
      </section>
    </div>
  );
}

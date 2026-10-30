import { useCallback, useMemo, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import { Coin, Icon, LangSwitch, Skeleton, useErrorText } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { Link, navigate } from '../lib/router.js';
import { APP_SCREENS } from '../lib/routes.js';
import { useCountUp } from '../lib/motion.js';
import { FamilyDataProvider, LayerContext, useFamilyData, useLayers } from './data.jsx';
import { Activity, Credits, Family, Overview, Toys } from './screens.jsx';
import { useCanBuy } from './parts.jsx';
import Talk from './Talk.jsx';
import CareScreen from './care/CareScreen.jsx';
import { AddToyModal, PayModal, ToyDrawer } from './layers.jsx';

const NAV_ICONS = { overview: Icon.home, toys: Icon.cat, talk: Icon.mic, care: Icon.heart, activity: Icon.list, credits: Icon.coin, family: Icon.family };
const SCREENS = { overview: Overview, toys: Toys, talk: Talk, care: CareScreen, credits: Credits, activity: Activity, family: Family };
// The phone's tab bar has room for five. Credits stay one tap away through
// the coin counter, and Activity through the home screen's recent answers.
const TABS = ['overview', 'toys', 'talk', 'care', 'credits'];

// Openers are also passed straight to onClick, so an event object must not
// be taken for a child id or a pack.
const childIdOf = (value) => (typeof value === 'string' && value ? value : null);
const packOf = (value) => (value && typeof value.id === 'string' && Number.isFinite(value.credits) ? value : null);

function Loading() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton h={300} r={32} />
      <div className="grid-2"><Skeleton h={160} r={26} /><Skeleton h={160} r={26} /></div>
    </div>
  );
}

function Screen({ name }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const d = useFamilyData();
  if (d.loading) return <Loading />;
  if (d.error && !d.me) {
    // backend-v2 budgets each parent's calls, and a burst of reloads can use
    // it up: then "check your connection" would send the parent the wrong way.
    return (
      <section className="card empty-card">
        <BuddyFigure emotion="confused" className="figure--md" />
        <h2>{d.error.code === 'rate_limited' ? errText(d.error) : t('loadFailed')}</h2>
        <button type="button" className="btn btn-pop" onClick={d.reload}>{t('tryAgain')}</button>
      </section>
    );
  }
  const Comp = SCREENS[name];
  return <Comp />;
}

// The family's credits, always in reach like a game's coin counter. The
// plus buys more without leaving the screen, where buying is open.
function CoinCounter() {
  const { t } = useI18n();
  const d = useFamilyData();
  const canBuy = useCanBuy();
  const balance = d.wallet?.balance ?? null;
  const shown = useCountUp(balance);
  const { openPay } = useLayers();
  if (balance === null) return null;
  return (
    <div className={`coin-counter ${balance === 0 ? 'is-out' : balance <= 5 ? 'is-low' : ''} ${canBuy ? '' : 'coin-counter--solo'}`}>
      <Link to="/app/credits" className="coin-counter-main" aria-label={`${t('balLabel')}: ${balance}`}>
        <Coin /><b>{shown}</b>
      </Link>
      {canBuy && <button type="button" className="coin-counter-plus" onClick={() => openPay(null)} aria-label={t('buy')}>{Icon.plus}</button>}
    </div>
  );
}

// Safety alerts nobody has acknowledged yet, counted on the Care nav item.
// The count is drawn on the icon; screen readers get it from the link's name
// (navLabel), after the screen's own name.
function NavBadge({ n }) {
  if (!n) return null;
  return <span className="nav-badge" aria-hidden="true">{n > 9 ? '9+' : n}</span>;
}

function Shell({ screen }) {
  const { t } = useI18n();
  const auth = useAuth();
  const d = useFamilyData();
  const [layer, setLayer] = useState(null);
  const webToy = d.me?.web_toy === true;
  // Talk only exists where the backend lets a Buddy live in the browser.
  const screens = APP_SCREENS.filter((r) => r.name !== 'talk' || webToy);
  const tabs = TABS.filter((n) => n !== 'talk' || webToy);
  const alerts = Object.values(d.alerts ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const badges = { care: alerts };
  const navLabel = (name) => (badges[name] ? `${t(`nav_${name}`)}. ${t('careBadge', { n: badges[name] })}` : undefined);

  const layers = useMemo(() => ({
    openToy: (id) => setLayer({ type: 'toy', id }),
    // With a child id the wizard resumes that child's setup.
    openAdd: (childId) => setLayer({ type: 'add', childId: childIdOf(childId) }),
    openPay: (pack) => setLayer({ type: 'pay', pack: packOf(pack) }),
  }), []);
  const close = useCallback(() => setLayer(null), []);

  const signOut = async () => {
    await auth.logout();
    navigate('/');
  };
  // The family data is refreshed after a rename; the session's copy is not.
  const me = d.me ?? auth.me;
  const family = me?.family?.name ?? '';
  const parent = me?.parent?.display_name || me?.parent?.email?.split('@')[0] || '';

  return (
    <LayerContext.Provider value={layers}>
      <div className={`app app--${screen}`}>
        <aside className="rail">
          <Link className="wordmark" to="/app"><BuddyAvatar design="miu" emotion="happy" size="sm" /><span>Little Buddy</span></Link>
          <nav className="rail-nav" aria-label={t('appNav')}>
            {screens.map((r) => (
              <Link key={r.name} to={r.path} className="rail-item" aria-current={screen === r.name ? 'page' : undefined} aria-label={navLabel(r.name)}>
                <span className="rail-icon">{NAV_ICONS[r.name]}<NavBadge n={badges[r.name]} /></span><span>{t(`nav_${r.name}`)}</span>
              </Link>
            ))}
          </nav>
          <button type="button" className="btn btn-pop rail-add" onClick={() => layers.openAdd()}>{Icon.plus}<span>{t('addToy')}</span></button>
          <div className="rail-foot">
            <LangSwitch />
            <button type="button" className="rail-item" onClick={signOut}><span className="rail-icon">{Icon.out}</span><span>{t('signOut')}</span></button>
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <Link to="/app/family" className="topbar-who" aria-label={t('nav_family')}>
              <span className="avatar">{(parent || family || '?').slice(0, 1).toUpperCase()}</span>
              <span className="topbar-names"><b>{t('hi', { name: parent })}</b><span>{family}</span></span>
            </Link>
            <div className="topbar-tools">
              <span className="topbar-lang"><LangSwitch /></span>
              <CoinCounter />
            </div>
          </header>
          <main className="page" id="main">
            {/* The Talk room fills the page with no visible title, so its heading is for screen readers; Overview has its own. */}
            {screen === 'talk'
              ? <h1 className="sr-only">{t('nav_talk')}</h1>
              : screen !== 'overview' && <h1 className="page-title">{t(`nav_${screen}`)}</h1>}
            <Screen name={screen} />
          </main>
        </div>

        <nav className="tabbar" aria-label={t('appNav')}>
          {tabs.map((name) => {
            const r = APP_SCREENS.find((x) => x.name === name);
            return (
              <Link key={name} to={r.path} className={`tab ${name === 'talk' ? 'tab--talk' : ''}`} aria-current={screen === name ? 'page' : undefined} aria-label={navLabel(name)}>
                <span className="tab-icon">{NAV_ICONS[name]}<NavBadge n={badges[name]} /></span><span className="tab-label">{t(`nav_${name}`)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {layer?.type === 'toy' && <ToyDrawer id={layer.id} onClose={close} />}
      {layer?.type === 'add' && <AddToyModal onClose={close} childId={layer.childId} />}
      {layer?.type === 'pay' && <PayModal pack={layer.pack} onClose={close} />}
    </LayerContext.Provider>
  );
}

export default function AppShell({ screen }) {
  return <FamilyDataProvider><Shell screen={screen} /></FamilyDataProvider>;
}

import { useCallback, useMemo, useState } from 'react';
import Face from '../components/Face.jsx';
import { Icon, LangSwitch, Skeleton } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { Link, navigate } from '../lib/router.js';
import { APP_SCREENS } from '../lib/routes.js';
import { FamilyDataProvider, LayerContext, useFamilyData } from './data.jsx';
import { Activity, Credits, Family, Overview, Toys } from './screens.jsx';
import Talk from './Talk.jsx';
import { AddToyModal, PayModal, ToyDrawer } from './layers.jsx';

const NAV_ICONS = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="8" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="14.5" width="7" height="6" rx="2" /></svg>,
  toys: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="5" width="16" height="12" rx="5" /><circle cx="9.5" cy="10.5" r="1" fill="currentColor" /><circle cx="14.5" cy="10.5" r="1" fill="currentColor" /><path d="M9 20h6" /></svg>,
  talk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 013.5 15V7A1.5 1.5 0 015 5.5z" /><path d="M8.5 10.5v1M12 9.5v3M15.5 10.5v1" /></svg>,
  credits: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10h4a1.8 1.8 0 010 3.6h-3" /></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 6h14M5 12h14M5 18h9" /></svg>,
  family: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M14.5 19c.4-2 1.5-3.3 3-3.3s2.6 1.3 3 3.3" /></svg>,
};

const SCREENS = { overview: Overview, toys: Toys, talk: Talk, credits: Credits, activity: Activity, family: Family };

function Loading() {
  return (
    <div className="grid-12" aria-busy="true">
      <div className="panel span-5"><Skeleton h={24} w="50%" /><div className="gap" /><Skeleton h={72} w="40%" /><div className="gap" /><Skeleton h={16} /></div>
      <div className="panel span-7"><Skeleton h={24} w="40%" /><div className="gap" /><Skeleton h={160} /></div>
      <div className="panel span-12"><Skeleton h={120} /></div>
    </div>
  );
}

function Screen({ name }) {
  const { t } = useI18n();
  const d = useFamilyData();
  if (d.loading) return <Loading />;
  if (d.error && !d.me) {
    return (
      <div className="panel center pad">
        <span className="chip-screen chip-screen--xl"><Face emotion="confused" /></span>
        <h2>{t('loadFailed')}</h2>
        <button type="button" className="btn pop" onClick={d.reload}>{t('tryAgain')}</button>
      </div>
    );
  }
  const Comp = SCREENS[name];
  return <Comp />;
}

function Shell({ screen }) {
  const { t } = useI18n();
  const auth = useAuth();
  const d = useFamilyData();
  const [layer, setLayer] = useState(null);
  // Talk only exists where the backend lets the browser play the toy.
  const screens = APP_SCREENS.filter((r) => r.name !== 'talk' || d.me?.web_toy === true);

  const layers = useMemo(() => ({
    openToy: (id) => setLayer({ type: 'toy', id }),
    openAdd: () => setLayer({ type: 'add' }),
    openPay: (pack) => setLayer({ type: 'pay', pack }),
  }), []);
  const close = useCallback(() => setLayer(null), []);

  const signOut = async () => {
    await auth.logout();
    navigate('/');
  };
  const family = auth.me?.family?.name ?? '';
  const eyebrow = screen === 'overview' ? `${t('hi', { name: auth.me?.parent?.display_name || auth.me?.parent?.email?.split('@')[0] || '' })} · ${family}` : family;

  return (
    <LayerContext.Provider value={layers}>
      <div className="app">
        <aside className="side">
          <Link className="wordmark wordmark--ink" to="/app"><span className="dotface"><Face emotion="neutral" /></span><span>Little Buddy</span></Link>
          <nav className="side-nav" aria-label={t('appNav')}>
            {screens.map((r) => (
              <Link key={r.name} to={r.path} className="nav-item" aria-current={screen === r.name ? 'page' : undefined} aria-label={t(`nav_${r.name}`)}>
                {NAV_ICONS[r.name]}<span>{t(`nav_${r.name}`)}</span>
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <div className="who"><b>{family}</b><span className="muted">{auth.me?.parent?.email}</span></div>
            <button type="button" className="nav-item" onClick={signOut} aria-label={t('signOut')}>{Icon.out}<span>{t('signOut')}</span></button>
          </div>
        </aside>
        <main className="main">
          <div className="appbar"><Link className="wordmark wordmark--ink" to="/app"><span className="dotface"><Face emotion="neutral" /></span><span>Little Buddy</span></Link><LangSwitch /></div>
          <header className="page-head">
            <div><p className="eyebrow">{eyebrow}</p><h1>{t(`nav_${screen}`)}</h1></div>
            <div className="head-actions"><LangSwitch /><button type="button" className="btn pop sheen" onClick={() => layers.openAdd()}>{Icon.plus}<span>{t('addToy')}</span></button></div>
          </header>
          <Screen name={screen} />
        </main>
      </div>
      {layer?.type === 'toy' && <ToyDrawer id={layer.id} onClose={close} />}
      {layer?.type === 'add' && <AddToyModal onClose={close} />}
      {layer?.type === 'pay' && <PayModal pack={layer.pack} onClose={close} />}
    </LayerContext.Provider>
  );
}

export default function AppShell({ screen }) {
  return <FamilyDataProvider><Shell screen={screen} /></FamilyDataProvider>;
}

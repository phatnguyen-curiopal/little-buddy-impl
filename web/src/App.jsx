import { useEffect } from 'react';
import Face from './components/Face.jsx';
import { ToastProvider } from './components/ui.jsx';
import { LangProvider, useI18n } from './lib/i18n.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { Link, navigate, useLocation } from './lib/router.js';
import { guard } from './lib/routes.js';
import MarketingPage from './marketing/MarketingPage.jsx';
import AuthPage from './auth/AuthPage.jsx';
import AppShell from './dashboard/AppShell.jsx';

function Splash() {
  return <div className="splash"><span className="chip-screen chip-screen--xl"><Face emotion="thinking" /></span></div>;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="splash">
      <span className="chip-screen chip-screen--xl"><Face emotion="confused" /></span>
      <h1>{t('notFoundT')}</h1>
      <Link className="btn apricot" to="/">{t('backHome')}</Link>
    </div>
  );
}

function Routes() {
  const { route, pathname } = useLocation();
  const { status } = useAuth();
  const { t } = useI18n();
  const redirect = guard(route, status, pathname);

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  useEffect(() => {
    const titles = { home: t('titleHome'), login: t('signIn'), register: t('register'), notFound: t('notFoundT') };
    const page = titles[route.name] ?? t(`nav_${route.name}`);
    document.title = route.name === 'home' ? page : `${page} · Little Buddy`;
  }, [route.name, t]);

  if (redirect || (status === 'loading' && route.area !== 'public')) return <Splash />;
  if (route.name === 'home') return <MarketingPage />;
  if (route.name === 'login' || route.name === 'register') return <AuthPage key={route.name} mode={route.name} />;
  if (route.area === 'app') return <AppShell screen={route.name} />;
  return <NotFound />;
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  );
}

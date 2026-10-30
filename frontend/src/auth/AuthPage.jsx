import { useRef, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import { Icon, LangSwitch, useErrorText } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { Link, navigate, useLocation } from '../lib/router.js';
import { safeNext } from '../lib/routes.js';
import { usePointerLook } from '../lib/motion.js';

export default function AuthPage({ mode }) {
  const { t } = useI18n();
  const auth = useAuth();
  const errText = useErrorText();
  const { search } = useLocation();
  const reg = mode === 'register';
  const [form, setForm] = useState({ family_name: '', display_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const faceRef = useRef(null);
  const look = usePointerLook(faceRef);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (reg && !form.family_name.trim()) { setError(t('needFamily')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError(t('badEmail')); return; }
    if (form.password.length < 8) { setError(t('shortPw')); return; }
    setBusy(true);
    try {
      if (reg) {
        await auth.register({
          email: form.email.trim(),
          password: form.password,
          family_name: form.family_name.trim(),
          ...(form.display_name.trim() ? { display_name: form.display_name.trim() } : {}),
        });
      } else {
        await auth.login(form.email.trim(), form.password);
      }
      navigate(safeNext(search.get('next')), { replace: true });
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  // The face reacts to the form: it covers its eyes while a password is
  // typed unseen, and looks worried after an error.
  const typingPw = document.activeElement?.id === 'auth-password' && !showPw && form.password;
  const emotion = error ? 'confused' : busy ? 'thinking' : typingPw ? 'shy' : reg ? 'excited' : 'happy';

  return (
    <div className="auth">
      <Room size="full" className="auth-room">
        <div className="auth-top">
          <Link className="round" to="/" aria-label={t('backHome')}>{Icon.back}</Link>
          <Link className="wordmark" to="/"><BuddyAvatar emotion="happy" size="sm" /><span>Little Buddy</span></Link>
          <LangSwitch />
        </div>
        <div className="room-stage auth-stage" ref={faceRef}>
          <p className="say-bubble auth-quote">{reg ? t('authQuoteReg') : t('authQuoteLogin')}</p>
          <BuddyFigure emotion={emotion} look={look} />
        </div>
      </Room>
      <div className="auth-main">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>{reg ? t('createTitle') : t('welcomeBack')}</h1>
          {reg
            ? <p className="banner banner--gold"><span className="coin coin--sm" aria-hidden="true"><span>C</span></span><span>{t('registerNote')}</span></p>
            : <p className="muted">{t('loginSub')}</p>}
          {reg && (<>
            <div className="field"><label htmlFor="auth-family">{t('familyName')}</label><input id="auth-family" className="input" value={form.family_name} onChange={set('family_name')} maxLength={80} autoComplete="off" placeholder={t('familyPh')} /></div>
            <div className="field"><label htmlFor="auth-display">{t('yourName')} <span className="muted">({t('optional')})</span></label><input id="auth-display" className="input" value={form.display_name} onChange={set('display_name')} maxLength={80} autoComplete="name" /></div>
          </>)}
          <div className="field"><label htmlFor="auth-email">{t('email')}</label><input id="auth-email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></div>
          <div className="field">
            <label htmlFor="auth-password">{t('password')}</label>
            <div className="pw">
              <input id="auth-password" className="input" type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>{showPw ? t('hide') : t('show')}</button>
            </div>
            <span className="muted small">{t('pwHint')}</span>
          </div>
          {error && <p className="msg msg--bad shake">{error}</p>}
          <button type="submit" className="btn btn-pop btn-lg btn-block" disabled={busy}>{busy ? t('wait') : reg ? t('register') : t('signIn')}</button>
          <p className="muted center">
            {reg ? t('haveAccount') : t('noAccount')}{' '}
            <Link className="link" to={`${reg ? '/login' : '/register'}${search.get('next') ? `?next=${encodeURIComponent(search.get('next'))}` : ''}`}>{reg ? t('signIn') : t('register')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

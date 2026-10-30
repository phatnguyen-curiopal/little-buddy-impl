import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n.jsx';

export const Icon = {
  x: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plus: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  check: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  alert: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></svg>,
  coin: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10h4a1.8 1.8 0 010 3.6h-3" /></svg>,
  out: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12H4M8 8l-4 4 4 4M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" /></svg>,
  arrow: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
};

export function Pill({ tone = 'rest', icon, children }) {
  return <span className={`pill ${tone}`}>{icon}{children}</span>;
}

export function Skeleton({ h = 20, w = '100%', r = 12 }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function LangSwitch({ dark = false }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`lang ${dark ? 'on-dark' : ''}`} role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === 'vi'} onClick={() => setLang('vi')}>VI</button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// Modal dialog or side drawer. Focus moves in on open and back to the
// opener on close; Escape and a click on the backdrop close it.
export function Layer({ kind = 'modal', onClose, labelledBy, children, locked = false }) {
  const panel = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  useEffect(() => {
    const target = panel.current?.querySelector('[data-autofocus]') ?? panel.current?.querySelector('button, input, select, a[href]');
    target?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const back = opener.current;
    return () => {
      document.body.style.overflow = prevOverflow;
      if (back && document.contains(back)) back.focus?.();
    };
    // Focus handling runs once per open layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  return createPortal(
    <div className={`scrim ${kind === 'drawer' ? 'scrim--drawer' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div ref={panel} className={kind} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClick }) {
  const { t } = useI18n();
  return <button type="button" className="x" onClick={onClick} aria-label={t('close')}>{Icon.x}</button>;
}

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, tone = 'ink') => {
    clearTimeout(timer.current);
    setToast({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toast && <div key={toast.id} className={`toast toast--${toast.tone}`}>{toast.text}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// API error to a sentence a parent can act on.
export function useErrorText() {
  const { t } = useI18n();
  return useCallback((err) => {
    if (!err) return '';
    if (err.code === 'rate_limited') return t('err_rate_limited', { s: err.retryAfter ?? 60 });
    const key = `err_${err.code}`;
    const text = t(key);
    return text === key ? t('err_generic') : text;
  }, [t]);
}

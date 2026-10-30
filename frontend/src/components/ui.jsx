import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n.jsx';

const svg = (d, { w = 22, sw = 2.4, fill = 'none' } = {}) => (
  <svg viewBox="0 0 24 24" width={w} height={w} fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>
);

export const Icon = {
  x: svg(<path d="M6 6l12 12M18 6L6 18" />, { w: 20, sw: 3 }),
  plus: svg(<path d="M12 5v14M5 12h14" />, { sw: 3 }),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, { sw: 3 }),
  alert: svg(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></>, { w: 18 }),
  back: svg(<path d="M15 5l-7 7 7 7" />, { sw: 2.8 }),
  arrow: svg(<path d="M5 12h14M13 6l6 6-6 6" />, { w: 20 }),
  out: svg(<path d="M15 12H4M8 8l-4 4 4 4M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />),
  mic: svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>),
  stop: svg(<rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" />),
  keyboard: svg(<><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" /></>),
  chat: svg(<><path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-7l-5 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 9.5h8M8 12.5h5" /></>),
  refresh: svg(<><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></>),
  sliders: svg(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.5" /><circle cx="10" cy="17" r="2.5" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z" />),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>),
  home: svg(<><path d="M3 11l9-8 9 8" /><path d="M5 9.5V20h5v-5h4v5h5V9.5" /></>),
  cat: svg(<><path d="M5 10L4 4l5 3M19 10l1-6-5 3" /><path d="M4.5 13.5C4.5 9.5 8 7 12 7s7.5 2.5 7.5 6.5S16 20 12 20s-7.5-2.5-7.5-6.5z" /><path d="M9.5 13h.01M14.5 13h.01" /></>),
  list: svg(<><path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-7l-5 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 9.5h8M8 12.5h5" /></>),
  coin: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10c0-1.2 1.1-1.8 2.5-1.8s2.5.6 2.5 1.8-1.1 1.6-2.5 2-2.5.8-2.5 2 1.1 1.8 2.5 1.8 2.5-.6 2.5-1.8" /></>),
  family: svg(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M14.5 19c.4-2 1.5-3.3 3-3.3s2.6 1.3 3 3.3" /></>),
  play: svg(<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />, { w: 18 }),
  spark: svg(<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />, { w: 20 }),
  lock: svg(<><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>, { w: 18 }),
};

// A credit, drawn as a gold coin: the one thing the parent spends.
export function Coin({ size = 'md' }) {
  return <span className={`coin coin--${size}`} aria-hidden="true"><span>C</span></span>;
}

// A pile of coins, taller for a bigger pack.
export function CoinStack({ credits }) {
  const tall = credits >= 100 ? [0.7, 0.92, 1] : credits >= 50 ? [0.5, 0.75, 1] : [0.55, 0.8];
  return (
    <span className="coin-stack" aria-hidden="true">
      {tall.map((h, i) => <span key={i} style={{ '--h': h }} />)}
    </span>
  );
}

// tone: ok | rest | warn | bad | pop
export function Chip({ tone = 'rest', icon, children, dot = false }) {
  return <span className={`chip chip--${tone}`}>{dot && <i className="chip-dot" />}{icon}{children}</span>;
}

export function Skeleton({ h = 20, w = '100%', r = 14 }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function LangSwitch({ dark = false }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className={`lang ${dark ? 'lang--dark' : ''}`} role="group" aria-label={t('language')}>
      <button type="button" aria-pressed={lang === 'vi'} onClick={() => setLang('vi')}>VI</button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// Modal, side drawer, bottom sheet or full screen (the add-toy wizard).
// Focus moves in on open and back to the opener on close; Escape and a click
// on the backdrop close it.
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
    <div className={`scrim scrim--${kind}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div ref={panel} className={`layer layer--${kind}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClick }) {
  const { t } = useI18n();
  return <button type="button" className="round" onClick={onClick} aria-label={t('close')}>{Icon.x}</button>;
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

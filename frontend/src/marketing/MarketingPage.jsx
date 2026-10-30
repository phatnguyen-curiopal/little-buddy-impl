import { useEffect, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import Room from '../components/Room.jsx';
import Toy from '../components/Toy.jsx';
import { CoinStack, Icon, LangSwitch } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Link } from '../lib/router.js';
import { reducedMotion } from '../lib/motion.js';
import { EMOTIONS } from '../lib/emotions.js';
import { ROLES } from '../lib/personality.js';
import { api } from '../lib/api.js';
import { vnd, pricePerAnswer } from '../lib/format.js';

// Shown if the price list cannot be fetched, so the page never renders an
// empty pricing section. Same values as backend-v2's migration 007.
const FALLBACK_PACKS = [
  { id: 'starter', credits: 20, price_amount: 49000, currency: 'VND' },
  { id: 'family', credits: 60, price_amount: 129000, currency: 'VND' },
  { id: 'big', credits: 150, price_amount: 299000, currency: 'VND' },
];

function Nav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = [['#how', 'navHow'], ['#emotions', 'navEmotions'], ['#safety', 'navSafety'], ['#pricing', 'navPricing'], ['#faq', 'navFaq']];
  return (
    <header className={`nav ${scrolled ? 'nav--solid' : ''} ${open ? 'nav--open' : ''}`}>
      <div className="wrap nav-inner">
        <a className="wordmark" href="#top"><BuddyAvatar emotion="happy" size="sm" /><span>Little Buddy</span></a>
        <nav className="nav-links" aria-label={t('navSections')}>
          {links.map(([href, key]) => <a key={href} href={href}>{t(key)}</a>)}
        </nav>
        <div className="nav-actions">
          <LangSwitch />
          <Link className="btn btn-soft btn-sm" to="/login">{t('signIn')}</Link>
          <Link className="btn btn-pop btn-sm" to="/register">{t('start')}</Link>
        </div>
        <button type="button" className="btn btn-soft btn-sm menu-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('closeMenu') : t('menu')}</button>
      </div>
      {open && (
        <div className="wrap menu-panel">
          {links.map(([href, key]) => <a key={href} href={href} onClick={() => setOpen(false)}>{t(key)}</a>)}
          <div className="menu-row">
            <LangSwitch />
            <Link className="btn btn-soft btn-sm" to="/login">{t('signIn')}</Link>
            <Link className="btn btn-pop btn-sm" to="/register">{t('start')}</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="wrap hero" id="top">
      <div className="hero-card room-wall">
        <div className="hero-copy">
          <p className="tag-pill">{t('heroEyebrow')}</p>
          <h1><span>{t('heroA')}</span> <span className="accent">{t('heroB')}</span></h1>
          <p className="hero-sub">{t('heroSub')}</p>
          <div className="hero-ctas">
            <Link className="btn btn-pop btn-xl" to="/register">{t('ctaStart')}{Icon.arrow}</Link>
            <a className="btn btn-soft btn-xl" href="#how">{t('ctaHow')}</a>
          </div>
          <p className="trust">{t('trust')}</p>
        </div>
        <Toy />
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const steps = [{ n: 1, face: 'listening' }, { n: 2, face: 'thinking' }, { n: 3, face: 'happy' }];
  return (
    <section className="band" id="how">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('howEyebrow')}</p><h2>{t('howTitle')}</h2><p>{t('howSub')}</p></div>
        <div className="how">
          {steps.map((s) => (
            <article key={s.n} className="how-card">
              <span className="how-n">{s.n}</span>
              <Room size="sm" className="how-room"><span className="room-stage"><BuddyFigure emotion={s.face} /></span></Room>
              <h3>{t(`s${s.n}t`)}</h3>
              <p>{t(`s${s.n}b`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Emotions() {
  const { t } = useI18n();
  const [picked, setPicked] = useState('happy');
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reducedMotion()) return undefined;
    const id = setInterval(() => {
      setPicked((cur) => EMOTIONS[(EMOTIONS.indexOf(cur) + 1) % EMOTIONS.length]);
    }, 2400);
    return () => clearInterval(id);
  }, [auto]);
  const choose = (e) => {
    setAuto(false);
    setPicked(e);
  };
  return (
    <section className="band" id="emotions">
      <div className="wrap">
        <div className="emo card">
          <div className="band-head band-head--left"><p className="eyebrow">{t('emoEyebrow')}</p><h2>{t('emoTitle')}</h2><p>{t('emoSub')}</p></div>
          <div className="emo-layout">
            <Room size="md" className="emo-stage">
              <span className="room-stage"><BuddyFigure emotion={picked} label={t(`emo_${picked}`)} /></span>
              <div className="emo-caption" aria-live="polite"><b>{t(`emo_${picked}`)}</b><span>{t(`emoWhen_${picked}`)}</span></div>
            </Room>
            <div className="emo-grid">
              {EMOTIONS.map((e) => (
                <button key={e} type="button" className="emo-tile" aria-pressed={picked === e}
                  onClick={() => choose(e)} onPointerEnter={() => choose(e)} onFocus={() => choose(e)}>
                  <BuddyAvatar emotion={e} />
                  <span>{t(`emo_${e}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const { t } = useI18n();
  return (
    <section className="band" id="meet">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('featEyebrow')}</p><h2>{t('featTitle')}</h2></div>
        <div className="features">
          <article className="feature card">
            <div className="feature-art say-lines">
              <span className="say say--child">{t('f1c')}</span><span className="say say--buddy">{t('f1d')}</span>
              <span className="say say--child">{t('f1e')}</span><span className="say say--buddy">{t('f1f')}</span>
            </div>
            <h3>{t('f1t')}</h3><p>{t('f1b')}</p>
          </article>
          <article className="feature card">
            <div className="feature-art vad" aria-hidden="true">
              <div className="vad-wave">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ '--i': i }} />)}</div>
              <div className="vad-labels"><span className="vad-speak">{t('vadSpeak')}</span><span className="vad-done">{Icon.check}{t('vadDone')}</span></div>
            </div>
            <h3>{t('vadT')}</h3><p>{t('vadB')}</p>
          </article>
          <article className="feature card">
            <div className="feature-art scenes" aria-hidden="true">
              <span className="scene scene--a">{Icon.moon}</span>
              <span className="scene scene--b">{Icon.sun}</span>
              <span className="scene scene--c">{Icon.spark}</span>
              <span className="scene scene--d"><BuddyAvatar emotion="wink" size="sm" /></span>
            </div>
            <h3>{t('f3t')}</h3><p>{t('f3b')}</p>
          </article>
          <article className="feature card">
            <div className="feature-art personas">{ROLES.map((r, i) => <span key={r} className={`persona ${i === 0 ? 'is-on' : ''}`}>{t(`role_${r}`)}</span>)}</div>
            <h3>{t('f4t')}</h3><p>{t('f4b')}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

const SAFETY_ICONS = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /><path d="M4 4l16 16" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></>,
  tag: <><path d="M3.5 12.5l8-8H20v8.5l-8 8z" /><circle cx="15.5" cy="8.5" r="1.3" /><path d="M4 4l16 16" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>,
  hand: <path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-3.5L3.8 13a1.5 1.5 0 012.3-1.9L8 13" />,
};

function Safety() {
  const { t } = useI18n();
  const items = ['mic', 'shield', 'bell', 'tag', 'lock', 'hand'];
  return (
    <section className="band safety" id="safety">
      <div className="wrap safety-inner">
        <div className="safety-head">
          <p className="eyebrow">{t('safeEyebrow')}</p>
          <h2>{t('safeTitle')}</h2>
          <p>{t('safeSub')}</p>
          <Room size="sm" night className="safety-room"><span className="room-stage"><BuddyFigure emotion="sleepy" /></span></Room>
        </div>
        <div className="promises">
          {items.map((ic, i) => (
            <div key={ic} className="promise">
              <span className="promise-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SAFETY_ICONS[ic]}</svg></span>
              <h3>{t(`sa${i + 1}t`)}</h3>
              <p>{t(`sa${i + 1}b`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { t, lang } = useI18n();
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  useEffect(() => {
    api.packs().then((out) => { if (out?.packs?.length) setPacks(out.packs); }).catch(() => {});
  }, []);
  return (
    <section className="band" id="pricing">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('priceEyebrow')}</p><h2>{t('priceTitle')}</h2><p>{t('priceSub')}</p></div>
        <div className="free"><span className="coin coin--lg" aria-hidden="true"><span>C</span></span><span><b>{t('freeA')}</b> {t('freeB')}</span></div>
        <div className="shop shop--wide">
          {packs.map((p) => {
            const best = p.id === 'big';
            return (
              <article key={p.id} className={`shop-item ${best ? 'shop-item--best' : ''}`}>
                {best && <span className="ribbon">{t('best')}</span>}
                <CoinStack credits={p.credits} />
                <span className="shop-name">{t(`pack_${p.id}`)}</span>
                <span className="shop-credits">{t('credits', { n: p.credits })}</span>
                <span className="shop-price">{vnd(p.price_amount, lang)}</span>
                <span className="shop-per">{t('perAnswer', { p: vnd(pricePerAnswer(p), lang) })}</span>
                <Link className={`btn ${best ? 'btn-pop' : 'btn-soft'} btn-block`} to="/register">{t('choose')}</Link>
              </article>
            );
          })}
        </div>
        <div className="price-notes">
          {['note1', 'note2', 'note3'].map((k) => <span key={k}>{Icon.check}{t(k)}</span>)}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  return (
    <section className="band" id="faq">
      <div className="wrap wrap--narrow">
        <div className="band-head"><p className="eyebrow">{t('faqEyebrow')}</p><h2>{t('faqTitle')}</h2></div>
        <div className="faq">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <details key={n} open={n === 1}><summary>{t(`q${n}`)}<span className="faq-plus" aria-hidden="true">{Icon.plus}</span></summary><p>{t(`a${n}`)}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const { t } = useI18n();
  return (
    <section className="band closing">
      <div className="wrap">
        <div className="closing-card room-wall">
          <div className="closing-copy">
            <h2>{t('closeTitle')}</h2>
            <p>{t('closeSub')}</p>
            <Link className="btn btn-pop btn-xl" to="/register">{t('closeCta')}{Icon.arrow}</Link>
          </div>
          <span className="closing-figure"><BuddyFigure emotion="love" /></span>
        </div>
        <footer className="footer"><span className="wordmark"><BuddyAvatar emotion="neutral" size="sm" />Little Buddy</span><span>{t('footerMade')}</span><span>© 2026 Little Buddy</span></footer>
      </div>
    </section>
  );
}

export default function MarketingPage() {
  return (
    <div className="marketing">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Emotions />
        <Features />
        <Safety />
        <Pricing />
        <Faq />
        <Closing />
      </main>
    </div>
  );
}

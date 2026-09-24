import { useEffect, useRef, useState } from 'react';
import Face from '../components/Face.jsx';
import Toy from '../components/Toy.jsx';
import { Icon, LangSwitch } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Link } from '../lib/router.js';
import { reducedMotion, usePointerVars } from '../lib/motion.js';
import { EMOTIONS } from '../lib/emotions.js';
import { api } from '../lib/api.js';
import { vnd, pricePerAnswer } from '../lib/format.js';

// Shown if the price list cannot be fetched, so the page never renders an
// empty pricing section. Same values as migration 004.
const FALLBACK_PACKS = [
  { id: 'starter', credits: 20, price_amount: 49000, currency: 'VND' },
  { id: 'family', credits: 60, price_amount: 129000, currency: 'VND' },
  { id: 'big', credits: 150, price_amount: 299000, currency: 'VND' },
];

const GLYPHS = [
  ['?', 8, 18, 0, 11], ['★', 16, 70, 2, 14], ['!', 30, 30, 4, 9], ['♥', 44, 82, 1, 13], ['?', 58, 12, 3, 12],
  ['★', 70, 60, 5, 10], ['♪', 84, 26, 2, 15], ['!', 92, 74, 0, 12], ['★', 24, 90, 3, 9], ['?', 78, 88, 4, 11],
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
        <a className="wordmark" href="#top"><span className="dotface"><Face emotion="neutral" /></span><span>Little Buddy</span></a>
        <nav className="nav-links" aria-label={t('navSections')}>
          {links.map(([href, key]) => <a key={href} href={href}>{t(key)}</a>)}
        </nav>
        <div className="nav-actions">
          <LangSwitch dark />
          <Link className="btn ghost-light sm" to="/login">{t('signIn')}</Link>
          <Link className="btn apricot sm" to="/register">{t('start')}</Link>
        </div>
        <button type="button" className="menu-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('closeMenu') : t('menu')}</button>
      </div>
      {open && (
        <div className="wrap menu-panel">
          {links.map(([href, key]) => <a key={href} href={href} onClick={() => setOpen(false)}>{t(key)}</a>)}
          <div className="menu-row">
            <LangSwitch dark />
            <Link className="btn ghost-light sm" to="/login">{t('signIn')}</Link>
            <Link className="btn apricot sm" to="/register">{t('start')}</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const { t } = useI18n();
  const ref = useRef(null);
  usePointerVars(ref);
  return (
    <section className="hero" id="top" ref={ref}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="glyphs" aria-hidden="true">
        {GLYPHS.map(([g, x, y, d, s], i) => <span key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, fontSize: `${s * 2}px` }}>{g}</span>)}
      </div>
      <div className="wrap hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">{t('heroEyebrow')}</p>
          <h1>
            <span>{t('heroA')}</span>
            <span className="accent">{t('heroB')}</span>
          </h1>
          <p className="hero-sub">{t('heroSub')}</p>
          <div className="hero-ctas">
            <Link className="btn apricot lg sheen" to="/register">{t('ctaStart')}{Icon.arrow}</Link>
            <a className="btn ghost-light lg" href="#how">{t('ctaHow')}</a>
          </div>
          <p className="trust"><i />{t('trust')}</p>
        </div>
        <Toy />
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    { n: 1, face: 'listening' },
    { n: 2, face: 'happy' },
    { n: 3, face: null },
  ];
  return (
    <section className="band" id="how">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('howEyebrow')}</p><h2>{t('howTitle')}</h2><p>{t('howSub')}</p></div>
        <div className="steps">
          {steps.map((s) => (
            <article key={s.n} className="step lift">
              <div className="step-top">
                <span className="step-n">{s.n}</span>
                {s.face ? <span className="chip-screen"><Face emotion={s.face} /></span> : <span className="mini-phone"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="6.5" y="3" width="11" height="18" rx="3" /><path d="M10.5 17.5h3" /></svg></span>}
              </div>
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
    <section className="band alt" id="emotions">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('emoEyebrow')}</p><h2>{t('emoTitle')}</h2><p>{t('emoSub')}</p></div>
        <div className="emo-layout">
          <div className="emo-stage">
            <div className="emo-screen" key={picked}><Face emotion={picked} label={t(`emo_${picked}`)} /></div>
            <div className="emo-caption" aria-live="polite">
              <b>{t(`emo_${picked}`)}</b>
              <span>{t(`emoWhen_${picked}`)}</span>
            </div>
          </div>
          <div className="emo-grid">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="emo-tile"
                aria-pressed={picked === e}
                onClick={() => choose(e)}
                onPointerEnter={() => choose(e)}
                onFocus={() => choose(e)}
              >
                <span className="chip-screen"><Face emotion={e} /></span>
                <span>{t(`emo_${e}`)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const { t } = useI18n();
  const scenes = [
    <><rect width="100" height="100" fill="#79B4EE" /><circle cx="72" cy="28" r="12" fill="#FFE08A" /><path d="M0 78 Q30 64 55 76 T100 72 V100 H0z" fill="#2E9E80" /></>,
    <><rect width="100" height="100" fill="#183342" /><circle cx="30" cy="30" r="3" fill="#EAF2F4" /><circle cx="70" cy="20" r="2" fill="#EAF2F4" /><circle cx="55" cy="47" r="16" fill="#E8EFF1" /><circle cx="50" cy="42" r="3" fill="#A9BDC5" /></>,
    <><rect width="100" height="100" fill="#4FBF9F" /><path d="M20 72 Q50 30 80 72z" fill="#FF9F4A" /><circle cx="50" cy="45" r="8" fill="#FFD1A6" /></>,
    <><rect width="100" height="100" fill="#FFEBD8" /><path d="M15 80 L50 30 L85 80z" fill="#D96F14" /><rect x="44" y="60" width="12" height="20" fill="#10212B" /></>,
  ];
  return (
    <section className="band" id="meet">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('featEyebrow')}</p><h2>{t('featTitle')}</h2></div>
        <div className="bento">
          <article className="tile tile--a lift">
            <h3>{t('f1t')}</h3><p>{t('f1b')}</p>
            <div className="say-lines">
              <span className="say say--child">{t('f1c')}</span><span className="say say--buddy">{t('f1d')}</span>
              <span className="say say--child">{t('f1e')}</span><span className="say say--buddy">{t('f1f')}</span>
            </div>
          </article>
          <article className="tile tile--b lift">
            <h3>{t('vadT')}</h3><p>{t('vadB')}</p>
            <div className="vad" aria-hidden="true">
              <div className="vad-wave">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ '--i': i }} />)}</div>
              <div className="vad-labels"><span className="vad-speak">{t('vadSpeak')}</span><span className="vad-done">{Icon.check}{t('vadDone')}</span></div>
            </div>
          </article>
          <article className="tile tile--c lift">
            <h3>{t('f3t')}</h3><p>{t('f3b')}</p>
            <div className="scenes">{scenes.map((sc, i) => <div key={i} className="scene"><svg viewBox="0 0 100 100" aria-hidden="true">{sc}</svg></div>)}</div>
          </article>
          <article className="tile tile--d lift">
            <span className="soon">{t('soon')}</span>
            <h3>{t('f4t')}</h3><p>{t('f4b')}</p>
            <div className="personas">{['pFriend', 'pTeacher', 'pDad', 'pMom'].map((k) => <span key={k} className="persona">{t(k)}</span>)}</div>
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
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('safeEyebrow')}</p><h2>{t('safeTitle')}</h2><p>{t('safeSub')}</p></div>
        <div className="promises">
          {items.map((ic, i) => (
            <div key={ic} className="promise">
              <div className="ic"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="draw">{SAFETY_ICONS[ic]}</svg></div>
              <h3>{t(`sa${i + 1}t`)}</h3>
              <p>{t(`sa${i + 1}b`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({ pack }) {
  const { t, lang } = useI18n();
  const ref = useRef(null);
  usePointerVars(ref, { tilt: true });
  const best = pack.id === 'big';
  return (
    <article className={`price ${best ? 'price--best' : ''}`}>
      <div className="price-inner" ref={ref}>
        <h3>{t(`pack_${pack.id}`)}{best && <span className="badge">{t('best')}</span>}</h3>
        <div className="price-amt">{vnd(pack.price_amount, lang)}</div>
        <div className="price-credits">{t('credits', { n: pack.credits })}</div>
        <div className="price-per">{t('perAnswer', { p: vnd(pricePerAnswer(pack), lang) })}</div>
        <Link className={`btn ${best ? 'apricot' : 'ghost'} block`} to="/register">{t('choose')}</Link>
      </div>
    </article>
  );
}

function Pricing() {
  const { t } = useI18n();
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  useEffect(() => {
    api.packs().then((out) => { if (out?.packs?.length) setPacks(out.packs); }).catch(() => {});
  }, []);
  return (
    <section className="band" id="pricing">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('priceEyebrow')}</p><h2>{t('priceTitle')}</h2><p>{t('priceSub')}</p></div>
        <div className="free"><b>{t('freeA')}</b><span>{t('freeB')}</span></div>
        <div className="price-grid">{packs.map((p) => <PriceCard key={p.id} pack={p} />)}</div>
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
    <section className="band alt" id="faq">
      <div className="wrap">
        <div className="band-head"><p className="eyebrow">{t('faqEyebrow')}</p><h2>{t('faqTitle')}</h2></div>
        <div className="faq">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <details key={n}><summary>{t(`q${n}`)}</summary><p>{t(`a${n}`)}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const { t } = useI18n();
  return (
    <section className="closing">
      <div className="wrap">
        <div className="closing-card">
          <div className="closing-faces" aria-hidden="true">
            {['happy', 'love', 'excited', 'wink'].map((e, i) => <span key={e} className="chip-screen float" style={{ '--i': i }}><Face emotion={e} /></span>)}
          </div>
          <div>
            <h2>{t('closeTitle')}</h2>
            <p>{t('closeSub')}</p>
          </div>
          <Link className="btn dark lg sheen" to="/register">{t('closeCta')}{Icon.arrow}</Link>
        </div>
        <footer className="footer"><span>© 2026 Little Buddy</span><span>{t('footerMade')}</span></footer>
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

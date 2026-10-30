import { useEffect } from 'react';
import '../../styles/care.css';
import { BuddyAvatar, BuddyFigure } from '../../components/Buddy.jsx';
import Room from '../../components/Room.jsx';
import { Chip, Icon, Skeleton } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { Link, navigate, useLocation } from '../../lib/router.js';
import { designFor } from '../../lib/buddy.js';
import { CARE_TABS, STAGES, careHref, careState, dayLabel } from '../../lib/care.js';
import { useFamilyData } from '../data.jsx';
import { CareIcon } from './common.jsx';
import MemoryTab from './MemoryTab.jsx';
import SafetyTab from './SafetyTab.jsx';
import WeeklyTab from './WeeklyTab.jsx';
import RulesTab from './RulesTab.jsx';

// Care: what Buddy knows about a child, the safety alerts, the weekly
// digests and the rules, one child at a time. The address names the child
// and the tab (?child=<id>&tab=memory|safety|weekly|rules), so a link from
// the alerts badge, a reload or the back button lands on the same view.
// Each tab loads its own data when it opens.

const PANELS = { memory: MemoryTab, safety: SafetyTab, weekly: WeeklyTab, rules: RulesTab };
const TAB_ICONS = { memory: CareIcon.heart, safety: CareIcon.shield, weekly: CareIcon.calendar, rules: Icon.sliders };

export default function CareScreen() {
  const { t } = useI18n();
  const d = useFamilyData();
  const { search } = useLocation();
  const kids = d?.children ?? [];
  const alerts = d?.alerts ?? {};
  const { childId, tab, settled } = careState(search, kids, alerts);

  // Writes the defaults into the address once, so the view does not move
  // when, say, the last waiting alert is acknowledged.
  useEffect(() => {
    if (!settled) navigate(careHref({ childId, tab }), { replace: true, scroll: false });
  }, [settled, childId, tab]);

  if (!d || d.loading) {
    return (
      <div className="care" aria-busy="true">
        <Skeleton h={128} r={28} />
        <Skeleton h={70} r={24} />
        <Skeleton h={260} r={26} />
      </div>
    );
  }
  if (!kids.length) return <NoChild />;

  const child = kids.find((c) => c.id === childId) ?? kids[0];
  const buddy = d.buddies?.[child.id] ?? null;
  const design = designFor(buddy?.character_slug);
  const buddyName = buddy?.character_name ?? 'Buddy';
  // Another child or tab is the same screen: the page stays where it is.
  const go = (next) => navigate(careHref({ childId: child.id, tab, ...next }), { replace: true, scroll: false });
  const Panel = PANELS[tab];

  return (
    <div className="care">
      {kids.length > 1 && (
        <div className="care-kids" role="group" aria-label={t('careKids')}>
          {kids.map((c) => {
            const b = d.buddies?.[c.id] ?? null;
            const waiting = alerts[c.id] ?? 0;
            const on = c.id === child.id;
            return (
              <button key={c.id} type="button" className="care-kid" aria-pressed={on} onClick={() => go({ childId: c.id })}>
                <BuddyAvatar design={designFor(b?.character_slug)} emotion={on ? 'happy' : 'neutral'} size="sm" />
                <span>{c.name}</span>
                {waiting > 0 && <span className="care-dot" aria-hidden="true">{waiting}</span>}
                {waiting > 0 && <span className="sr-only">{t('careAlertsWaiting', { n: waiting })}</span>}
              </button>
            );
          })}
        </div>
      )}

      <Hero child={child} buddy={buddy} design={design} buddyName={buddyName} />

      <Tabs tab={tab} onPick={(name) => go({ tab: name })} waiting={alerts[child.id] ?? 0} buddyName={buddyName} />

      <div id="care-panel" className="care-panel" role="tabpanel" aria-labelledby={`care-tab-${tab}`}>
        <Panel key={`${child.id}:${tab}`} child={child} buddy={buddy} design={design} buddyName={buddyName} />
      </div>
    </div>
  );
}

// The child and their Buddy in a little room, how long they have been
// friends and whether Buddy is remembering.
function Hero({ child, buddy, design, buddyName }) {
  const { t, lang } = useI18n();
  const stage = STAGES.includes(buddy?.relationship_stage) ? buddy.relationship_stage : null;
  return (
    <section className="care-hero" aria-labelledby="care-hero-title">
      <Room size="sm" className="care-hero-room">
        <span className="room-stage"><BuddyFigure design={design} emotion={buddy ? 'love' : 'sleepy'} dim={!buddy} /></span>
      </Room>
      <div className="care-hero-text">
        <h2 id="care-hero-title">{buddy ? t('careHeroTitle', { buddy: buddyName, child: child.name }) : child.name}</h2>
        <div className="chips">
          {stage && <Chip tone="pop">{t(`careStage_${stage}`)}</Chip>}
          <Chip tone={child.learning_enabled ? 'ok' : 'rest'} dot>{t(child.learning_enabled ? 'careLearningOnChip' : 'careLearningOffChip')}</Chip>
        </div>
        {buddy?.met_on && <span className="muted small">{t('careMetOn', { date: dayLabel(buddy.met_on, lang, { year: true }) })}</span>}
        {!buddy && <span className="muted small">{t('careNoBuddy')}</span>}
      </div>
    </section>
  );
}

const MOVE_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
const tabOf = (e) => e.target.closest?.('[role="tab"]')?.id.replace('care-tab-', '');

// Tabs in the WAI-ARIA pattern: one tab stop, arrows and Home/End move
// between them.
function Tabs({ tab, onPick, waiting, buddyName }) {
  const { t } = useI18n();
  const onKey = (e) => {
    const focused = CARE_TABS.indexOf(tabOf(e));
    const i = focused >= 0 ? focused : CARE_TABS.indexOf(tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: CARE_TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const name = CARE_TABS[(to + CARE_TABS.length) % CARE_TABS.length];
    // Opening a tab mounts its panel, which starts every request it needs,
    // so a held arrow only moves the focus; the tab it stops on opens when
    // the key comes up.
    if (!e.repeat) onPick(name);
    document.getElementById(`care-tab-${name}`)?.focus();
  };
  const onKeyUp = (e) => {
    const name = tabOf(e);
    if (MOVE_KEYS.includes(e.key) && CARE_TABS.includes(name) && name !== tab) onPick(name);
  };
  return (
    <div className="care-tabs" role="tablist" aria-label={t('careTabs')} onKeyDown={onKey} onKeyUp={onKeyUp}>
      {CARE_TABS.map((name) => {
        const on = tab === name;
        const badge = name === 'safety' && waiting > 0;
        return (
          <button key={name} id={`care-tab-${name}`} type="button" role="tab" className="care-tab"
            aria-selected={on} aria-controls="care-panel" tabIndex={on ? 0 : -1} onClick={() => onPick(name)}>
            <span className="care-tab-icon">
              {TAB_ICONS[name]}
              {badge && <span className="care-badge" aria-hidden="true">{waiting > 9 ? '9+' : waiting}</span>}
            </span>
            <span className="care-tab-label">{t(`careTab_${name}`, { buddy: buddyName })}</span>
            {badge && <span className="sr-only">{t('careAlertsWaiting', { n: waiting })}</span>}
          </button>
        );
      })}
    </div>
  );
}

function NoChild() {
  const { t } = useI18n();
  return (
    <section className="card care-empty">
      <span className="care-empty-figure"><BuddyFigure emotion="curious" /></span>
      <h2>{t('careNoChildT')}</h2>
      <p className="muted">{t('careNoChildB')}</p>
      <Link className="btn btn-pop" to="/app/family">{Icon.plus}{t('careNoChildCta')}</Link>
    </section>
  );
}

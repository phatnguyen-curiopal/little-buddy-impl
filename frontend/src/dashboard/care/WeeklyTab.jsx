import { useState } from 'react';
import { BuddyFigure } from '../../components/Buddy.jsx';
import { Icon } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { number } from '../../lib/format.js';
import { digestView, weekLabel } from '../../lib/care.js';
import { CareIcon, Loadable, usePaged } from './common.jsx';

// Weekly digests: the week's themes, written for a parent after Sunday
// night (never the child's words), newest first. One week at a time.
export default function WeeklyTab({ child, buddyName }) {
  const { t, lang } = useI18n();
  const digests = usePaged((cursor) => api.digests(child.id, { cursor }));
  const [picked, setPicked] = useState(null);
  const vars = { buddy: buddyName, child: child.name };
  const list = digests.items;
  const current = list.find((x) => x.id === picked) ?? list[0] ?? null;

  return (
    <Loadable state={digests} rows={3}>
      {current ? (
        <div className="care-weekly">
          <nav className="care-weeks" aria-label={t('careWeeks')}>
            {list.map((w) => (
              <button key={w.id} type="button" className="pill-btn" aria-pressed={w.id === current.id} onClick={() => setPicked(w.id)}>
                {weekLabel(w.week_start, lang)}
              </button>
            ))}
            {digests.next && (
              <button type="button" className="pill-btn" disabled={digests.loadingMore || digests.loading} onClick={digests.loadMore}>{t('careOlderWeeks')}</button>
            )}
          </nav>
          <Digest key={current.id} digest={current} vars={vars} />
        </div>
      ) : (
        <section className="card care-empty">
          <span className="care-empty-figure"><BuddyFigure emotion="sleepy" /></span>
          <h3>{t('careWeeklyEmptyT')}</h3>
          <p className="muted">{t('careWeeklyEmptyB', vars)}</p>
        </section>
      )}
    </Loadable>
  );
}

function Digest({ digest, vars }) {
  const { t, lang } = useI18n();
  const v = digestView(digest.content);
  const nothing = !v.highlights.length && !v.newInterests.length && !v.moodTrend && !v.people.length && !v.starters.length && !v.growth.length && !v.words.length;
  return (
    <article className="card care-digest" aria-labelledby="care-digest-title">
      <div className="care-digest-head">
        <h3 id="care-digest-title" className="card-title">{t('careWeekOf', { range: weekLabel(digest.week_start, lang) })}</h3>
        <div className="care-digest-stats">
          <span className="care-stat-chip">{Icon.chat}{t(v.turns === 1 ? 'careWeekTurnsOne' : 'careWeekTurns', { n: number(v.turns, lang) })}</span>
          <span className="care-stat-chip">{CareIcon.clock}{t(v.minutes === 1 ? 'careWeekMinutesOne' : 'careWeekMinutes', { n: number(v.minutes, lang) })}</span>
        </div>
      </div>

      {v.moodTrend && (
        <Part title={t('careMoodTrend')}>
          <p className="care-mood-trend">{v.moodTrend}</p>
        </Part>
      )}
      {v.highlights.length > 0 && (
        <Part title={t('careHighlights')}>
          <ul className="care-bullets">{v.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </Part>
      )}
      {v.newInterests.length > 0 && (
        <Part title={t('careNewInterests', vars)}>
          <div className="chips">{v.newInterests.map((x, i) => <span key={i} className="care-tag care-tag--passions">{x}</span>)}</div>
        </Part>
      )}
      {v.people.length > 0 && (
        <Part title={t('careWeekPeople', vars)}>
          <div className="chips">{v.people.map((x, i) => <span key={i} className="care-tag">{x}</span>)}</div>
        </Part>
      )}
      {v.growth.length > 0 && (
        <Part title={t('careGrowth', vars)}>
          <ul className="care-lines">
            {v.growth.map((g, i) => (
              <li key={i} className="care-growth">
                <span className="care-heard">{g.before}</span>
                <span className="care-arrow" aria-hidden="true">{Icon.arrow}</span>
                <span className="sr-only">{t('careGrowthNow')}</span>
                <b>{g.after}</b>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {v.words.length > 0 && (
        <Part title={t('careWeekWords')}>
          <div className="chips">
            {v.words.map((w, i) => <span key={i} className="care-tag">{w.word}{w.meaning ? ` · ${w.meaning}` : ''}</span>)}
          </div>
        </Part>
      )}
      {v.starters.length > 0 && (
        <Part title={t('careStarters')} hint={t('careStartersHint', vars)}>
          <ul className="care-starters">{v.starters.map((s, i) => <li key={i} className="care-starter">{s}</li>)}</ul>
        </Part>
      )}
      {nothing && <p className="empty">{t('careWeekQuiet', vars)}</p>}
    </article>
  );
}

function Part({ title, hint, children }) {
  return (
    <section className="care-digest-part">
      <h4>{title}</h4>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );
}

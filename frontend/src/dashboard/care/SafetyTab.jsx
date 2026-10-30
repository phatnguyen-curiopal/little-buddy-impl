import { useEffect, useRef, useState } from 'react';
import { BuddyFigure } from '../../components/Buddy.jsx';
import { Chip, Icon, useErrorText, useToast } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { relativeTime } from '../../lib/format.js';
import { alertKind, momentLabel, severityTone, sortAlerts, waitingAlerts, withoutId } from '../../lib/care.js';
import { useFamilyData } from '../data.jsx';
import { CareIcon, DeleteButton, Loadable, MoreButton, usePaged } from './common.jsx';

const focusSoon = (id) => requestAnimationFrame(() => document.getElementById(id)?.focus());

// Safety alerts: what Buddy noticed that a parent should know (concern and
// urgent only). The excerpt is the one place the site ever shows a child's
// own words; React escapes it like any other text, and once an alert is
// seen the parent can delete it, words and all.
export default function SafetyTab({ child, design, buddyName }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const alerts = usePaged((cursor) => api.alerts(child.id, { cursor }));
  const [busy, setBusy] = useState(null);
  const [showSeen, setShowSeen] = useState(false);
  const vars = { buddy: buddyName, child: child.name };
  const sorted = sortAlerts(alerts.items);
  const waiting = waitingAlerts(sorted);
  const seen = sorted.filter((a) => a.acknowledged_at);

  // The family data refreshes every 30 s with each child's count of waiting
  // alerts (the badges). A count other than the one this panel expects means
  // something changed elsewhere (a new alert, one seen on another device), so
  // the first page is fetched again, in place. Checked on every refresh, not
  // only when the count moves: an acknowledgement here and a new alert can
  // cancel out. The panel's own acknowledgements lower the expectation
  // first, so they fetch nothing.
  const familyWaiting = d?.alerts?.[child.id] ?? 0;
  const expected = useRef(familyWaiting);
  const { reload } = alerts;
  useEffect(() => {
    if (familyWaiting === expected.current) return;
    expected.current = familyWaiting;
    reload();
  }, [d?.alerts, familyWaiting, reload]);

  const acknowledge = async (alert) => {
    setBusy(alert.id);
    try {
      await api.acknowledgeAlert(child.id, alert.id);
      const next = waiting.find((a) => a.id !== alert.id);
      alerts.setItems((list) => list.map((a) => (a.id === alert.id ? { ...a, acknowledged_at: new Date().toISOString() } : a)));
      expected.current = Math.max(0, expected.current - 1);
      toast(t('careAckToast'));
      // The waiting card leaves; focus moves to the next one, or the heading.
      focusSoon(next ? `care-ack-${next.id}` : 'care-safety-title');
      // The nav badge and the child chips count waiting alerts.
      d?.reload();
    } catch (err) {
      if (err.status === 404) alerts.reload();
      toast(errText(err), 'bad');
    } finally {
      setBusy(null);
    }
  };

  // Only a seen alert can be deleted, and the badges count waiting ones, so
  // no family reload follows: it would spend a whole family load of the
  // parent's per-minute call budget on every alert cleared, for nothing.
  const remove = async (alert) => {
    try {
      await api.deleteAlert(child.id, alert.id);
      alerts.setItems((list) => withoutId(list, alert.id));
      toast(t('careDeleted'));
      // The card is gone: focus goes to the seen list's toggle, or to the
      // heading when that was the last seen alert.
      focusSoon(seen.some((a) => a.id !== alert.id) ? 'care-seen-toggle' : 'care-safety-title');
    } catch (err) {
      if (err.status === 404) {
        alerts.reload();
        toast(t('careGone'), 'bad');
      } else {
        toast(errText(err), 'bad');
      }
    }
  };

  return (
    <div className="care-safety">
      <p className="note">{Icon.lock}<span>{t('careSafetyNote', vars)}</span></p>
      <Loadable state={alerts} rows={2}>
        {sorted.length === 0 ? (
          <section className="card care-empty" aria-labelledby="care-safety-title">
            <span className="care-empty-figure"><BuddyFigure design={design} emotion="happy" /></span>
            <h3 id="care-safety-title" tabIndex={-1}>{t('careSafeEmptyT')}</h3>
            <p className="muted">{t('careSafeEmptyB', vars)}</p>
          </section>
        ) : (<>
          <section className="care-alerts" aria-labelledby="care-safety-title">
            <h3 id="care-safety-title" className="care-subtitle" tabIndex={-1}>
              {waiting.length ? t('careWaitingTitle', { n: waiting.length }) : t('careAllSeen')}
            </h3>
            {waiting.length > 0 ? (
              <div className="care-alert-list">
                {waiting.map((a) => <AlertCard key={a.id} alert={a} vars={vars} busy={busy === a.id} onAck={() => acknowledge(a)} />)}
              </div>
            ) : <p className="muted">{t('careAllSeenB', vars)}</p>}
          </section>
          {seen.length > 0 && (
            <section className="care-alerts" aria-label={t('careSeenTitle')}>
              <button id="care-seen-toggle" type="button" className="btn btn-soft btn-sm care-seen-toggle" aria-expanded={showSeen} aria-controls="care-seen-list" onClick={() => setShowSeen((v) => !v)}>
                {showSeen ? t('careSeenHide') : t('careSeenShow', { n: seen.length })}
              </button>
              {showSeen && (
                <div id="care-seen-list" className="care-alert-list">
                  {seen.map((a) => <AlertCard key={a.id} alert={a} vars={vars} onDelete={() => remove(a)} />)}
                </div>
              )}
            </section>
          )}
          <MoreButton list={alerts} />
        </>)}
      </Loadable>
      <p className="muted small care-safety-how">{t('careSafetyHow', vars)}</p>
    </div>
  );
}

function AlertCard({ alert, vars, busy = false, onAck, onDelete }) {
  const { t, lang } = useI18n();
  const kind = alertKind(alert.category);
  const urgent = alert.severity === 'urgent';
  const titleId = `care-alert-${alert.id}`;
  const title = t(`careCat_${kind}`, vars);
  return (
    <article className={['care-alert', urgent && 'care-alert--urgent', alert.acknowledged_at && 'is-seen'].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <div className="care-alert-head">
        <Chip tone={severityTone(alert.severity)} dot>{t(urgent ? 'careSevUrgent' : 'careSevConcern')}</Chip>
        <time className="muted small" dateTime={alert.created_at} title={momentLabel(alert.created_at, lang)}>{relativeTime(alert.created_at, t)}</time>
      </div>
      <h4 id={titleId} className="care-alert-title">{title}</h4>
      {alert.excerpt && (
        <figure className="care-quote">
          <blockquote>{alert.excerpt}</blockquote>
          <figcaption className="muted small">{t('careQuoteBy', vars)}</figcaption>
        </figure>
      )}
      <p className="care-tip">{CareIcon.bulb}<span>{t(`careTip_${kind}`, vars)}</span></p>
      {alert.acknowledged_at ? (
        <div className="care-alert-foot">
          <span className="muted small">{t('careSeenAt', { time: relativeTime(alert.acknowledged_at, t) })}</span>
          {onDelete && (
            <DeleteButton
              label={t('careAlertDelete', { title })}
              question={alert.excerpt ? t('careAlertDeleteQuoteAsk', vars) : t('careAlertDeleteAsk')}
              onConfirm={onDelete}
            />
          )}
        </div>
      ) : (
        <button id={`care-ack-${alert.id}`} type="button" className="btn btn-pop btn-sm care-ack" disabled={busy} onClick={onAck}>
          {Icon.check}{busy ? t('wait') : t('careAck')}
        </button>
      )}
    </article>
  );
}

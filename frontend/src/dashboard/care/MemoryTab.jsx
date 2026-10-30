import { useRef, useState } from 'react';
import { useErrorText, useToast } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { LEARNING_CONSENT_VERSION, SUMMARY_GROUPS, hasConsent, summaryEmpty } from '../../lib/care.js';
import { useFamilyData } from '../data.jsx';
import { Loadable, Section, useAutoFocus, useFocusBack, useLoad } from './common.jsx';
import { EventsSection, FactsSection, PeopleSection, RelationshipSection, SpeechSection, TraitsSection, WordsSection } from './memory.jsx';

// What Buddy knows: the learning switch first (it needs the family's
// learning consent), then everything Buddy remembers, each part fixable or
// deletable, and at the end a way to forget it all.
export default function MemoryTab({ child, buddyName }) {
  // Forgetting everything bumps this, so every section mounts again and
  // reloads what is (no longer) there.
  const [round, setRound] = useState(0);
  const props = { childId: child.id, child, buddyName };
  return (
    <div className="care-cols">
      <div className="care-col">
        <LearningCard child={child} buddyName={buddyName} />
        <SummaryCard key={`s${round}`} {...props} />
        <PeopleSection key={`p${round}`} {...props} />
        <FactsSection key={`f${round}`} {...props} />
      </div>
      <div className="care-col">
        <EventsSection key={`e${round}`} {...props} />
        <RelationshipSection key={`r${round}`} {...props} />
        <WordsSection key={`w${round}`} {...props} />
        <SpeechSection key={`h${round}`} {...props} />
        <TraitsSection key={`t${round}`} {...props} />
        <ForgetCard {...props} onForgotten={() => setRound((n) => n + 1)} />
      </div>
    </div>
  );
}

function LearningCard({ child, buddyName }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const consents = useLoad(() => api.consents());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = child.learning_enabled === true;
  const vars = { buddy: buddyName, child: child.name };
  useFocusBack(asking, 'care-learn');

  const setLearning = async (value) => {
    setBusy(true);
    let done = false;
    try {
      await api.updateChild(child.id, { learning_enabled: value });
      done = true;
      await d.reload();
      toast(t(value ? 'careLearnOnToast' : 'careLearnOffToast', vars));
    } catch (err) {
      // The consent may have been withdrawn on another device meanwhile.
      if (err.code === 'consent_required') setAsking(true);
      else toast(errText(err), 'bad');
    } finally {
      // The switch is enabled again in the same render that closes the
      // question, so focus can go back to it.
      setBusy(false);
      if (done) setAsking(false);
    }
  };

  const agree = async () => {
    setBusy(true);
    try {
      await api.giveConsent('learning', LEARNING_CONSENT_VERSION);
    } catch (err) {
      toast(errText(err), 'bad');
      setBusy(false);
      return;
    }
    consents.reload();
    await setLearning(true);
  };

  // Turning on without the consent asks for it first; the switch only moves
  // once the backend agrees.
  const toggle = (checked) => {
    if (!checked) setLearning(false);
    else if (hasConsent(consents.data)) setLearning(true);
    else setAsking(true);
  };

  return (
    <section className={`card care-learning ${on ? 'is-on' : ''}`} aria-labelledby="care-learn-title">
      <label className="switch-row" htmlFor="care-learn">
        <span>
          <span id="care-learn-title" className="care-label">{t('careLearnTitle', vars)}</span>
          <span className="muted small">{t(on ? 'careLearnOnHelp' : 'careLearnOffHelp', vars)}</span>
        </span>
        <input id="care-learn" type="checkbox" role="switch" className="switch" checked={on} disabled={busy || (consents.loading && consents.data == null)}
          aria-describedby={asking && !on ? 'care-consent-title' : undefined} onChange={(e) => toggle(e.target.checked)} />
      </label>
      {asking && !on && <ConsentAsk vars={vars} busy={busy} onAgree={agree} onLater={() => setAsking(false)} />}
    </section>
  );
}

// Plain words about what Buddy will keep, asked once for the family.
function ConsentAsk({ vars, busy, onAgree, onLater }) {
  const { t } = useI18n();
  const first = useAutoFocus();
  return (
    <div className="care-consent" role="group" aria-labelledby="care-consent-title">
      <h4 id="care-consent-title">{t('careConsentTitle', vars)}</h4>
      <p>{t('careConsentIntro', vars)}</p>
      <ul className="care-bullets">
        <li>{t('careConsentPeople')}</li>
        <li>{t('careConsentLikes')}</li>
        <li>{t('careConsentEvents', vars)}</li>
        <li>{t('careConsentSpeech', vars)}</li>
      </ul>
      <p className="small">{t('careConsentControl', vars)}</p>
      <p className="muted small">{t('careConsentFamily')}</p>
      <div className="row-actions">
        <button ref={first} type="button" className="btn btn-pop" disabled={busy} onClick={onAgree}>{busy ? t('saving') : t('careConsentYes')}</button>
        <button type="button" className="btn btn-soft" disabled={busy} onClick={onLater}>{t('later')}</button>
      </div>
    </div>
  );
}

// The short digest Buddy carries into every chat.
function SummaryCard({ childId, child, buddyName }) {
  const { t } = useI18n();
  const summary = useLoad(() => api.memorySummary(childId));
  const s = summary.data;
  const counts = s?.counts ?? {};
  return (
    <Section id="care-summary" title={t('careSummaryTitle', { buddy: buddyName })}>
      <Loadable state={summary} rows={3}>
        {s && (<>
          <div className="care-stats">
            <Stat n={counts.people} label={t('careCountPeople')} />
            <Stat n={counts.facts} label={t('careCountFacts')} />
            <Stat n={counts.events} label={t('careCountEvents')} />
          </div>
          {summaryEmpty(s) ? (
            <p className="empty">{t('careSummaryEmpty', { buddy: buddyName, child: child.name })}</p>
          ) : (
            <div className="care-groups">
              {SUMMARY_GROUPS.filter((g) => Array.isArray(s[g]) && s[g].length).map((g) => (
                <div key={g} className="care-group">
                  <span className="care-group-label">{t(`careSum_${g}`)}</span>
                  <div className="chips">{s[g].map((x, i) => <span key={`${i}-${x}`} className={`care-tag care-tag--${g}`}>{x}</span>)}</div>
                </div>
              ))}
            </div>
          )}
        </>)}
      </Loadable>
    </Section>
  );
}

function Stat({ n, label }) {
  return <div className="care-stat"><b>{Number.isFinite(n) ? n : 0}</b><span>{label}</span></div>;
}

// Forget everything: asks once, says what goes and what stays.
function ForgetCard({ childId, child, buddyName, onForgotten }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef(null);
  const vars = { buddy: buddyName, child: child.name };
  useFocusBack(asking, button);

  const forget = async () => {
    setBusy(true);
    try {
      await api.forgetEverything(childId);
      setAsking(false);
      onForgotten();
      d.reload();
      toast(t('careForgetDone', vars));
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card care-danger" aria-labelledby="care-forget-title">
      <h3 id="care-forget-title" className="card-title">{t('careForgetTitle')}</h3>
      <p className="muted small">{t('careForgetHelp', vars)}</p>
      {asking ? (
        <ForgetAsk vars={vars} busy={busy} onYes={forget} onNo={() => setAsking(false)} />
      ) : (
        <button ref={button} type="button" className="btn btn-danger btn-block" onClick={() => setAsking(true)}>{t('careForgetButton', vars)}</button>
      )}
    </section>
  );
}

function ForgetAsk({ vars, busy, onYes, onNo }) {
  const { t } = useI18n();
  const yes = useAutoFocus();
  return (
    <div className="care-confirm" role="group" aria-labelledby="care-forget-ask">
      <p id="care-forget-ask"><b>{t('careForgetAsk', vars)}</b></p>
      <ul className="care-bullets">
        <li>{t('careForgetGoes', vars)}</li>
        <li>{t('careForgetStays', vars)}</li>
        <li>{t('careForgetLearning', vars)}</li>
      </ul>
      <div className="row-actions">
        <button ref={yes} type="button" className="btn btn-danger-solid" disabled={busy} onClick={onYes}>{busy ? t('wait') : t('careForgetYes')}</button>
        <button type="button" className="btn btn-soft" disabled={busy} onClick={onNo}>{t('cancel')}</button>
      </div>
    </div>
  );
}

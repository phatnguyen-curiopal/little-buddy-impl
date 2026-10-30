import { useEffect, useState } from 'react';
import { BuddyAvatar } from '../../components/Buddy.jsx';
import { Icon, useErrorText, useToast } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { relativeTime } from '../../lib/format.js';
import {
  GOALS_MAX, GOAL_LEN, GOAL_SUGGESTIONS, LIMIT_MAX, LIMIT_MIN, LIMIT_PRESETS, MOOD_PIN_START, NUDGE_LEN, TOPICS_MAX, TOPIC_LEN,
  addEntry, clampMood, controlsBody, controlsChanged, controlsForm, dayLabel, goalKey, isoDay, localDay, moodBand, moodFace,
  nudgeBody, removeEntry, splitNudges, withoutId,
} from '../../lib/care.js';
import { useFamilyData } from '../data.jsx';
import { DeleteButton, Loadable, Section, useLoad } from './common.jsx';

// The rules a parent sets for one child: how long Buddy may talk each day,
// quiet hours, bedtime, topics to steer away from, Buddy's mood, surprise
// games and greeting first. Saved together with one PUT guarded by the
// etag. Beside them: things to bring up (nudges) and goals.
export default function RulesTab({ child, design, buddyName }) {
  const props = { child, buddyName };
  return (
    <div className="care-cols">
      <div className="care-col"><ControlsCard {...props} design={design} /></div>
      <div className="care-col">
        <NudgesCard {...props} />
        <GoalsCard {...props} />
      </div>
    </div>
  );
}

const focusSoon = (id) => requestAnimationFrame(() => document.getElementById(id)?.focus());
const FIELD_OF = { limit: 'care-limit', quiet: 'care-quiet-start', bedtime: 'care-bedtime' };

function ControlsCard({ child, design, buddyName }) {
  const { t } = useI18n();
  const d = useFamilyData();
  const toast = useToast();
  const errText = useErrorText();
  const controls = useLoad(() => api.controls(child.id));
  // While the voice service keeps Buddy from greeting first (/me says
  // speak_first: false, as in production), the switch would change nothing,
  // so it is hidden; the stored choice still goes back unchanged with every
  // save, ready for when greeting first is switched on.
  const canSpeakFirst = d?.me?.speak_first === true;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const vars = { buddy: buddyName, child: child.name };

  // Every fresh copy from the server (the first load, a save, the reload
  // after someone else's change) becomes the form.
  useEffect(() => {
    if (controls.data) {
      setForm(controlsForm(controls.data));
      setShowErrors(false);
    }
  }, [controls.data]);

  if (!form) {
    return (
      <section className="card care-rules" aria-labelledby="care-rules-title">
        <h3 id="care-rules-title" className="card-title">{t('careRulesTitle')}</h3>
        <Loadable state={controls} rows={4}>{null}</Loadable>
      </section>
    );
  }

  const { body, errors } = controlsBody(form);
  const changed = controlsChanged(form, controls.data);
  const bad = (field) => showErrors && errors.includes(field);
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setStale(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (errors.length) {
      setShowErrors(true);
      focusSoon(FIELD_OF[errors[0]]);
      return;
    }
    setSaving(true);
    try {
      const row = await api.putControls(child.id, body, controls.data.etag);
      controls.setData(row);
      toast(t('careRulesSaved'));
    } catch (err) {
      if (err.code === 'stale_write') {
        // Someone changed these meanwhile (another parent, another tab):
        // show theirs rather than overwrite it, and say so.
        await controls.reload();
        setStale(true);
      } else {
        toast(errText(err), 'bad');
      }
    } finally {
      setSaving(false);
    }
  };

  const undo = () => {
    setForm(controlsForm(controls.data));
    setShowErrors(false);
  };

  const mood = form.moodPin;
  const moodText = mood === null ? '' : t('careMoodValue', { n: mood, mood: t(`careMood_${moodBand(mood)}`) });

  return (
    <form className="card care-rules" onSubmit={save} noValidate aria-labelledby="care-rules-title">
      <h3 id="care-rules-title" className="card-title">{t('careRulesTitle')}</h3>
      {stale && <div className="banner banner--warn" role="alert">{Icon.alert}<span>{t('careRulesStale')}</span></div>}

      <fieldset className="care-field">
        <legend className="care-label">{t('careLimitLabel')}</legend>
        <div className="chips">
          <button type="button" className="pill-btn" aria-pressed={form.limit === 'off'} onClick={() => set({ limit: 'off' })}>{t('careLimitOff')}</button>
          {LIMIT_PRESETS.map((m) => (
            <button key={m} type="button" className="pill-btn" aria-pressed={form.limit === m} onClick={() => set({ limit: m })}>{t('careMinutesShort', { n: m })}</button>
          ))}
          <button type="button" className="pill-btn" aria-pressed={form.limit === 'custom'}
            onClick={() => { set({ limit: 'custom', customLimit: form.customLimit || '20' }); focusSoon('care-limit'); }}>
            {t('careLimitCustom')}
          </button>
        </div>
        {form.limit === 'custom' && (<>
          <div className="care-inline-field">
            <input id="care-limit" type="number" inputMode="numeric" min={LIMIT_MIN} max={LIMIT_MAX} step={1} className="input care-num" value={form.customLimit}
              aria-label={t('careLimitCustomLabel')} aria-invalid={bad('limit') || undefined} aria-describedby="care-limit-msg"
              onChange={(e) => set({ customLimit: e.target.value })} />
            <span aria-hidden="true">{t('careMinutesPerDay')}</span>
          </div>
          <p id="care-limit-msg" className={bad('limit') ? 'msg msg--bad' : 'muted small'}>{t('careLimitRange', { min: LIMIT_MIN, max: LIMIT_MAX })}</p>
        </>)}
        <p className="muted small">{t('careLimitHelp', vars)}</p>
      </fieldset>

      <div className="care-field">
        <label className="switch-row" htmlFor="care-quiet">
          <span><span className="care-label">{t('careQuietLabel')}</span><span className="muted small">{t('careQuietHelp', vars)}</span></span>
          <input id="care-quiet" type="checkbox" role="switch" className="switch" checked={form.quietOn} onChange={(e) => set({ quietOn: e.target.checked })} />
        </label>
        {form.quietOn && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="care-quiet-start">{t('careQuietFrom')}</label>
              <input id="care-quiet-start" type="time" className="input" value={form.quietStart} aria-invalid={bad('quiet') || undefined} onChange={(e) => set({ quietStart: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="care-quiet-end">{t('careQuietTo')}</label>
              <input id="care-quiet-end" type="time" className="input" value={form.quietEnd} aria-invalid={bad('quiet') || undefined} onChange={(e) => set({ quietEnd: e.target.value })} />
            </div>
          </div>
        )}
        {bad('quiet') && <p className="msg msg--bad" role="alert">{t('careQuietBad')}</p>}
      </div>

      <div className="care-field">
        <div className="care-row-field">
          <label htmlFor="care-bedtime" className="care-label">{t('careBedtimeLabel')}</label>
          <input id="care-bedtime" type="time" className="input care-time" value={form.bedtime} required aria-invalid={bad('bedtime') || undefined}
            aria-describedby="care-bedtime-help" onChange={(e) => set({ bedtime: e.target.value })} />
        </div>
        <p id="care-bedtime-help" className="muted small">{t('careBedtimeHelp', vars)}</p>
        {bad('bedtime') && <p className="msg msg--bad" role="alert">{t('careBedtimeBad')}</p>}
      </div>

      <TopicsField topics={form.topics} vars={vars} onChange={(topics) => set({ topics })} />

      <fieldset className="care-field">
        <legend className="care-label">{t('careMoodLabel', vars)}</legend>
        <div className="seg">
          <button type="button" aria-pressed={mood === null} onClick={() => set({ moodPin: null })}>{t('careMoodAuto')}</button>
          <button type="button" aria-pressed={mood !== null} onClick={() => set({ moodPin: mood ?? MOOD_PIN_START })}>{t('careMoodPin')}</button>
        </div>
        {mood !== null && (
          <div className="care-mood">
            <BuddyAvatar design={design} emotion={moodFace(mood)} size="lg" />
            <div className="care-mood-slider">
              <input id="care-mood" type="range" className="range" min="0" max="100" step="1" value={mood}
                aria-label={t('careMoodSlider', vars)} aria-valuetext={moodText} onChange={(e) => set({ moodPin: clampMood(e.target.value) })} />
              <div className="care-mood-scale"><span>{t('careMoodLow')}</span><b>{moodText}</b><span>{t('careMoodHigh')}</span></div>
            </div>
          </div>
        )}
        <p className="muted small">{t(mood === null ? 'careMoodAutoHelp' : 'careMoodPinHelp', vars)}</p>
      </fieldset>

      <label className="switch-row" htmlFor="care-surprise">
        <span><span className="care-label">{t('careSurpriseLabel')}</span><span className="muted small">{t('careSurpriseHelp', vars)}</span></span>
        <input id="care-surprise" type="checkbox" role="switch" className="switch" checked={form.surprise} onChange={(e) => set({ surprise: e.target.checked })} />
      </label>

      {canSpeakFirst && (
        <label className="switch-row" htmlFor="care-speak">
          <span><span className="care-label">{t('careSpeakLabel', vars)}</span><span className="muted small">{t('careSpeakHelp', vars)}</span></span>
          <input id="care-speak" type="checkbox" role="switch" className="switch" checked={form.speakFirst} onChange={(e) => set({ speakFirst: e.target.checked })} />
        </label>
      )}

      <div className={`care-save ${changed ? 'is-dirty' : ''}`}>
        <span className="small" role="status">{changed ? t('careUnsaved') : t('careAllSaved')}</span>
        {changed && <button type="button" className="btn btn-soft btn-sm" disabled={saving} onClick={undo}>{t('careUndo')}</button>}
        <button type="submit" className="btn btn-pop btn-sm" disabled={!changed || saving}>{saving ? t('saving') : t('save')}</button>
      </div>
    </form>
  );
}

// Topics Buddy gently steers away from, as removable chips. Enter adds one
// without submitting the whole form.
function TopicsField({ topics, vars, onChange }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const full = topics.length >= TOPICS_MAX;
  const add = () => {
    const next = addEntry(topics, text, { max: TOPICS_MAX, maxLen: TOPIC_LEN });
    if (next !== topics) onChange(next);
    setText('');
  };
  // The chip's button goes away; the field (enabled again if the list was
  // full) takes the focus.
  const remove = (topic) => {
    onChange(removeEntry(topics, topic));
    focusSoon('care-topic');
  };
  return (
    <div className="care-field">
      <label htmlFor="care-topic" className="care-label">{t('careTopicsLabel')}</label>
      <p className="muted small">{t('careTopicsHelp', vars)}</p>
      {topics.length > 0 && (
        <ul className="care-pills" aria-label={t('careTopicsLabel')}>
          {topics.map((topic) => (
            <li key={topic} className="care-pill">
              <span>{topic}</span>
              <button type="button" aria-label={t('careRemoveNamed', { name: topic })} onClick={() => remove(topic)}>{Icon.x}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="care-add-row">
        <input id="care-topic" className="input" value={text} maxLength={TOPIC_LEN} autoComplete="off" disabled={full}
          placeholder={t('careTopicsPh')} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }} />
        <button type="button" className="btn btn-soft btn-sm" disabled={full || !text.trim()} onClick={add}>{Icon.plus}{t('careAdd')}</button>
      </div>
      {full && <p className="muted small">{t('careTopicsFull', { n: TOPICS_MAX })}</p>}
    </div>
  );
}

// Things a parent wants Buddy to bring up ("Grandma visits on Saturday"),
// waiting for the right moment, then marked used.
function NudgesCard({ child, buddyName }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const nudges = useLoad(() => api.nudges(child.id).then((out) => out?.data ?? []));
  const [content, setContent] = useState('');
  const [after, setAfter] = useState('');
  const [until, setUntil] = useState('');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const vars = { buddy: buddyName, child: child.name };
  const today = localDay();
  const { pending, expired, used } = splitNudges(nudges.data);

  const add = async (e) => {
    e.preventDefault();
    const out = nudgeBody({ content, after, until }, today);
    setErrors(out.errors);
    if (out.errors.length) {
      focusSoon(out.errors[0] === 'content' ? 'care-nudge-text' : 'care-nudge-until');
      return;
    }
    setBusy(true);
    try {
      const row = await api.addNudge(child.id, out.body);
      if (row) nudges.setData((list) => [row, ...withoutId(list, row.id)]);
      setContent('');
      setAfter('');
      setUntil('');
      toast(t('careNudgeAdded', vars));
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };

  // An expired nudge is still pending to the backend, so deleting it is the
  // same call as cancelling one that waits.
  const cancel = async (nudge, wasExpired = false) => {
    try {
      await api.cancelNudge(child.id, nudge.id);
      nudges.setData((list) => withoutId(list, nudge.id));
      toast(wasExpired ? t('careDeleted') : t('careNudgeCancelled'));
      focusSoon('care-nudges-title');
    } catch (err) {
      // Already used (or gone) since the list loaded: show what is true now.
      if (err.status === 404) {
        nudges.reload();
        toast(wasExpired ? t('careGone') : t('careNudgeGone', vars), 'bad');
      } else {
        toast(errText(err), 'bad');
      }
    }
  };

  const when = (n) => {
    const parts = [];
    if (n.use_after && Date.parse(n.use_after) > Date.now()) parts.push(t('careNudgeFrom', { date: dayLabel(isoDay(n.use_after), lang) }));
    if (n.expires_at) parts.push(t('careNudgeTill', { date: dayLabel(isoDay(n.expires_at), lang) }));
    return parts.length ? parts.join(' · ') : t('careNudgeNext', vars);
  };

  return (
    <Section id="care-nudges" title={t('careNudgesTitle', vars)} hint={t('careNudgesHint', vars)}>
      <form className="care-form" onSubmit={add} noValidate aria-label={t('careNudgeAddTitle')}>
        <div className="field">
          <label htmlFor="care-nudge-text">{t('careNudgeLabel', vars)}</label>
          <textarea id="care-nudge-text" className="input care-textarea" rows={2} maxLength={NUDGE_LEN} value={content}
            placeholder={t('careNudgePh')} aria-invalid={errors.includes('content') || undefined} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="care-nudge-after">{t('careNudgeAfter')}</label>
            <input id="care-nudge-after" type="date" className="input" min={today} value={after} onChange={(e) => setAfter(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="care-nudge-until">{t('careNudgeUntil')}</label>
            <input id="care-nudge-until" type="date" className="input" min={after || today} value={until} aria-invalid={errors.includes('until') || undefined}
              onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <p className="muted small">{t('careNudgeDatesHelp')}</p>
        {errors.includes('content') && <p className="msg msg--bad" role="alert">{t('careNudgeNeed')}</p>}
        {errors.includes('until') && <p className="msg msg--bad" role="alert">{t('careNudgeUntilBad')}</p>}
        <button type="submit" className="btn btn-pop btn-sm self-start" disabled={busy}>{busy ? t('saving') : t('careNudgeAdd')}</button>
      </form>
      <Loadable state={nudges}>
        {pending.length > 0 && (
          <div className="care-group">
            <span className="care-group-label">{t('careNudgesPending')}</span>
            <ul className="care-list">
              {pending.map((n) => (
                <li key={n.id} className="care-item">
                  <div className="care-item-text">
                    <b>{n.content}</b>
                    <span className="muted small">{when(n)}</span>
                  </div>
                  <div className="care-item-actions">
                    <DeleteButton label={t('careNudgeCancel', { text: n.content })} question={t('careNudgeCancelAsk')} yes={t('careNudgeCancelYes')} onConfirm={() => cancel(n)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {expired.length > 0 && (
          <div className="care-group">
            <span className="care-group-label">{t('careNudgesExpired', vars)}</span>
            <ul className="care-list">
              {expired.map((n) => (
                <li key={n.id} className="care-item care-item--expired">
                  <div className="care-item-text">
                    <b>{n.content}</b>
                    <span className="muted small">{t('careNudgeTill', { date: dayLabel(isoDay(n.expires_at), lang) })}</span>
                  </div>
                  <div className="care-item-actions">
                    <DeleteButton label={t('careDeleteNamed', { name: n.content })} question={t('careNudgeDeleteAsk')} onConfirm={() => cancel(n, true)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {used.length > 0 && (
          <div className="care-group">
            <span className="care-group-label">{t('careNudgesUsed', vars)}</span>
            <ul className="care-lines care-lines--done">
              {used.map((n) => (
                <li key={n.id}>
                  <span>{n.content}</span>
                  {n.used_at && <span className="muted small">{t('careNudgeUsedAt', { time: relativeTime(n.used_at, t) })}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!pending.length && !expired.length && !used.length && <p className="empty">{t('careNudgesEmpty', vars)}</p>}
      </Loadable>
    </Section>
  );
}

// Up to five focuses Buddy helps with, gently, now and then.
function GoalsCard({ child, buddyName }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const goals = useLoad(() => api.goals(child.id).then((out) => (out?.data ?? []).map((g) => g.focus)));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const vars = { buddy: buddyName, child: child.name };
  const focuses = goals.data ?? [];
  const full = focuses.length >= GOALS_MAX;
  const label = (focus) => (goalKey(focus) ? t(goalKey(focus)) : focus);

  const save = async (next) => {
    setBusy(true);
    try {
      const out = await api.setGoals(child.id, next);
      goals.setData((out?.data ?? []).map((g) => g.focus));
      toast(t('careGoalsSaved'));
      return true;
    } catch (err) {
      toast(errText(err), 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (raw) => {
    const next = addEntry(focuses, raw, { max: GOALS_MAX, maxLen: GOAL_LEN });
    if (next === focuses) return;
    if (await save(next)) setText('');
  };

  const remove = async (focus) => {
    await save(removeEntry(focuses, focus));
    focusSoon('care-goal');
  };

  const suggestions = GOAL_SUGGESTIONS.filter((g) => !focuses.includes(g));
  return (
    <Section id="care-goals" title={t('careGoalsTitle')} count={focuses.length} hint={t('careGoalsHint', vars)}>
      <Loadable state={goals}>
        {focuses.length ? (
          <ul className="care-pills" aria-label={t('careGoalsTitle')}>
            {focuses.map((f) => (
              <li key={f} className="care-pill care-pill--gold">
                <span>{label(f)}</span>
                <button type="button" aria-label={t('careRemoveNamed', { name: label(f) })} disabled={busy} onClick={() => remove(f)}>{Icon.x}</button>
              </li>
            ))}
          </ul>
        ) : <p className="empty">{t('careGoalsEmpty', vars)}</p>}
        {full ? <p className="muted small">{t('careGoalsFull', { n: GOALS_MAX })}</p> : (<>
          {suggestions.length > 0 && (
            <div className="chips care-suggest" role="group" aria-label={t('careGoalsSuggest')}>
              {suggestions.map((g) => (
                <button key={g} type="button" className="pill-btn" disabled={busy} onClick={() => add(g)}>{Icon.plus}{t(goalKey(g))}</button>
              ))}
            </div>
          )}
          <form className="care-add-row" onSubmit={(e) => { e.preventDefault(); add(text); }}>
            <label className="sr-only" htmlFor="care-goal">{t('careGoalLabel')}</label>
            <input id="care-goal" className="input" value={text} maxLength={GOAL_LEN} autoComplete="off" placeholder={t('careGoalPh')} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn btn-soft btn-sm" disabled={busy || !text.trim()}>{Icon.plus}{t('careAdd')}</button>
          </form>
        </>)}
      </Loadable>
    </Section>
  );
}

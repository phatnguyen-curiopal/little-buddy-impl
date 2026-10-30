import { useState } from 'react';
import { Chip, Icon, useErrorText, useToast } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { api } from '../../lib/api.js';
import { relativeTime } from '../../lib/format.js';
import {
  EVENT_KINDS, FACT_CATEGORIES, PERSON_KINDS, RELATIONSHIP_KINDS, SPEECH_LEN, dayLabel, factPatch, groupByKind, isoDay,
  known, knownTraits, personPatch, replaceById, sourceOf, speechBody, splitSpeech, traitSide, withoutId,
} from '../../lib/care.js';
import {
  CareIcon, DeleteButton, Loadable, MoreButton, Section, ShowAll, initialOf, useAutoFocus, useCapped, useFocusBack, useLoad,
  usePaged, useReturnFocus,
} from './common.jsx';

// The parts of What Buddy knows that a parent reads, fixes or deletes:
// people, facts, events, the little things between the child and Buddy,
// words being learned, how the child speaks, and temperament. Edits carry the
// item's etag; when the learner changed it meanwhile (412), the list reloads
// and the parent is told.

const focusSoon = (id) => requestAnimationFrame(() => document.getElementById(id)?.focus());

// Runs one change and reports it. { ok, out } on success; a stale or
// vanished item reloads the list first (reloaded), anything else leaves the
// form open for another try.
function useRun(list) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  return async (fn, okText) => {
    try {
      const out = await fn();
      if (okText) toast(okText);
      return { ok: true, out };
    } catch (err) {
      if (err.code === 'stale_write' || err.status === 404) {
        await list.reload();
        toast(t(err.code === 'stale_write' ? 'careStale' : 'careGone'), 'bad');
        return { ok: false, reloaded: true };
      }
      toast(errText(err), 'bad');
      return { ok: false, reloaded: false };
    }
  };
}

// ---------- People ----------

export function PeopleSection({ childId, child, buddyName }) {
  const { t } = useI18n();
  const people = usePaged((cursor) => api.people(childId, { cursor }));
  const run = useRun(people);
  const [editing, setEditing] = useState(null);
  useReturnFocus(editing, 'care-person-edit');
  const capped = useCapped(people.items, 6);
  const vars = { buddy: buddyName, child: child.name };

  const save = async (person, draft) => {
    const patch = personPatch(person, draft);
    if (!patch) {
      setEditing(null);
      return;
    }
    const r = await run(() => api.updatePerson(childId, person.id, patch, person.etag), t('saved'));
    if (r.ok && r.out) people.setItems((list) => replaceById(list, r.out));
    if (r.ok || r.reloaded) setEditing(null);
  };

  const remove = async (person) => {
    const r = await run(() => api.deletePerson(childId, person.id), t('careDeleted'));
    if (r.ok) {
      people.setItems((list) => withoutId(list, person.id));
      focusSoon('care-people-title');
    }
  };

  return (
    <Section id="care-people" title={t('carePeopleTitle')} count={people.next ? 0 : people.items.length} hint={t('carePeopleHint', vars)}>
      <Loadable state={people}>
        {people.items.length ? (
          <ul className="care-list">
            {capped.shown.map((p) => (editing === p.id ? (
              <li key={p.id} className="care-item care-item--form">
                <PersonForm person={p} onSave={(draft) => save(p, draft)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <PersonRow key={p.id} person={p} onEdit={() => setEditing(p.id)} onDelete={() => remove(p)} />
            )))}
          </ul>
        ) : <p className="empty">{t('carePeopleEmpty', vars)}</p>}
        <ShowAll capped={capped} />
        <MoreButton list={people} />
      </Loadable>
    </Section>
  );
}

function PersonRow({ person, onEdit, onDelete }) {
  const { t } = useI18n();
  const name = person.display_name;
  const note = typeof person.details?.note === 'string' ? person.details.note : '';
  const mentions = Number(person.mentions) || 1;
  return (
    <li className="care-item">
      <span className="care-avatar" aria-hidden="true">{initialOf(name)}</span>
      <div className="care-item-text">
        <b>{name}</b>
        <span className="muted small">{[t(`careKind_${known(PERSON_KINDS, person.kind)}`), person.relation].filter(Boolean).join(' · ')}</span>
        {note && <span className="small">{note}</span>}
        <span className="muted small">
          {t(mentions === 1 ? 'careMentionedOnce' : 'careMentioned', { n: mentions })}
          {person.last_mentioned_at ? ` · ${relativeTime(person.last_mentioned_at, t)}` : ''}
        </span>
      </div>
      <div className="care-item-actions">
        <button id={`care-person-edit-${person.id}`} type="button" className="round round--sm" aria-label={t('careEditNamed', { name })} onClick={onEdit}>{CareIcon.edit}</button>
        <DeleteButton label={t('careDeleteNamed', { name })} question={t('careDeletePersonAsk', { name })} onConfirm={onDelete} />
      </div>
    </li>
  );
}

function PersonForm({ person, onSave, onCancel }) {
  const { t } = useI18n();
  const first = useAutoFocus();
  const [name, setName] = useState(person.display_name ?? '');
  const [kind, setKind] = useState(known(PERSON_KINDS, person.kind));
  const [relation, setRelation] = useState(person.relation ?? '');
  const [busy, setBusy] = useState(false);
  const id = `care-person-${person.id}`;
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ display_name: name, kind, relation });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="care-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t('carePersonName')}</label>
        <input ref={first} id={`${id}-name`} className="input" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-kind`}>{t('carePersonKind')}</label>
          <select id={`${id}-kind`} className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {PERSON_KINDS.map((k) => <option key={k} value={k}>{t(`careKind_${k}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-rel`}>{t('carePersonRelation')}</label>
          <input id={`${id}-rel`} className="input" value={relation} maxLength={60} autoComplete="off" placeholder={t('carePersonRelationPh')} onChange={(e) => setRelation(e.target.value)} />
        </div>
      </div>
      <p className="muted small">{t('carePersonRenameNote')}</p>
      <div className="row-actions">
        <button type="submit" className="btn btn-pop btn-sm" disabled={busy || !name.trim()}>{busy ? t('saving') : t('save')}</button>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </form>
  );
}

// ---------- Facts ----------

export function FactsSection({ childId, child, buddyName }) {
  const { t } = useI18n();
  const [category, setCategory] = useState('');
  const facts = usePaged((cursor) => api.facts(childId, { category: category || undefined, cursor }), category);
  const run = useRun(facts);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  useReturnFocus(editing, 'care-fact-edit');
  useFocusBack(adding, 'care-fact-add');
  const capped = useCapped(facts.items, 8);
  const vars = { buddy: buddyName, child: child.name };

  const add = async (draft) => {
    const r = await run(() => api.addFact(childId, { category: draft.category, statement: draft.statement }), t('careFactAdded', vars));
    if (!r.ok) return;
    if (r.out && (!category || r.out.category === category)) facts.setItems((list) => [r.out, ...withoutId(list, r.out.id)]);
    setAdding(false);
  };

  const save = async (fact, draft) => {
    const patch = factPatch(fact, draft);
    if (!patch) {
      setEditing(null);
      return;
    }
    const r = await run(() => api.updateFact(childId, fact.id, patch, fact.etag), t('saved'));
    if (r.ok && r.out) {
      // Moved out of the category on screen: it leaves this filtered list.
      facts.setItems((list) => (category && r.out.category !== category ? withoutId(list, fact.id) : replaceById(list, r.out)));
    }
    if (r.ok || r.reloaded) setEditing(null);
  };

  const remove = async (fact) => {
    const r = await run(() => api.deleteFact(childId, fact.id), t('careDeleted'));
    if (r.ok) {
      facts.setItems((list) => withoutId(list, fact.id));
      focusSoon('care-facts-title');
    }
  };

  return (
    <Section
      id="care-facts"
      title={t('careFactsTitle')}
      hint={t('careFactsHint', vars)}
      action={!adding && <button id="care-fact-add" type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>{Icon.plus}{t('careAdd')}</button>}
    >
      {adding && (
        <FactForm
          title={t('careFactAddTitle', vars)}
          initial={{ category: category || 'likes', statement: '' }}
          submitLabel={t('careAdd')}
          onSave={add}
          onCancel={() => setAdding(false)}
        />
      )}
      <div className="care-scroll" role="group" aria-label={t('careFactFilter')}>
        <button type="button" className="pill-btn" aria-pressed={category === ''} onClick={() => setCategory('')}>{t('careAll')}</button>
        {FACT_CATEGORIES.map((c) => (
          <button key={c} type="button" className="pill-btn" aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`careFact_${c}`)}</button>
        ))}
      </div>
      <Loadable state={facts} rows={3}>
        {facts.items.length ? (
          <ul className="care-list">
            {capped.shown.map((f) => (editing === f.id ? (
              <li key={f.id} className="care-item care-item--form">
                <FactForm initial={f} submitLabel={t('save')} onSave={(draft) => save(f, draft)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <FactRow key={f.id} fact={f} showCategory={!category} onEdit={() => setEditing(f.id)} onDelete={() => remove(f)} />
            )))}
          </ul>
        ) : <p className="empty">{category ? t('careFactsNoneHere') : t('careFactsEmpty', vars)}</p>}
        <ShowAll capped={capped} />
        <MoreButton list={facts} />
      </Loadable>
    </Section>
  );
}

function FactRow({ fact, showCategory, onEdit, onDelete }) {
  const { t } = useI18n();
  return (
    <li className="care-item">
      <div className="care-item-text">
        <b>{fact.statement}</b>
        <span className="care-meta">
          {showCategory && <Chip tone="pop">{t(`careFact_${known(FACT_CATEGORIES, fact.category)}`)}</Chip>}
          <Chip tone={fact.source === 'parent' ? 'ok' : 'rest'}>{t(`careSource_${sourceOf(fact.source)}`)}</Chip>
          {fact.reality === 'pretend' && <Chip tone="pop">{t('careFactPretend')}</Chip>}
          {fact.sensitivity === 'sensitive' && <Chip tone="warn">{t('careFactSensitive')}</Chip>}
        </span>
      </div>
      <div className="care-item-actions">
        <button id={`care-fact-edit-${fact.id}`} type="button" className="round round--sm" aria-label={t('careEditFact', { text: fact.statement })} onClick={onEdit}>{CareIcon.edit}</button>
        <DeleteButton label={t('careDeleteFact', { text: fact.statement })} question={t('careDeleteFactAsk')} onConfirm={onDelete} />
      </div>
    </li>
  );
}

function FactForm({ title, initial, submitLabel, onSave, onCancel }) {
  const { t } = useI18n();
  const first = useAutoFocus();
  const [category, setCategory] = useState(known(FACT_CATEGORIES, initial.category));
  const [statement, setStatement] = useState(initial.statement ?? '');
  const [busy, setBusy] = useState(false);
  const id = `care-factform-${initial.id ?? 'new'}`;
  const submit = async (e) => {
    e.preventDefault();
    if (!statement.trim()) return;
    setBusy(true);
    try {
      await onSave({ category, statement: statement.replace(/\s+/g, ' ').trim() });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="care-form" onSubmit={submit} noValidate aria-label={title}>
      {title && <p className="care-form-title">{title}</p>}
      <div className="field">
        <label htmlFor={`${id}-text`}>{t('careFactText')}</label>
        <input ref={first} id={`${id}-text`} className="input" value={statement} maxLength={200} autoComplete="off" placeholder={t('careFactTextPh')} onChange={(e) => setStatement(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-cat`}>{t('careFactCategory')}</label>
        <select id={`${id}-cat`} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {FACT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`careFact_${c}`)}</option>)}
        </select>
      </div>
      <div className="row-actions">
        <button type="submit" className="btn btn-pop btn-sm" disabled={busy || !statement.trim()}>{busy ? t('saving') : submitLabel}</button>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </form>
  );
}

// ---------- Events ----------

export function EventsSection({ childId, child, buddyName }) {
  const { t, lang } = useI18n();
  const events = usePaged((cursor) => api.events(childId, { cursor }));
  const run = useRun(events);
  const [busy, setBusy] = useState(null);
  const vars = { buddy: buddyName, child: child.name };

  // Done or cancelled events leave the list: GET /events keeps only the
  // ones Buddy may still ask about.
  const setStatus = async (ev, status) => {
    setBusy(ev.id);
    const r = await run(() => api.updateEvent(childId, ev.id, { status }, ev.etag), t(status === 'done' ? 'careEventDoneToast' : 'careEventOffToast'));
    setBusy(null);
    if (r.ok) {
      events.setItems((list) => withoutId(list, ev.id));
      focusSoon('care-events-title');
    }
  };

  const remove = async (ev) => {
    const r = await run(() => api.deleteEvent(childId, ev.id), t('careDeleted'));
    if (r.ok) {
      events.setItems((list) => withoutId(list, ev.id));
      focusSoon('care-events-title');
    }
  };

  const groups = groupByKind(events.items, EVENT_KINDS);
  return (
    <Section id="care-events" title={t('careEventsTitle')} count={events.next ? 0 : events.items.length} hint={t('careEventsHint', vars)}>
      <Loadable state={events}>
        {groups.length ? groups.map(([kind, items]) => (
          <div key={kind} className="care-group">
            <span className="care-group-label">{t(`careEvent_${kind}`)}</span>
            <ul className="care-list">
              {items.map((ev) => (
                <li key={ev.id} className="care-item">
                  <div className="care-item-text">
                    <b>{ev.description}</b>
                    <span className="muted small">
                      {[ev.starts_on ? dayLabel(ev.starts_on, lang, { weekday: true }) : '', ev.status === 'followed_up' ? t('careEventAsked', vars) : '']
                        .filter(Boolean).join(' · ')}
                    </span>
                    <span className="care-item-buttons">
                      <button type="button" className="btn btn-soft care-mini" disabled={busy === ev.id} onClick={() => setStatus(ev, 'done')}>{Icon.check}{t('careEventDone')}</button>
                      <button type="button" className="btn btn-soft care-mini" disabled={busy === ev.id} onClick={() => setStatus(ev, 'cancelled')}>{t('careEventOff')}</button>
                    </span>
                  </div>
                  <div className="care-item-actions">
                    <DeleteButton label={t('careDeleteNamed', { name: ev.description })} question={t('careDeleteEventAsk')} onConfirm={() => remove(ev)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="empty">{t('careEventsEmpty', vars)}</p>}
        <MoreButton list={events} />
      </Loadable>
    </Section>
  );
}

// ---------- Between the child and Buddy ----------

export function RelationshipSection({ childId, child, buddyName }) {
  const { t, lang } = useI18n();
  const items = useLoad(() => api.relationship(childId).then((out) => out?.data ?? []));
  const vars = { buddy: buddyName, child: child.name };
  const groups = groupByKind(items.data, RELATIONSHIP_KINDS);
  return (
    <Section id="care-rel" title={t('careRelTitle', vars)} count={items.data?.length ?? 0} hint={t('careRelHint', vars)}>
      <Loadable state={items}>
        {groups.length ? groups.map(([kind, list]) => (
          <div key={kind} className="care-group">
            <span className="care-group-label">{t(`careRel_${kind}`)}</span>
            <ul className="care-lines">
              {list.map((it) => (
                <li key={it.id}>
                  <span>{it.content}</span>
                  {kind === 'promise' && it.due_at && <span className="muted small">{t('carePromiseDue', { date: dayLabel(isoDay(it.due_at), lang) })}</span>}
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="empty">{t('careRelEmpty', vars)}</p>}
      </Loadable>
    </Section>
  );
}

// ---------- Words being learned ----------

export function WordsSection({ childId, child, buddyName }) {
  const { t } = useI18n();
  const words = useLoad(() => api.words(childId).then((out) => out?.data ?? []));
  const capped = useCapped(words.data, 8);
  const vars = { buddy: buddyName, child: child.name };
  return (
    <Section id="care-words" title={t('careWordsTitle')} count={words.data?.length ?? 0} hint={t('careWordsHint', vars)}>
      <Loadable state={words}>
        {words.data?.length ? (
          <ul className="care-words">
            {capped.shown.map((w) => (
              <li key={`${w.language}:${w.word}`} className="care-word">
                <span className="care-word-top">
                  <b lang={w.language === 'en' ? 'en' : 'vi'}>{w.word}</b>
                  <span className="care-lang">{w.language === 'en' ? 'EN' : 'VI'}</span>
                </span>
                {w.meaning && <span className="small">{w.meaning}</span>}
                <span className="muted small">{t('careWordCounts', { taught: Number(w.taught) || 0, used: Number(w.used) || 0 })}</span>
              </li>
            ))}
          </ul>
        ) : <p className="empty">{t('careWordsEmpty', vars)}</p>}
        <ShowAll capped={capped} />
      </Loadable>
    </Section>
  );
}

// ---------- How the child speaks ----------

export function SpeechSection({ childId, child, buddyName }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const speech = useLoad(() => api.speech(childId).then((out) => out?.data ?? []));
  const [adding, setAdding] = useState(false);
  useFocusBack(adding, 'care-speech-add');
  const vars = { buddy: buddyName, child: child.name };
  const { misheard, terms } = splitSpeech(speech.data);

  const add = async (body) => {
    try {
      await api.addSpeech(childId, body);
      // An entry for the same words replaces the older one, so the list is
      // read again rather than patched.
      await speech.reload();
      setAdding(false);
      toast(t('careSpeechAdded', vars));
    } catch (err) {
      toast(err.code === 'bad_entry' ? t('careSpeechSame') : errText(err), 'bad');
    }
  };

  const remove = async (row) => {
    try {
      await api.deleteSpeech(childId, row.id);
      speech.setData((list) => withoutId(list, row.id));
      toast(t('careDeleted'));
      focusSoon('care-speech-title');
    } catch (err) {
      if (err.status === 404) speech.reload();
      toast(errText(err), 'bad');
    }
  };

  return (
    <Section
      id="care-speech"
      title={t('careSpeechTitle', vars)}
      hint={t('careSpeechHint', vars)}
      action={!adding && <button id="care-speech-add" type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>{Icon.plus}{t('careAdd')}</button>}
    >
      {adding && <SpeechForm vars={vars} onSave={add} onCancel={() => setAdding(false)} />}
      <Loadable state={speech}>
        {!misheard.length && !terms.length && <p className="empty">{t('careSpeechEmpty', vars)}</p>}
        {misheard.length > 0 && (
          <div className="care-group">
            <span className="care-group-label">{t('careSpeechMisheard', vars)}</span>
            <ul className="care-list">
              {misheard.map((r) => (
                <SpeechRow key={r.id} row={r} onDelete={() => remove(r)}>
                  <span className="care-heard">{r.heard}</span>
                  <span className="care-arrow" aria-hidden="true">{Icon.arrow}</span>
                  <span className="sr-only">{t('careSpeechMeans')}</span>
                  <b>{r.meant}</b>
                </SpeechRow>
              ))}
            </ul>
          </div>
        )}
        {terms.length > 0 && (
          <div className="care-group">
            <span className="care-group-label">{t('careSpeechTerms', vars)}</span>
            <ul className="care-list">
              {terms.map((r) => <SpeechRow key={r.id} row={r} onDelete={() => remove(r)}><b>{r.meant}</b></SpeechRow>)}
            </ul>
          </div>
        )}
      </Loadable>
    </Section>
  );
}

function SpeechRow({ row, onDelete, children }) {
  const { t } = useI18n();
  const name = row.kind === 'term' ? row.meant : t('careSpeechPair', { heard: row.heard, meant: row.meant });
  return (
    <li className="care-item">
      <div className="care-item-text">
        <span className="care-speech">{children}</span>
        <span className="care-meta">
          <Chip tone={row.source === 'parent' ? 'ok' : 'rest'}>{t(row.source === 'parent' ? 'careSpeechByParent' : 'careSpeechLearned')}</Chip>
          {row.in_use === false && <span className="chip">{t('careSpeechWaiting')}</span>}
        </span>
      </div>
      <div className="care-item-actions">
        <DeleteButton label={t('careDeleteNamed', { name })} question={t('careDeleteSpeechAsk')} onConfirm={onDelete} />
      </div>
    </li>
  );
}

function SpeechForm({ vars, onSave, onCancel }) {
  const { t } = useI18n();
  const first = useAutoFocus();
  const [kind, setKind] = useState('misheard');
  const [heard, setHeard] = useState('');
  const [meant, setMeant] = useState('');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const term = kind === 'term';
  const submit = async (e) => {
    e.preventDefault();
    const out = speechBody({ kind, heard, meant });
    setErrors(out.errors);
    if (out.errors.length) return;
    setBusy(true);
    try {
      await onSave(out.body);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="care-form" onSubmit={submit} noValidate aria-label={t('careSpeechAddTitle')}>
      <div className="seg" role="group" aria-label={t('careSpeechKind')}>
        <button ref={first} type="button" aria-pressed={!term} onClick={() => { setKind('misheard'); setErrors([]); }}>{t('careSpeechKindMisheard')}</button>
        <button type="button" aria-pressed={term} onClick={() => { setKind('term'); setErrors([]); }}>{t('careSpeechKindTerm')}</button>
      </div>
      <p className="muted small">{t(term ? 'careSpeechTermHelp' : 'careSpeechMisheardHelp', vars)}</p>
      <div className="field-row">
        <div className="field">
          <label htmlFor="care-speech-heard">{t(term ? 'careSpeechTermLabel' : 'careSpeechHeardLabel')}</label>
          <input id="care-speech-heard" className="input" value={heard} maxLength={SPEECH_LEN} autoComplete="off"
            placeholder={t(term ? 'careSpeechTermPh' : 'careSpeechHeardPh')} aria-invalid={errors.includes('heard') || undefined}
            onChange={(e) => setHeard(e.target.value)} />
        </div>
        {!term && (
          <div className="field">
            <label htmlFor="care-speech-meant">{t('careSpeechMeantLabel', vars)}</label>
            <input id="care-speech-meant" className="input" value={meant} maxLength={SPEECH_LEN} autoComplete="off"
              placeholder={t('careSpeechMeantPh')} aria-invalid={errors.includes('meant') || errors.includes('same') || undefined}
              onChange={(e) => setMeant(e.target.value)} />
          </div>
        )}
      </div>
      {errors.length > 0 && <p className="msg msg--bad" role="alert">{t(errors.includes('same') ? 'careSpeechSame' : 'careSpeechNeed')}</p>}
      <div className="row-actions">
        <button type="submit" className="btn btn-pop btn-sm" disabled={busy}>{busy ? t('saving') : t('careAdd')}</button>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </form>
  );
}

// ---------- Temperament ----------

export function TraitsSection({ childId, child, buddyName }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const traits = useLoad(() => api.traits(childId).then((out) => knownTraits(out?.data)));
  const vars = { buddy: buddyName, child: child.name };

  const remove = async (trait) => {
    try {
      await api.deleteTrait(childId, trait.name);
      traits.setData((list) => (list ?? []).filter((x) => x.name !== trait.name));
      toast(t('careTraitRemoved', vars));
      focusSoon('care-traits-title');
    } catch (err) {
      if (err.status === 404) traits.reload();
      toast(errText(err), 'bad');
    }
  };

  return (
    <Section id="care-traits" title={t('careTraitsTitle', vars)} hint={t('careTraitsHint', vars)}>
      <Loadable state={traits}>
        {traits.data?.length ? (
          <ul className="care-list">
            {traits.data.map((tr) => {
              const side = traitSide(tr);
              const label = t(`careTrait_${side}`);
              return (
                <li key={tr.name} className="care-item">
                  <div className="care-item-text">
                    <b>{label}</b>
                    <span className="small">{t(`careTraitDo_${side}`, vars)}</span>
                    <span className="care-meta">
                      <Chip tone={tr.in_use ? 'ok' : 'rest'} dot>{t(tr.in_use ? 'careTraitInUse' : 'careTraitForming')}</Chip>
                      <span className="muted small">{t('careTraitNights', { n: Number(tr.observations) || 1 })}</span>
                    </span>
                  </div>
                  <div className="care-item-actions">
                    <DeleteButton label={t('careTraitRemove', { name: label })} question={t('careTraitRemoveAsk', vars)} yes={t('careTraitRemoveYes')} onConfirm={() => remove(tr)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="empty">{t('careTraitsEmpty', vars)}</p>}
      </Loadable>
    </Section>
  );
}

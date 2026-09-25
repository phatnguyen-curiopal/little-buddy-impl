import { useState } from 'react';
import Face from '../components/Face.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { GROUPS, NAME_MAX, NAME_SUGGESTIONS, QUESTIONS, ROLES, TYPES, scoreQuiz, suggestName, typeOf } from '../lib/personality.js';

// Buddy's profile: a name, how it talks to the child (role) and one of 16
// personalities, found with a short quiz or picked directly. The pieces are
// screen-sized so the add-toy wizard can show one per step while the drawer
// puts them on one page for quick edits.

export function ProfileSummary({ profile, onEdit }) {
  const { t } = useI18n();
  const type = typeOf(profile.personality);
  if (onEdit) {
    const rows = [
      ['name', t('nameLabel'), profile.name],
      ['role', t('roleShort'), `${t(`role_${profile.role}`)} · ${t(`roleSays_${profile.role}`)}`],
      ['personality', t('personalityLabel'), `${t(`ptype_${type.code}`)} (${type.code}) · ${t(`source_${profile.personality_source}`)}`],
    ];
    return (
      <div className="review">
        <div className="hero-screen"><Face emotion={type.emotion} /></div>
        {rows.map(([step, label, value]) => (
          <div key={step} className="review-row">
            <span className="k">{label}</span>
            <span className="v">{value}</span>
            <button type="button" className="link" onClick={() => onEdit(step)}>{t('edit')}</button>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="p-summary">
      <span className="chip-screen"><Face emotion={type.emotion} /></span>
      <div>
        <div className="p-name">{profile.name}</div>
        <div className="feed-sub">{t(`role_${profile.role}`)} · {t(`ptype_${type.code}`)} <span className="mono">{type.code}</span> · {t(`source_${profile.personality_source}`)}</div>
        <div className="feed-sub">{t(`ptypeDesc_${type.code}`)}</div>
      </div>
    </div>
  );
}

export function NameField({ value, onChange, error = '', autoFocus = false }) {
  const { t } = useI18n();
  return (
    <div className="pe-section">
      <label className="pe-label" htmlFor="buddy-name">{t('nameLabel')}</label>
      <div className="name-row">
        <input id="buddy-name" className="input" value={value} maxLength={NAME_MAX} autoComplete="off"
          onChange={(e) => onChange(e.target.value)} data-autofocus={autoFocus || undefined} aria-describedby="buddy-name-msg" />
        <button type="button" className="btn ghost" onClick={() => onChange(suggestName(value))}>{t('suggestName')}</button>
      </div>
      <p id="buddy-name-msg" className={error ? 'msg bad' : 'feed-sub'}>{error || t('nameHelp')}</p>
      <div className="chips">
        {NAME_SUGGESTIONS.slice(0, 8).map((n) => (
          <button key={n} type="button" className="chip-btn" aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}

export function RolePicker({ value, onChange, autoFocus = false }) {
  const { t } = useI18n();
  return (
    <div className="role-grid" role="group" aria-label={t('roleLabel')}>
      {ROLES.map((r) => (
        <button key={r} type="button" className="choice role-card" aria-pressed={value === r} onClick={() => onChange(r)}
          data-autofocus={(autoFocus && value === r) || undefined}>
          <b>{t(`role_${r}`)}</b>
          <span className="feed-sub">{t(`roleSays_${r}`)}</span>
        </button>
      ))}
    </div>
  );
}

// One question per screen. onExit (back from the first question) and onPick
// (switch to the grid from the result) are optional: the drawer has tabs.
export function PersonalityQuiz({ onResult, onExit, onPick }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const total = QUESTIONS.length;

  if (step >= total) {
    const code = scoreQuiz(answers);
    const type = typeOf(code);
    return (
      <div className="quiz quiz-result">
        <p className="eyebrow">{t('quizResult')}</p>
        <div className="hero-screen"><Face emotion={type.emotion} /></div>
        <div><b className="p-name">{t(`ptype_${code}`)}</b> <span className="mono muted">{code}</span></div>
        <p className="muted">{t(`ptypeDesc_${code}`)}</p>
        <div className="row-actions">
          <button type="button" className="btn apricot" data-autofocus onClick={() => onResult(code)}>{t('useThis')}</button>
          <button type="button" className="btn ghost" onClick={() => { setAnswers([]); setStep(0); }}>{t('retake')}</button>
        </div>
        {onPick && <button type="button" className="link" onClick={onPick}>{t('tabPick')}</button>}
      </div>
    );
  }

  const q = QUESTIONS[step];
  const answer = (choice) => {
    setAnswers([...answers.slice(0, step), choice]);
    setStep(step + 1);
  };
  const back = step > 0 ? () => setStep(step - 1) : onExit;
  return (
    <div className="quiz">
      <div className="quiz-top">
        <span className="feed-sub">{t('quizProgress', { n: step + 1, total })}</span>
        {back && <button type="button" className="link" onClick={back}>{t('back')}</button>}
      </div>
      <div className="quiz-bar" aria-hidden="true"><span style={{ width: `${(step / total) * 100}%` }} /></div>
      <h4 key={q.n} className="quiz-q">{t(`pq${q.n}`)}</h4>
      <div className="quiz-opts">
        {['a', 'b'].map((choice, i) => (
          <button key={choice} type="button" className="quiz-opt" aria-pressed={answers[step] === choice} onClick={() => answer(choice)}
            data-autofocus={i === 0 || undefined}>
            {t(`pq${q.n}${choice}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PersonalityPicker({ value, onPick }) {
  const { t } = useI18n();
  return (
    <div className="picker">
      <p className="muted small">{t('pickHelp')}</p>
      {GROUPS.map((g) => (
        <div key={g} className="picker-group">
          <p className="eyebrow">{t(`group_${g}`)}</p>
          <div className="ptype-grid">
            {TYPES.filter((ty) => ty.group === g).map((ty) => (
              <button key={ty.code} type="button" className="ptype-card" aria-pressed={value === ty.code} onClick={() => onPick(ty.code)}
                data-autofocus={value === ty.code || undefined}>
                <span className="chip-screen chip-screen--sm"><Face emotion={ty.emotion} /></span>
                <span>
                  <b>{t(`ptype_${ty.code}`)}</b> <span className="mono muted">{ty.code}</span>
                  <span className="feed-sub">{t(`ptypeDesc_${ty.code}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// The drawer's one-page editor, for changing one thing on an existing Buddy.
// Controlled: value is { name, role, personality, personality_source }.
export function ProfileEditor({ value, onChange, nameError = '' }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('pick');
  const [quizKey, setQuizKey] = useState(0);
  const set = (patch) => onChange({ ...value, ...patch });
  const type = typeOf(value.personality);

  return (
    <div className="profile-editor">
      <NameField value={value.name} onChange={(name) => set({ name })} error={nameError} autoFocus />
      <section className="pe-section">
        <p className="pe-label">{t('roleLabel')}</p>
        <RolePicker value={value.role} onChange={(role) => set({ role })} />
      </section>
      <section className="pe-section">
        <p className="pe-label">{t('personalityLabel')}</p>
        <div className="p-current">
          <span className="chip-screen chip-screen--sm"><Face emotion={type.emotion} /></span>
          <span><b>{t(`ptype_${type.code}`)}</b> <span className="mono muted">{type.code}</span> <span className="feed-sub">· {t(`source_${value.personality_source}`)}</span></span>
        </div>
        <div className="seg" role="group" aria-label={t('personalityLabel')}>
          <button type="button" aria-pressed={tab === 'quiz'} onClick={() => { setTab('quiz'); setQuizKey((k) => k + 1); }}>{t('tabQuiz')}</button>
          <button type="button" aria-pressed={tab === 'pick'} onClick={() => setTab('pick')}>{t('tabPick')}</button>
        </div>
        {tab === 'quiz'
          ? <PersonalityQuiz key={quizKey} onResult={(code) => { set({ personality: code, personality_source: 'quiz' }); setTab('pick'); }} />
          : <PersonalityPicker value={value.personality} onPick={(code) => set({ personality: code, personality_source: 'picked' })} />}
      </section>
    </div>
  );
}

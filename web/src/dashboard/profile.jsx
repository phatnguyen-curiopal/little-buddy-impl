import { useState } from 'react';
import Face from '../components/Face.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { GROUPS, NAME_MAX, NAME_SUGGESTIONS, QUESTIONS, ROLES, TYPES, scoreQuiz, suggestName, typeOf } from '../lib/personality.js';

// Buddy's profile: a name, how it talks to the child (role) and one of 16
// personalities, found with a short quiz or picked directly. Used by the
// add-toy flow and the toy drawer, so both edit exactly the same thing.

export function ProfileSummary({ profile }) {
  const { t } = useI18n();
  const type = typeOf(profile.personality);
  return (
    <div className="p-summary">
      <span className="chip-screen"><Face emotion={type.emotion} /></span>
      <div>
        <div className="p-name">{profile.name}</div>
        <div className="feed-sub">{t(`role_${profile.role}`)} · {t(`ptype_${type.code}`)} <span className="mono">{type.code}</span></div>
        <div className="feed-sub">{t(`ptypeDesc_${type.code}`)}</div>
      </div>
    </div>
  );
}

function PersonalityQuiz({ onResult }) {
  const { t } = useI18n();
  const [step, setStep] = useState(-1); // -1 intro, 0..11 questions, 12 result
  const [answers, setAnswers] = useState([]);
  const total = QUESTIONS.length;

  if (step === -1) {
    return (
      <div className="quiz">
        <p className="muted">{t('quizIntro')}</p>
        <button type="button" className="btn apricot self-start" onClick={() => setStep(0)}>{t('quizStart')}</button>
      </div>
    );
  }

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
          <button type="button" className="btn apricot" onClick={() => onResult(code)}>{t('useThis')}</button>
          <button type="button" className="btn ghost" onClick={() => { setAnswers([]); setStep(0); }}>{t('retake')}</button>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[step];
  const answer = (choice) => {
    const next = [...answers.slice(0, step), choice];
    setAnswers(next);
    setStep(step + 1);
  };
  return (
    <div className="quiz">
      <div className="quiz-top">
        <span className="feed-sub">{t('quizProgress', { n: step + 1, total })}</span>
        {step > 0 && <button type="button" className="link" onClick={() => setStep(step - 1)}>{t('quizBack')}</button>}
      </div>
      <div className="quiz-bar" aria-hidden="true"><span style={{ width: `${(step / total) * 100}%` }} /></div>
      <h4 key={q.n} className="quiz-q">{t(`pq${q.n}`)}</h4>
      <div className="quiz-opts">
        {['a', 'b'].map((choice) => (
          <button key={choice} type="button" className="quiz-opt" aria-pressed={answers[step] === choice} onClick={() => answer(choice)}>
            {t(`pq${q.n}${choice}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonalityPicker({ value, onPick }) {
  const { t } = useI18n();
  return (
    <div className="picker">
      <p className="muted small">{t('pickHelp')}</p>
      {GROUPS.map((g) => (
        <div key={g} className="picker-group">
          <p className="eyebrow">{t(`group_${g}`)}</p>
          <div className="ptype-grid">
            {TYPES.filter((ty) => ty.group === g).map((ty) => (
              <button key={ty.code} type="button" className="ptype-card" aria-pressed={value === ty.code} onClick={() => onPick(ty.code)}>
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

// Controlled: value is { name, role, personality, personality_source }.
export function ProfileEditor({ value, onChange, nameError = '' }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(value.personality_source === 'quiz' ? 'quiz' : 'pick');
  const [quizKey, setQuizKey] = useState(0);
  const set = (patch) => onChange({ ...value, ...patch });
  const type = typeOf(value.personality);

  return (
    <div className="profile-editor">
      <section className="pe-section">
        <label className="pe-label" htmlFor="buddy-name">{t('nameLabel')}</label>
        <div className="name-row">
          <input id="buddy-name" className="input" value={value.name} maxLength={NAME_MAX} autoComplete="off" onChange={(e) => set({ name: e.target.value })} data-autofocus />
          <button type="button" className="btn ghost" onClick={() => set({ name: suggestName(value.name) })}>{t('suggestName')}</button>
        </div>
        {nameError ? <p className="msg bad">{nameError}</p> : <p className="feed-sub">{t('nameHelp')}</p>}
        <div className="chips">
          {NAME_SUGGESTIONS.slice(0, 8).map((n) => (
            <button key={n} type="button" className="chip-btn" aria-pressed={value.name === n} onClick={() => set({ name: n })}>{n}</button>
          ))}
        </div>
      </section>

      <section className="pe-section">
        <p className="pe-label">{t('roleLabel')}</p>
        <div className="role-grid">
          {ROLES.map((r) => (
            <button key={r} type="button" className="choice role-card" aria-pressed={value.role === r} onClick={() => set({ role: r })}>
              <b>{t(`role_${r}`)}</b>
              <span className="feed-sub">{t(`roleSays_${r}`)}</span>
            </button>
          ))}
        </div>
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

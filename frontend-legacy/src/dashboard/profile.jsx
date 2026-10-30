import { useEffect, useRef, useState } from 'react';
import BuddyScreen from '../components/buddy/BuddyScreen.jsx';
import ToyShell from '../components/ToyShell.jsx';
import { DESIGNS, normalizeDesign } from '../lib/designs.js';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { MOOD_START, chosenVoice, clampMood, sampleUrl, settingsOf, voicesFor } from '../lib/toySettings.js';
import { GROUPS, NAME_MAX, NAME_SUGGESTIONS, QUESTIONS, ROLES, TYPES, scoreQuiz, suggestName, typeOf } from '../lib/personality.js';

// Buddy's profile: a name, how the website draws it (design), how it talks
// to the child (role) and one of 16 personalities, found with a short quiz
// or picked directly. The pieces are
// screen-sized so the add-toy wizard can show one per step while the drawer
// puts them on one page for quick edits.

export function ProfileSummary({ profile, onEdit }) {
  const { t } = useI18n();
  const type = typeOf(profile.personality);
  const design = normalizeDesign(profile.design);
  if (onEdit) {
    const rows = [
      ['name', t('nameLabel'), profile.name],
      ['look', t('designLabel'), `${t(`design_${design}`)} · ${t(`designTag_${design}`)}`],
      ['role', t('roleShort'), `${t(`role_${profile.role}`)} · ${t(`roleSays_${profile.role}`)}`],
      ['personality', t('personalityLabel'), `${t(`ptype_${type.code}`)} (${type.code}) · ${t(`source_${profile.personality_source}`)}`],
    ];
    return (
      <div className="review">
        <div className="hero-screen"><BuddyScreen design={design} emotion={type.emotion} /></div>
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
      <span className="chip-screen"><BuddyScreen design={design} emotion={type.emotion} /></span>
      <div>
        <div className="p-name">{profile.name}</div>
        <div className="feed-sub">{t('designLabel')}: {t(`design_${design}`)}</div>
        <div className="feed-sub">{t(`role_${profile.role}`)} · {t(`ptype_${type.code}`)} <span className="mono">{type.code}</span> · {t(`source_${profile.personality_source}`)}</div>
        <div className="feed-sub">{t(`ptypeDesc_${type.code}`)}</div>
        <SettingsLine profile={profile} />
      </div>
    </div>
  );
}

function SettingsLine({ profile }) {
  const { t } = useI18n();
  const s = settingsOf(profile);
  const parts = [
    s.language === 'en' ? t('sumLang_en') : t('sumLang_vi'),
    s.learn ? t('sumLearnOn') : t('sumLearnOff'),
    s.mood_pin === null ? t('sumMoodAuto') : t('sumMoodPin', { n: s.mood_pin }),
  ];
  return <div className="feed-sub">{parts.join(' · ')}</div>;
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

// The three designs side by side, each a small live toy. The previews are
// drawn without their own button, since each card already is one.
export function DesignPicker({ value, onChange, autoFocus = false }) {
  const { t } = useI18n();
  const current = normalizeDesign(value);
  return (
    <div className="design-grid" role="group" aria-label={t('designLabel')}>
      {DESIGNS.map((d) => (
        <button key={d} type="button" className="choice design-card" aria-pressed={current === d} onClick={() => onChange(d)}
          data-autofocus={(autoFocus && current === d) || undefined}>
          <span className="design-stage"><ToyShell design={d} phase="idle" emotion={current === d ? 'happy' : 'neutral'} /></span>
          <b>{t(`design_${d}`)}</b>
          <span className="feed-sub">{t(`designTag_${d}`)}</span>
        </button>
      ))}
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
export function PersonalityQuiz({ onResult, onExit, onPick, design }) {
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
        <div className="hero-screen"><BuddyScreen design={design} emotion={type.emotion} /></div>
        <div><b className="p-name">{t(`ptype_${code}`)}</b> <span className="mono muted">{code}</span></div>
        <p className="muted">{t(`ptypeDesc_${code}`)}</p>
        <div className="row-actions">
          <button type="button" className="btn pop" data-autofocus onClick={() => onResult(code)}>{t('useThis')}</button>
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

export function PersonalityPicker({ value, onPick, design }) {
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
                <span className="chip-screen chip-screen--sm"><BuddyScreen design={design} emotion={ty.emotion} /></span>
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
// Controlled: value is { name, design, role, personality, personality_source } plus
// the conversation settings (language, voice_id, learn, mood_pin).
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
        <p className="pe-label">{t('designLabel')}</p>
        <DesignPicker value={value.design} onChange={(design) => set({ design })} />
      </section>
      <section className="pe-section">
        <p className="pe-label">{t('roleLabel')}</p>
        <RolePicker value={value.role} onChange={(role) => set({ role })} />
      </section>
      <section className="pe-section">
        <p className="pe-label">{t('personalityLabel')}</p>
        <div className="p-current">
          <span className="chip-screen chip-screen--sm"><BuddyScreen design={value.design} emotion={type.emotion} /></span>
          <span><b>{t(`ptype_${type.code}`)}</b> <span className="mono muted">{type.code}</span> <span className="feed-sub">· {t(`source_${value.personality_source}`)}</span></span>
        </div>
        <div className="seg" role="group" aria-label={t('personalityLabel')}>
          <button type="button" aria-pressed={tab === 'quiz'} onClick={() => { setTab('quiz'); setQuizKey((k) => k + 1); }}>{t('tabQuiz')}</button>
          <button type="button" aria-pressed={tab === 'pick'} onClick={() => setTab('pick')}>{t('tabPick')}</button>
        </div>
        {tab === 'quiz'
          ? <PersonalityQuiz key={quizKey} design={value.design} onResult={(code) => { set({ personality: code, personality_source: 'quiz' }); setTab('pick'); }} />
          : <PersonalityPicker design={value.design} value={value.personality} onPick={(code) => set({ personality: code, personality_source: 'picked' })} />}
      </section>
      <ToySettings value={value} onChange={set} />
    </div>
  );
}

// Voices change rarely; one request per page is enough.
let voicesOnce = null;
function useVoices() {
  const [state, setState] = useState({ voices: [], failed: false, loaded: false });
  useEffect(() => {
    let live = true;
    voicesOnce ??= api.voices().then((out) => out.voices ?? []).catch((err) => {
      voicesOnce = null;
      throw err;
    });
    voicesOnce.then((voices) => live && setState({ voices, failed: false, loaded: true }), () => live && setState({ voices: [], failed: true, loaded: true }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

// How Buddy talks, as opposed to who Buddy is: language, voice, memory and
// mood. Only the drawer shows these; the add-toy wizard keeps the defaults.
export function ToySettings({ value, onChange }) {
  const { t } = useI18n();
  const { voices, failed, loaded } = useVoices();
  const s = settingsOf(value);
  const pinned = s.mood_pin !== null;
  // Voices belong to one language, so a new language starts from its default
  // voice (the backend would drop the old one too).
  const setLanguage = (language) => language !== s.language && onChange({ language, voice_id: null });
  return (
    <div className="profile-editor settings">
      <p className="eyebrow">{t('settingsTitle')}</p>
      <section className="pe-section">
        <p className="pe-label" id="conv-lang">{t('convLang')}</p>
        <div className="seg" role="group" aria-labelledby="conv-lang">
          <button type="button" aria-pressed={s.language === 'vi'} onClick={() => setLanguage('vi')}>{t('langVi')}</button>
          <button type="button" aria-pressed={s.language === 'en'} onClick={() => setLanguage('en')}>{t('langEn')}</button>
        </div>
        <p className="feed-sub">{t('convLangHelp')}</p>
      </section>
      <section className="pe-section">
        <p className="pe-label" id="buddy-voice">{t('voiceLabel')}</p>
        {loaded && !failed && (
          <VoicePicker voices={voices} language={s.language} value={s.voice_id} onChange={(voice_id) => onChange({ voice_id })} />
        )}
        {failed && <p className="msg bad">{t('voicesFailed')}</p>}
      </section>
      <section className="pe-section">
        <label className="switch-row" htmlFor="buddy-learn">
          <span><span className="pe-label">{t('learnLabel')}</span><span className="feed-sub">{t('learnHelp')}</span></span>
          <input id="buddy-learn" type="checkbox" role="switch" className="switch" checked={s.learn} onChange={(e) => onChange({ learn: e.target.checked })} />
        </label>
      </section>
      <section className="pe-section">
        <p className="pe-label" id="buddy-mood">{t('moodLabel')}</p>
        <div className="seg" role="group" aria-labelledby="buddy-mood">
          <button type="button" aria-pressed={!pinned} onClick={() => onChange({ mood_pin: null })}>{t('moodAuto')}</button>
          <button type="button" aria-pressed={pinned} onClick={() => onChange({ mood_pin: pinned ? s.mood_pin : MOOD_START })}>{t('moodPinned')}</button>
        </div>
        {pinned && (
          <div className="mood-pin">
            <input type="range" className="range" min="0" max="100" step="1" value={s.mood_pin} aria-label={t('moodValue', { n: s.mood_pin })}
              onChange={(e) => onChange({ mood_pin: clampMood(e.target.value) })} />
            <div className="mood-scale"><span>{t('moodLow')}</span><b>{t('moodValue', { n: s.mood_pin })}</b><span>{t('moodHigh')}</span></div>
          </div>
        )}
        <p className="feed-sub">{pinned ? t('moodPinnedHelp') : t('moodAutoHelp')}</p>
      </section>
    </div>
  );
}

const PLAY_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>;
const STOP_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>;

// The voices of the toy's language, each with Buddy's greeting to listen to
// before choosing. Picking the default stores null, so the toy keeps
// following a later change of default; any other voice is stored by id. One
// audio element for the whole list, so two samples never talk over each other.
function VoicePicker({ voices, language, value, onChange }) {
  const { t } = useI18n();
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  const [missing, setMissing] = useState(() => new Set());
  const own = voicesFor(voices, language);
  const chosen = chosenVoice(voices, language, value);

  useEffect(() => () => audio.current?.pause(), []);
  // A language switch replaces every card, so a sample from the old list stops.
  useEffect(() => {
    audio.current?.pause();
    setPlaying(null);
  }, [language]);

  const toggle = (id) => {
    const el = (audio.current ??= new Audio());
    if (playing === id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.onended = () => setPlaying(null);
    el.onerror = () => {
      setPlaying(null);
      setMissing((m) => new Set(m).add(id));
    };
    el.src = sampleUrl(id);
    setPlaying(id);
    el.play().catch((err) => {
      // A pause before playback starts aborts harmlessly; anything else (a
      // blocked autoplay, a failed load) leaves nothing playing.
      if (err?.name !== 'AbortError') setPlaying((cur) => (cur === id ? null : cur));
    });
  };

  if (!own.length) return <p className="feed-sub">{t('voiceNoneForLang')}</p>;
  return (
    <div className="voice-list" role="group" aria-labelledby="buddy-voice">
      {own.map((v) => {
        const on = playing === v.id;
        return (
          <div key={v.id} className="voice-row">
            <button type="button" className="choice voice-pick" aria-pressed={chosen?.id === v.id} onClick={() => onChange(v.is_default ? null : v.id)}>
              <span className="voice-name">{v.label}</span>
              {v.is_default && <span className="voice-tag">{t('voiceDefaultTag')}</span>}
            </button>
            <button type="button" className="voice-play" aria-pressed={on} aria-label={on ? t('voiceStop', { name: v.label }) : t('voicePlay', { name: v.label })} onClick={() => toggle(v.id)}>
              {on ? STOP_ICON : PLAY_ICON}
            </button>
            {missing.has(v.id) && <p className="voice-missing feed-sub">{t('voiceSampleMissing')}</p>}
          </div>
        );
      })}
      <p className="feed-sub">{t('voiceHelp')}</p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { BuddyAvatar, BuddyFigure } from '../components/Buddy.jsx';
import { Icon } from '../components/ui.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LANGUAGE_MODES, ROLES } from '../lib/buddy.js';
import { GROUPS, QUESTIONS, TYPES, scoreQuiz, typeOf } from '../lib/personality.js';
import { characterWho, fitVoice, ownVoicesOf, pickVoice, pickedVoice, sampleUrl, voiceChosen, voiceGroup } from '../lib/wizard.js';

// A child's Buddy: a character (Bo, Pip or Luna), how it talks to the child (role), the language it speaks, one of
// 16 personalities found with a short quiz or picked directly, and a voice.
// The pieces are screen-sized so the add-a-Buddy wizard shows one per step
// while the drawer puts them on one page for quick edits.

const typeOrNull = (code) => (code ? typeOf(code) : null);

// What Buddy sounds like, in words: the voice a parent picked, or the
// character's own. Buddy speaks out loud in one language, and backend-v2
// keeps only a picked voice of that language, so a name is the whole story.
export function voiceName(t, voices, voiceId, name) {
  const picked = pickedVoice(voices, voiceId);
  return picked ? picked.name : t('wzOwnVoice', { name });
}

// The drawer's view of a Buddy, next to its avatar.
export function BuddySummary({ buddy, voices }) {
  const { t } = useI18n();
  const type = typeOrNull(buddy.personality);
  return (
    <div className="p-summary">
      <BuddyAvatar emotion={type?.emotion ?? 'happy'} size="lg" />
      <div>
        <div className="p-name">{buddy.character_name}</div>
        <div className="muted small">{t(`role_${buddy.role}`)} · {t(`roleSays_${buddy.role}`)}</div>
        <div className="muted small">
          {type ? <>{t(`ptype_${type.code}`)} <span className="mono">{type.code}</span></> : t('wzNoPersonality')}
        </div>
        {type && <div className="muted small">{t(`ptypeDesc_${type.code}`)}</div>}
        <div className="muted small">{t(`wzMode_${buddy.language_mode}`)} · {voiceName(t, voices, buddy.voice_id, buddy.character_name)}</div>
      </div>
    </div>
  );
}

// The wizard's last look before saving: every choice with a way back to it.
export function BuddyReview({ draft, character, voices, onEdit }) {
  const { t } = useI18n();
  const type = typeOrNull(draft.personality);
  const name = character?.name ?? 'Buddy';
  const rows = [
    ['personality', t('personalityLabel'), type ? `${t(`ptype_${type.code}`)} (${type.code})` : t('wzNoPersonality')],
    ['role', t('wzRoleLabel'), `${t(`role_${draft.role}`)} · ${t(`roleSays_${draft.role}`)}`],
    ['language', t('wzLanguageLabel'), t(`wzMode_${draft.language}`)],
    ['character', t('wzCharacterLabel'), name],
    ['voice', t('wzVoiceLabel'), voiceName(t, voices, draft.voice_id, name)],
  ];
  return (
    <div className="review card">
      <div className="review-figure"><BuddyFigure emotion={type?.emotion ?? 'happy'} /></div>
      {rows.map(([step, label, value]) => (
        <div key={step} className="review-row">
          <span className="review-text"><span className="muted small">{label}</span><b>{value}</b></span>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onEdit(step)} aria-label={t('wzEditWhat', { what: label })}>{t('edit')}</button>
        </div>
      ))}
    </div>
  );
}

const ROLE_ICONS = {
  friend: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5" />,
  sibling: <path d="M9 8a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 21c0-4 2.7-7 6-7s6 3 6 7M18 14a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM15.5 21c0-2.5 1.2-4 2.5-4s2.5 1.5 2.5 4" />,
  parent_figure: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  teacher: <path d="M3 8l9-4 9 4-9 4-9-4zM7 10v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5M21 8v6" />,
};

export function RolePicker({ value, onChange, autoFocus = false, labelledBy }) {
  const { t } = useI18n();
  return (
    <div className="role-grid" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : t('wzRoleLabel')}>
      {ROLES.map((r) => (
        <button key={r} type="button" className="choice role-card" aria-pressed={value === r} onClick={() => onChange(r)}
          data-autofocus={(autoFocus && value === r) || undefined}>
          <span className="role-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ROLE_ICONS[r]}</svg></span>
          <span className="role-text"><b>{t(`role_${r}`)}</b><span className="muted small">{t(`roleSays_${r}`)}</span></span>
        </button>
      ))}
    </div>
  );
}

// Badges rather than flags: a language is not a country.
const LANG_BADGE = {
  vi: <span>VI</span>,
  en: <span>EN</span>,
  bilingual: <span className="wz-lang-two"><span>VI</span><span>EN</span></span>,
};

export function LanguagePicker({ value, onChange, autoFocus = false, labelledBy }) {
  const { t } = useI18n();
  return (
    <div className="wz-langs" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : t('wzLanguageLabel')}>
      {LANGUAGE_MODES.map((m) => (
        <button key={m} type="button" className="choice role-card wz-lang" aria-pressed={value === m} onClick={() => onChange(m)}
          data-autofocus={(autoFocus && value === m) || undefined}>
          <span className="role-icon wz-lang-badge" aria-hidden="true">{LANG_BADGE[m]}</span>
          <span className="role-text"><b>{t(`wzMode_${m}`)}</b><span className="muted small">{t(`wzModeSays_${m}`)}</span></span>
        </button>
      ))}
    </div>
  );
}

// The characters a child can befriend, each drawn as itself. matchSlug is
// the questionnaire's best match, currentSlug the child's Buddy today (the
// drawer's character change).
export function CharacterPicker({ characters, value, onChange, matchSlug = null, currentSlug = null, autoFocus = false, labelledBy }) {
  const { t } = useI18n();
  return (
    <div className="wz-chars" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : t('wzCharacterLabel')}>
      {characters.map((c) => {
        const on = value === c.slug;
        const tags = c.slug === matchSlug || c.slug === currentSlug;
        return (
          <button key={c.slug} type="button" className="choice wz-char" aria-pressed={on} onClick={() => onChange(c.slug)}
            data-autofocus={(autoFocus && on) || undefined}>
            <span className="wz-char-stage"><BuddyFigure emotion={on ? 'excited' : 'happy'} /></span>
            <span className="wz-char-text">
              {tags && (
                <span className="wz-char-tags">
                  {c.slug === matchSlug && <span className="chip wz-best">{Icon.spark}{t('wzBestMatch')}</span>}
                  {c.slug === currentSlug && <span className="chip chip--rest">{t('wzCurrent')}</span>}
                </span>
              )}
              <b className="wz-char-name">{c.name}</b>
              <span className="muted small">{characterWho(c, t)}</span>
            </span>
            <span className="radio-dot" aria-hidden="true" />
          </button>
        );
      })}
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
      <div className="quiz quiz-result card">
        <p className="eyebrow">{t('quizResult')}</p>
        <div className="quiz-figure"><BuddyFigure emotion={type.emotion} /></div>
        <div><b className="p-name">{t(`ptype_${code}`)}</b> <span className="mono muted">{code}</span></div>
        <p className="muted">{t(`ptypeDesc_${code}`)}</p>
        <div className="row-actions">
          <button type="button" className="btn btn-pop" data-autofocus onClick={() => onResult(code)}>{t('useThis')}</button>
          <button type="button" className="btn btn-soft" onClick={() => { setAnswers([]); setStep(0); }}>{t('retake')}</button>
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
    <div className="quiz card">
      <div className="quiz-top">
        <span className="quiz-count">{t('quizProgress', { n: step + 1, total })}</span>
        {back && <button type="button" className="link" onClick={back}>{t('back')}</button>}
      </div>
      <div className="meter" aria-hidden="true"><span style={{ width: `${(step / total) * 100}%` }} /></div>
      <h4 key={q.n} className="quiz-q">{t(`pq${q.n}`)}</h4>
      <div className="quiz-opts">
        {['a', 'b'].map((choice, i) => (
          <button key={choice} type="button" className="quiz-opt" aria-pressed={answers[step] === choice} onClick={() => answer(choice)}
            data-autofocus={i === 0 || undefined}>
            <span className={`quiz-letter quiz-letter--${choice}`} aria-hidden="true">{choice.toUpperCase()}</span>
            <span>{t(`pq${q.n}${choice}`)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{t('quizIntro')}</p>
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
              <button key={ty.code} type="button" className="choice ptype-card" aria-pressed={value === ty.code} onClick={() => onPick(ty.code)}
                data-autofocus={value === ty.code || undefined}>
                <BuddyAvatar emotion={ty.emotion} size="sm" />
                <span className="ptype-text">
                  <span className="mono ptype-code">{ty.code}</span>
                  <b>{t(`ptype_${ty.code}`)}</b>
                  <span className="muted small">{t(`ptypeDesc_${ty.code}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const STOP_ICON = <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>;

// The voices of the one language Buddy speaks out loud (for a bilingual
// Buddy, the child's first language), each with Buddy's greeting to listen
// to before choosing. The character's own voice comes first and is what a
// Buddy with no pick speaks with, so choosing it stores null; any other
// voice is stored by id. One audio element for the whole list, so two
// samples never talk over each other. child is the Buddy's child.
export function VoicePicker({ voices, own, mode, child, value, onChange, name, labelledBy, autoFocus = false }) {
  const { t } = useI18n();
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  const [missing, setMissing] = useState(() => new Set());
  const group = voiceGroup(voices, own, mode, child);
  const ownKey = own ? `${own.vi ?? ''}|${own.en ?? ''}` : '';

  useEffect(() => () => audio.current?.pause(), []);
  // Another language or character replaces the list, so a sample from the
  // old one stops.
  useEffect(() => {
    audio.current?.pause();
    setPlaying(null);
  }, [group.language, ownKey]);

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

  let focusGiven = false;
  return (
    <div className="voice-list" role="group" aria-labelledby={labelledBy}>
      {mode === 'bilingual' && (
        <p className="muted small">{t(`wzVoiceBilingual_${group.language}`, { name, child: child?.name ?? t('wzKid') })}</p>
      )}
      <div className="wz-voice-group">
        {group.voices.map((v) => {
          const sample = v.sample;
          const label = v.label ?? t('wzOwnVoice', { name });
          const on = Boolean(sample) && playing === sample;
          const chosen = voiceChosen(v, value, voices);
          const focus = autoFocus && chosen && !focusGiven;
          if (focus) focusGiven = true;
          return (
            <div key={v.id ?? `own-${group.language}`} className={`voice-row ${sample ? '' : 'wz-voice-solo'}`}>
              {sample && (
                <button type="button" className="voice-play" aria-pressed={on} onClick={() => toggle(sample)}
                  aria-label={on ? t('wzVoiceStop', { name: label }) : t('wzVoicePlay', { name: label })}>
                  {on ? STOP_ICON : Icon.play}
                </button>
              )}
              <button type="button" className="choice voice-pick" aria-pressed={chosen} onClick={() => onChange(pickVoice(v))}
                data-autofocus={focus || undefined}>
                <span className="voice-name">{label}</span>
                {v.is_default && v.id && <span className="chip chip--pop">{t('wzOwnVoiceTag', { name })}</span>}
                {chosen && <span className="voice-check">{Icon.check}</span>}
              </button>
              {sample && missing.has(sample) && <p className="voice-missing muted small">{t('wzVoiceMissing')}</p>}
            </div>
          );
        })}
        {group.voices.length === 1 && <p className="muted small">{t('wzVoiceNone')}</p>}
      </div>
      <p className="muted small">{t('wzVoiceHelp', { name })}</p>
    </div>
  );
}

// The drawer's one-page editor for an existing Buddy. Controlled: value is
// { personality, role, language, voice_id }. character is the drawer's own
// section for changing the character, which saves on its own; child is the
// Buddy's child.
export function BuddyEditor({ value, onChange, buddy, child, voices, character }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('pick');
  const [quizKey, setQuizKey] = useState(0);
  const set = (patch) => onChange({ ...value, ...patch });
  const type = typeOrNull(value.personality);
  // Voices belong to one language, so a new language keeps a picked voice
  // only if Buddy still speaks with it (backend-v2 would drop it too).
  const setLanguage = (language) => language !== value.language && set({ language, voice_id: fitVoice(value.voice_id, voices, language, child) });

  return (
    <div className="profile-editor">
      {character}
      <section className="pe-section card">
        <p className="pe-label" id="ed-role">{t('wzRoleLabel')}</p>
        <RolePicker value={value.role} onChange={(role) => set({ role })} labelledBy="ed-role" autoFocus />
      </section>
      <section className="pe-section card">
        <p className="pe-label" id="ed-personality">{t('personalityLabel')}</p>
        <div className="p-current">
          <BuddyAvatar emotion={type?.emotion ?? 'neutral'} />
          <span>
            {type
              ? <><b>{t(`ptype_${type.code}`)}</b> <span className="mono">{type.code}</span><br /><span className="small">{t(`ptypeDesc_${type.code}`)}</span></>
              : <b>{t('wzNoPersonality')}</b>}
          </span>
        </div>
        <div className="seg" role="group" aria-labelledby="ed-personality">
          <button type="button" aria-pressed={tab === 'quiz'} onClick={() => { setTab('quiz'); setQuizKey((k) => k + 1); }}>{t('tabQuiz')}</button>
          <button type="button" aria-pressed={tab === 'pick'} onClick={() => setTab('pick')}>{t('tabPick')}</button>
        </div>
        {tab === 'quiz'
          ? <PersonalityQuiz key={quizKey} onResult={(code) => { set({ personality: code }); setTab('pick'); }} />
          : <PersonalityPicker value={value.personality} onPick={(code) => set({ personality: code })} />}
      </section>
      <section className="pe-section card">
        <p className="pe-label" id="ed-language">{t('wzLanguageLabel')}</p>
        <LanguagePicker value={value.language} onChange={setLanguage} labelledBy="ed-language" />
        <p className="muted small">{t('wzLangB')}</p>
      </section>
      <section className="pe-section card">
        <p className="pe-label" id="ed-voice">{t('wzVoiceLabel')}</p>
        <VoicePicker voices={voices} own={ownVoicesOf(buddy)} mode={value.language} child={child} value={value.voice_id}
          onChange={(voice_id) => set({ voice_id })} name={buddy.character_name} labelledBy="ed-voice" />
      </section>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import Face from './Face.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { reducedMotion, usePointerLook } from '../lib/motion.js';

// The hero toy. It behaves like the real one: one tap opens the microphone,
// the toy notices on its own when the child has stopped talking, then it
// thinks and answers with a face to match. A second tap while it listens
// means "I'm done" and ends the turn early.
const SCRIPTS = [
  { id: 1, emotion: 'happy' },
  { id: 2, emotion: 'laughing' },
  { id: 3, emotion: 'love' },
  { id: 4, emotion: 'surprised' },
  { id: 5, emotion: 'sad' },
];
const WORD_MS = 320;
const SILENCE_MS = 1100;
const HEARD_MS = 650;
const THINK_MS = 1300;
const REST_AFTER_MS = 9000;
const BARS = 11;

// While nobody is talking to it, Buddy's screen moves through friendly
// faces. Listening and thinking are left out because they mean something
// during the demo; sad, confused and sleepy are the wrong mood for a hello.
const IDLE_FACES = ['neutral', 'happy', 'curious', 'wink', 'excited', 'love', 'surprised', 'shy', 'laughing'];
const IDLE_FACE_MS = 2800;

const quiet = () => Array.from({ length: BARS }, () => 0.12);

export default function Toy() {
  const { t } = useI18n();
  const ref = useRef(null);
  const look = usePointerLook(ref);
  const [phase, setPhase] = useState('idle'); // idle | listening | heard | thinking | answer
  const [early, setEarly] = useState(false);
  const [script, setScript] = useState(0);
  const [words, setWords] = useState(0);
  const [bars, setBars] = useState(quiet);
  const [idleFace, setIdleFace] = useState(0);
  const timers = useRef([]);
  const next = useRef(0);

  // Cycle faces only while idle; every return to idle starts again from
  // the calm face so a finished demo does not end on a random expression.
  useEffect(() => {
    setIdleFace(0);
    if (phase !== 'idle' || reducedMotion()) return undefined;
    const id = setInterval(() => setIdleFace((i) => (i + 1) % IDLE_FACES.length), IDLE_FACE_MS);
    return () => clearInterval(id);
  }, [phase]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current.forEach(clearInterval);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const s = SCRIPTS[script];
  const question = t(`demo${s.id}q`).split(' ');
  const speaking = phase === 'listening' && words < question.length;

  // The live waveform: loud while words arrive, flat in the silence the
  // toy is waiting for.
  useEffect(() => {
    if (!speaking) {
      setBars(quiet());
      return undefined;
    }
    const id = setInterval(() => setBars(Array.from({ length: BARS }, (_, i) => 0.25 + Math.random() * (i % 3 === 1 ? 0.75 : 0.6))), 110);
    return () => clearInterval(id);
  }, [speaking]);

  const finish = useCallback((stoppedEarly) => {
    clear();
    setEarly(stoppedEarly);
    setPhase('heard');
    timers.current.push(setTimeout(() => {
      setPhase('thinking');
      timers.current.push(setTimeout(() => {
        setPhase('answer');
        timers.current.push(setTimeout(() => setPhase('idle'), REST_AFTER_MS));
      }, THINK_MS));
    }, HEARD_MS));
  }, []);

  const start = () => {
    clear();
    const idx = next.current % SCRIPTS.length;
    next.current += 1;
    const total = t(`demo${SCRIPTS[idx].id}q`).split(' ').length;
    setScript(idx);
    setWords(0);
    setEarly(false);
    setPhase('listening');
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setWords(n);
      if (n >= total) {
        clearInterval(id);
        // Nothing more is said: after a short silence the toy ends the turn
        // by itself, the way the real one uses voice activity detection.
        timers.current.push(setTimeout(() => finish(false), SILENCE_MS));
      }
    }, WORD_MS);
    timers.current.push(id);
  };

  const tap = () => {
    if (phase === 'listening') finish(true);
    else if (phase === 'idle' || phase === 'answer') start();
  };

  const emotion = phase === 'idle' ? IDLE_FACES[idleFace]
    : phase === 'listening' ? 'listening'
      : phase === 'heard' ? 'curious'
        : phase === 'thinking' ? 'thinking'
          : phase === 'answer' ? s.emotion : 'neutral';

  const status = {
    idle: t('toyIdle'),
    listening: speaking ? t('toyListening') : t('toySilence'),
    heard: early ? t('toyStopped') : t('toyHeard'),
    thinking: t('toyThinking'),
    answer: t('toyAnswer'),
  }[phase];

  const shownQuestion = phase === 'idle' ? '' : question.slice(0, phase === 'listening' ? words : (early ? words : question.length)).join(' ');

  return (
    <div className="stage" ref={ref}>
      <div className={`toy toy--${phase}`}>
        <div className="ear l" /><div className="ear r" />
        <div className="toy-body" />
        <div className="screen"><Face emotion={emotion} look={phase === 'idle' ? look : null} /></div>
        <div className="mic-ring" aria-hidden="true" />
        <button
          type="button"
          className="press"
          onClick={tap}
          aria-pressed={phase === 'listening'}
          aria-label={phase === 'listening' ? t('toyTapStop') : t('toyTap')}
        />
      </div>

      <div className="talk" aria-live="polite">
        <div className="status"><i className={`status-dot status-dot--${phase}`} />{status}</div>
        <div className="wave" aria-hidden="true">
          {bars.map((h, i) => <span key={i} style={{ transform: `scaleY(${h.toFixed(2)})` }} />)}
        </div>
        {shownQuestion && (
          <p className="bubble bubble--child">
            <span className="who">{t('asked')}</span>
            {shownQuestion}{phase === 'listening' && speaking && <span className="caret" />}
          </p>
        )}
        {phase === 'thinking' && <p className="bubble bubble--buddy"><span className="dots"><i /><i /><i /></span></p>}
        {phase === 'answer' && <p className="bubble bubble--buddy pop-in"><span className="who">Buddy</span>{t(`demo${s.id}a`)}</p>}
      </div>
    </div>
  );
}

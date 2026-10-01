// Stands in for the brain service with no vendor key. It gives the turn an
// emotion and a spoken line so the accept, answer, debit and logging path is
// exercised end to end, and it follows the brain's contract closely enough
// for the protocol tests: a typed turn is echoed back as heard, and a voice
// turn with no audio at all is no_speech (the brain's under-0.3 s rule at
// its simplest), which the socket abandons without charging.
const FRAME_BYTES = 640;
const FRAME_MS = 20;

const LINES = {
  vi: {
    heardSeconds: (n) => `Mình nghe bạn nói khoảng ${n} giây.`,
    listening: 'Mình đang nghe đây!',
    typed: 'Mình đọc được rồi.',
    tail: 'Câu hỏi hay quá. Mình cùng tìm hiểu nhé!',
    noSpeech: 'Ơ, mình chưa nghe rõ. Bạn nói lại nhé?',
  },
  en: {
    heardSeconds: (n) => `I listened for about ${n} second${n === 1 ? '' : 's'}.`,
    listening: 'I was listening!',
    typed: 'I read that.',
    tail: "That is a great question. Let's find out together!",
    noSpeech: "Oops, I didn't catch that. Can you say it again?",
  },
};

export async function answerTurn({ turn = {}, audio = null, text = null } = {}) {
  const lines = LINES[turn.language] ?? LINES.vi;
  if (text !== null) {
    return { emotion: 'happy', say: `${lines.typed} ${lines.tail}`, heard: text, audio: null, rate: null, noSpeech: false };
  }
  const bytes = audio?.length ?? 0;
  if (bytes === 0) {
    return { emotion: 'confused', say: lines.noSpeech, heard: '', audio: null, rate: null, noSpeech: true };
  }
  const seconds = Math.round((Math.floor(bytes / FRAME_BYTES) * FRAME_MS) / 1000);
  const heard = seconds > 0 ? lines.heardSeconds(seconds) : lines.listening;
  return { emotion: 'happy', say: `${heard} ${lines.tail}`, heard: '', audio: null, rate: null, noSpeech: false };
}

// The mock keeps no memory, so there is nothing to forget.
export async function wipeDeviceSubject() {}

export async function probe() {
  return { ok: true, code: 'mock_ready' };
}

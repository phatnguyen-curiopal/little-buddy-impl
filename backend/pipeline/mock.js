// Stands in for STT, the model and TTS until real adapters exist. It gives
// the turn an emotion and a spoken line so the accept, answer, debit and
// logging path is exercised end to end with no vendor key.
const FRAME_MS = 20;

export async function answerTurn({ audioFrames = 0 } = {}) {
  const seconds = Math.round((audioFrames * FRAME_MS) / 1000);
  const heard = seconds > 0 ? `I listened for about ${seconds} second${seconds === 1 ? '' : 's'}.` : 'I was listening!';
  return { emotion: 'happy', say: `${heard} That is a great question. Let's find out together!` };
}

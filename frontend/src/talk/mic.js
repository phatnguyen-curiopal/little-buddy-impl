import { FRAME_BYTES, levelFromRms, workletSource } from './dsp.js';

// The web toy's microphone. The Talk screen is hands-free, so one capture
// lasts the whole visit: it opens once the toy has signed in and is released
// when the page is left, muted, or the toy stops answering. Which frames
// become a turn is decided by the caller (useWebToy.js) with vad.js.
//
// The audio thread does the heavy part (low-pass, resample to 16 kHz Int16,
// 640-byte frames; see dsp.js). This thread only measures loudness for the
// ring and hands frames to the caller.

export const FRAME_MS = 20;
// backend-v2's default MAX_TURN_SECONDS. The server does not announce its
// value: one configured lower ends the turn itself (its thinking face
// arrives while the child still talks), and useWebToy follows it.
export const TURN_MAX_SEC = 30;
// The server counts bytes, not time, so the toy counts the frames it sent
// (the pre-roll included) and says turn_end (reason cap) half a second
// before the server would cut the turn on its own.
export const TURN_CAP_FRAMES = Math.floor((TURN_MAX_SEC * 1000 - 500) / FRAME_MS);

// getUserMedia exists only in a secure context (https or localhost).
export function micSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window.AudioWorkletNode === 'function';
}

let moduleUrl = null;
function workletUrl() {
  // One Blob URL per page: the source never changes.
  if (!moduleUrl) moduleUrl = URL.createObjectURL(new Blob([workletSource()], { type: 'text/javascript' }));
  return moduleUrl;
}

// onFrame(ArrayBuffer of FRAME_BYTES, rms) for every 20 ms of audio,
// onLevel(0..1). Resolves once audio is flowing; rejects with err.code
// 'mic_denied' or 'mic_unavailable'.
export async function startCapture({ onFrame, onLevel }) {
  if (!micSupported()) throw Object.assign(new Error('microphone needs a secure context'), { code: 'mic_unavailable' });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    throw Object.assign(new Error(err?.message || 'getUserMedia failed'), { code: denied ? 'mic_denied' : 'mic_unavailable' });
  }

  const ctx = new AudioContext();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stream.getTracks().forEach((track) => track.stop());
    ctx.close().catch(() => {});
  };

  try {
    await ctx.audioWorklet.addModule(workletUrl());
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'lb-mic', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    // Silent path to the speakers: some engines only render nodes that
    // lead to the destination.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    node.port.onmessage = (e) => {
      if (closed) return;
      const { frame, rms } = e.data;
      if (frame.byteLength !== FRAME_BYTES) return;
      onFrame(frame, rms);
      onLevel?.(levelFromRms(rms));
    };
  } catch (err) {
    close();
    throw Object.assign(new Error(err?.message || 'audio setup failed'), { code: 'mic_unavailable' });
  }

  return { stop: close };
}

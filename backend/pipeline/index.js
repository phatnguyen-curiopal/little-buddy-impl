import config from '../config.js';
import * as mock from './mock.js';
import * as brain from './brain.js';

// Every provider exports the same three functions:
//   answerTurn({ turn, audio, text, signal }) -> { emotion, say, heard, audio, rate, noSpeech }
//   wipeDeviceSubject({ deviceId, familyId }) -> forgets what a toy learned for a family
//   probe() -> { ok, code }: reachable and authorized, checked once at boot
// config.js refuses any PROVIDER_MODE that is not a key here.
const providers = { mock, brain };

export const pipeline = providers[config.providerMode];

import config from '../config.js';
import * as mock from './mock.js';

// config.js already refuses any PROVIDER_MODE but mock; this is where a
// real provider set will be selected later.
const providers = { mock };

export const pipeline = providers[config.providerMode];

import en from './en.js';
import vi from './vi.js';

export const LANGUAGES = ['vi', 'en'];
const TEXTS = { vi, en };

export function textFor(lang) {
  return TEXTS[lang] || vi;
}

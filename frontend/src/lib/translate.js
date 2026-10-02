import vi from '../i18n/vi.js';
import en from '../i18n/en.js';

// Pure lookup, kept out of i18n.jsx so node --test can use it without JSX.
export const DICTS = { vi, en };

export function translate(lang, key, vars = {}) {
  const s = DICTS[lang]?.[key] ?? DICTS.vi[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

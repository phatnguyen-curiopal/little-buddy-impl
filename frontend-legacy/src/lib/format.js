const MIN = 60_000;

export const localeOf = (lang) => (lang === 'vi' ? 'vi-VN' : 'en-US');

export function vnd(amount, lang) {
  return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

export function number(n, lang) {
  return new Intl.NumberFormat(localeOf(lang)).format(n);
}

// t is the translator, so the words come from the dictionaries.
export function relativeTime(ts, t, now = Date.now()) {
  if (!ts) return t('never');
  const m = Math.floor((now - new Date(ts).getTime()) / MIN);
  if (m < 1) return t('now');
  if (m < 60) return t('minsAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  return d === 1 ? t('yesterday') : t('daysAgo', { n: d });
}

export function age(birthYear, now = new Date()) {
  return now.getFullYear() - birthYear;
}

export const pricePerAnswer = (pack) => Math.round(pack.price_amount / pack.credits);

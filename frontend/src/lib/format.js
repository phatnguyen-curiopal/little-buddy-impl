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

// The words for a 429, as { key, vars }, from its Retry-After in seconds.
// backend-v2's budgets refill at very different speeds (a second for most
// calls, minutes for a sign-up or a pairing, up to a day for browser
// Buddies), so the wait is worded by its size: under 90 seconds in seconds,
// under 90 minutes in minutes, otherwise in hours, rounded up so a parent
// never comes back too early. With no usable number, or a single second
// (which would read "1 seconds"), the words carry no number.
export function waitWords(retryAfter) {
  const s = Math.ceil(Number(retryAfter));
  if (!Number.isFinite(s) || s <= 1) return { key: 'err_rate_limited', vars: {} };
  if (s < 90) return { key: 'err_rate_limited_s', vars: { s } };
  if (s < 90 * 60) return { key: 'err_rate_limited_m', vars: { m: Math.ceil(s / 60) } };
  return { key: 'err_rate_limited_h', vars: { h: Math.ceil(s / 3600) } };
}

// Whole years from a birth date as backend-v2 sends it (YYYY-MM-DD), or null
// when there is none or it is not a real day (2020-02-30), so a card can
// leave the age out instead of guessing.
export function age(birthDate, now = new Date()) {
  const m = typeof birthDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10) !== birthDate) return null;
  const month = now.getMonth() + 1;
  const years = now.getFullYear() - y - (month < mo || (month === mo && now.getDate() < d) ? 1 : 0);
  return years >= 0 ? years : null;
}

// A local calendar day as YYYY-MM-DD, the shape a date input and the
// backend use (toISOString would give the UTC day).
export function isoDay(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// The browser's IANA time zone, sent with a new child so Buddy's day (quiet
// hours, bedtime, its mood) follows the family's clock. Undefined lets the
// backend use its own default.
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export const pricePerAnswer = (pack) => Math.round(pack.price_amount / pack.credits);

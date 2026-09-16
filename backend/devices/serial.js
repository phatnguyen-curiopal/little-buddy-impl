// A serial is the human-readable label printed on the toy and read out to
// support: <batch label>-<4-digit index>. The opaque uuid device id is what
// goes on the wire; the two are never confused.
const LABEL_RE = /^[A-Z0-9]{3,16}$/;
const SERIAL_RE = /^([A-Z0-9]{3,16})-(\d{4})$/;
export const MAX_PER_BATCH = 9999;

export function isBatchLabel(label) {
  return typeof label === 'string' && LABEL_RE.test(label);
}

export function serialFor(batchLabel, index) {
  if (!isBatchLabel(batchLabel)) throw new Error(`serial: invalid batch label "${batchLabel}"`);
  if (!Number.isInteger(index) || index < 1 || index > MAX_PER_BATCH) {
    throw new Error(`serial: index must be 1..${MAX_PER_BATCH}`);
  }
  return `${batchLabel}-${String(index).padStart(4, '0')}`;
}

export function parseSerial(serial) {
  const m = typeof serial === 'string' ? SERIAL_RE.exec(serial) : null;
  return m ? { batchLabel: m[1], index: Number(m[2]) } : null;
}

// The three ways the website can draw Buddy. Each toy keeps its own in its
// profile (backend/personalization/roles.js has the same codes); anything
// that shows Buddy without a particular toy uses the default.
export const DESIGNS = ['orbit', 'volt', 'glim'];
export const DEFAULT_DESIGN = 'orbit';

const KNOWN = new Set(DESIGNS);

export function normalizeDesign(value) {
  return KNOWN.has(value) ? value : DEFAULT_DESIGN;
}

export function designOf(device) {
  return normalizeDesign(device?.profile?.design);
}

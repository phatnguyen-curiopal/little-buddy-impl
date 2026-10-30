// The ways the website can draw Buddy. Each toy keeps its own in its profile
// (backend/personalization/roles.js has the same codes); anything that shows
// Buddy without a particular toy uses the default. Miu, the talking kitten,
// is drawn by components/Miu.jsx; the three robots by components/ToyShell.jsx.
export const DESIGNS = ['miu', 'orbit', 'volt', 'glim'];
export const DEFAULT_DESIGN = 'miu';
export const ROBOTS = new Set(['orbit', 'volt', 'glim']);

const KNOWN = new Set(DESIGNS);

export function normalizeDesign(value) {
  return KNOWN.has(value) ? value : DEFAULT_DESIGN;
}

export function designOf(device) {
  return normalizeDesign(device?.profile?.design);
}

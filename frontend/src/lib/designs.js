// The ways the website can draw Buddy. Miu, the talking kitten
// (components/Miu.jsx), stands for Little Buddy wherever no particular Buddy
// is meant: logos, the marketing page, sign-in, empty states. The three
// robots are drawn by components/ToyShell.jsx. Which one a toy shows is no
// longer stored on the toy: it follows its child's Buddy, and lib/buddy.js
// maps each character to its design (toyView, designFor).
export const DESIGNS = ['miu', 'orbit', 'volt', 'glim'];
export const DEFAULT_DESIGN = 'miu';
export const ROBOTS = new Set(['orbit', 'volt', 'glim']);

const KNOWN = new Set(DESIGNS);

export function normalizeDesign(value) {
  return KNOWN.has(value) ? value : DEFAULT_DESIGN;
}

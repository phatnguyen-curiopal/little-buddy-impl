// How the site shows backend-v2's Buddy. Pure, so node --test covers it.
//
// A child has one Buddy: a character (Bo, Pip or Luna) with a role, a
// language, one of the 16 personality types and optionally a voice a parent
// picked. Toys (a physical one, or a Buddy that lives in the browser) belong
// to a child, so a toy's face and name come from its child's Buddy.
import { DEFAULT_DESIGN, normalizeDesign } from './designs.js';

// Each character is drawn in the design that fits it: Bo floated down from
// the sky (Orbit, the space explorer), Pip builds things (Volt, the mecha
// cub), Luna glows like the moon (Glim, the light in a glass jar).
export const CHARACTER_DESIGNS = Object.freeze({ bo: 'orbit', pip: 'volt', luna: 'glim' });

export function designFor(slug) {
  return normalizeDesign(CHARACTER_DESIGNS[slug] ?? DEFAULT_DESIGN);
}

// How Buddy talks to the child; the Vietnamese pronouns follow the role.
export const ROLES = ['friend', 'sibling', 'parent_figure', 'teacher'];
export const LANGUAGE_MODES = ['vi', 'en', 'bilingual'];

// What a toy card, the drawer and the Talk screen show for one toy.
export function toyView(device, children, buddies) {
  const child = children.find((c) => c.id === device.child_id) ?? null;
  const buddy = child ? (buddies[child.id] ?? null) : null;
  return {
    device,
    child,
    buddy,
    name: buddy?.character_name ?? 'Buddy',
    design: designFor(buddy?.character_slug),
    web: device.hardware_rev === 'web',
  };
}

// What a parent can do with a toy right now, from its toyView. Only a Buddy
// that lives in the browser can be talked to on the site (a physical toy's
// secret never leaves it), only while it is awake and only once its child
// has a Buddy; a toy whose child has none offers to finish the setup. A
// parent wakes only a toy a parent paused, never one staff disabled.
export function toyActions(view, webToy) {
  const { device } = view;
  const awake = device.status === 'active';
  return {
    talk: webToy === true && view.web && awake && Boolean(view.buddy),
    setup: Boolean(view.child) && !view.buddy && device.status !== 'revoked',
    pause: awake,
    wake: device.status === 'disabled' && device.disabled_by === 'parent',
  };
}

// The languages Buddy speaks in a mode: bilingual answers in the language
// the child just used.
export function spokenLanguages(mode) {
  return mode === 'bilingual' ? ['vi', 'en'] : [mode === 'en' ? 'en' : 'vi'];
}

// The one language Buddy speaks out loud, so the language its voice must
// speak: its own, or for a bilingual Buddy the child's first language
// (backend-v2's speechLanguage). A bilingual Buddy still answers in the
// child's language, in that one voice, and backend-v2 refuses a picked voice
// of any other language.
export function speechLanguage(mode, child) {
  if (mode === 'vi' || mode === 'en') return mode;
  return child?.languages?.[0] === 'en' ? 'en' : 'vi';
}

// Voices in the shape the voice picker uses: label, and is_default for the
// character's own voice in that language (what Buddy speaks with when no
// voice is picked, so picking it stores null).
export function voicesForBuddy(voices, buddy) {
  const own = buddy?.character_voices ?? {};
  return (voices ?? []).map((v) => ({ ...v, label: v.name, is_default: own[v.language] === v.id }));
}

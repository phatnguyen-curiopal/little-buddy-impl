// core strings for the backend-v2 port (en). A key here overrides the same key
// in ../en.js; tests/i18n.test.js checks both languages together.
export default {
  // navigation
  nav_care: 'Care', careBadge: 'Unread alerts: {n}',

  // home
  alertBanner: 'Buddy noticed something about {name} that you should know ({n} new).', alertBannerGo: 'Take a look',
  buySoon: 'Buying credits will be available here soon.',

  // toys
  finishSetup: 'Finish setting up Buddy',
  needsBuddy: "Your child doesn't have a Buddy yet. Pick the one that suits them to start talking.",
  webTag: 'On the web', webBuddyName: 'Web Buddy', toySerial: 'Toy {serial}', noToyYet: 'No toy yet',
  onlineNow: 'Online now', neverSeen: 'Not connected yet', addTileWeb: 'A web Buddy, or a toy with a card',

  // activity: what Buddy did in a turn, never the words
  yourChild: 'your child', costOne: '1 credit used', turnTalked: '{buddy} talked with {name}',
  tt_answer: "{buddy} answered {name}'s question", tt_react: "{buddy} reacted to {name}'s news",
  tt_comfort: '{buddy} comforted {name}', tt_encourage: '{buddy} cheered {name} on',
  tt_follow_up: '{buddy} followed up with {name}', tt_share: '{buddy} shared its day with {name}',
  tt_play: '{buddy} played a game with {name}', tt_story: '{buddy} told {name} a story',
  tt_teach: '{buddy} shared a fun fact with {name}', tt_wind_down: '{buddy} helped {name} wind down',
  tt_greet: '{buddy} said hello to {name} first', tt_clarify: '{buddy} asked {name} to say it again',
  filterChild: 'Filter by child', activityCare: 'Weekly digests and safety alerts are in Care.',

  // credits
  packsTitle: 'Credit packs',
  buySoonLong: 'Buying credits will be available here soon. Until then, your child keeps talking with the credits you have.',
  l_debitFor: 'Buddy answers for {name} ({n})', l_other: 'Credit adjustment',

  // family
  birthDate: 'Date of birth', birthHelp: "So Buddy can talk at your child's level.",
  badBirth: "That date of birth doesn't look right. Please check it.",
  birthTooOld: 'Buddy is made for children up to {n}. Please check the date of birth.',
  childLangs: 'Your child speaks', childLangsHelp: 'The languages your child uses at home, so Buddy understands them better.', langBoth: 'Both',
  kidLang_vi: 'Speaks Vietnamese', kidLang_en: 'Speaks English', kidLang_both: 'Speaks Vietnamese and English',
  editFamilyName: 'Edit family name',
};

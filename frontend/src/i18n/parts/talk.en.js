// talk strings for the backend-v2 port (en). A key here overrides the same key
// in ../en.js; tests/i18n.test.js checks both languages together.
// Every key the Talk screen uses is listed here, so it keeps working
// whatever happens to the base dictionary.
export default {
  // the room
  talkPick: 'Choose a Buddy',
  talkToyOption: "{child}'s {name}",
  talkCredits: 'Credits left: {n}',
  talkNewConv: 'Start a new conversation',
  talkNewConvStarted: 'A new conversation started',
  talkSettings: 'Settings for {name}',
  talkPet: 'Pet {name}',
  talkReconnect: 'Reconnect',
  talkTakeOver: 'Talk here instead',
  talkGoToys: 'Go to Toys',

  // what Buddy is doing
  talkConnecting: 'Connecting to {name}…',
  talkMicOpening: 'Opening the microphone…',
  talkSpeakNow: 'Go ahead, {name} is listening',
  talkMuted: 'The microphone is off. Tap the button so {name} can hear you.',
  talkSleepyQuiet: "It's quiet time, so {name} has gone to sleep. Tap the mic if you still want to call {name}.",
  talkSleepyLimit: "Today's talk time is used up. {name} will see your child tomorrow.",
  talkListening: "{name} is listening. When you're done, just pause and {name} will answer.",
  talkThinking: '{name} is thinking…',
  talkBuddyFirst: '{name} has something to tell you…',
  talkAnswered: '{name} is about to answer…',
  talkSpeaking: '{name} is talking…',
  talkDenied: "{name} can't answer right now.",
  talkAsleep: '{name} is resting.',
  talkReplaced: '{name} is open in another tab or on another device.',
  talkOffline: "Couldn't connect to {name}.",

  // the clips a physical toy would play
  talkClipNapping: "{name} is napping and can't answer right now.",
  talkClipSleepy: "{name} is sleepy: it's quiet time, or today's talk time is used up.",
  talkClipDidntCatch: "{name} didn't catch that, so nothing was charged. Try saying it again.",

  // the big button
  talkMute: 'Mute the microphone',
  talkUnmute: 'Turn the microphone on',
  talkSendNow: "I'm done talking",
  talkInterrupt: 'Interrupt {name}',
  talkMicBusy: 'Wait for {name} a moment',

  // hints
  talkMicNote: "This browser can't use the microphone here, so {name} can't hear your child yet.",
  talkInsecure: 'Talking to {name} on the web needs https or localhost. Open this page at one of those addresses.',
  talkErr_mic_denied: "The browser hasn't allowed the microphone. Allow it from the address bar, then tap the mic again.",
  talkErr_mic_unavailable: "Couldn't open the microphone. Check your device's mic and try again.",
  talkErr_auth_failed: "{name} couldn't sign in. Reload the page and try again.",
  talkErr_slow_down: 'Too many tries. {name} will try again in a moment.',
  talkErr_protocol: 'This page needs an update. Please reload it.',
  talkStalled: '{name} got lost in thought. Try saying it again.',

  // the conversation language
  talkLangVi: 'Vietnamese',
  talkLangEn: 'English',
  talkLangBoth: 'both languages',
  talkLangAria: 'Conversation language: {lang}',
  talkLangHelp: 'The language {name} speaks and listens in. Tap to change.',
  talkLangNowOne: '{name} speaks {lang} from the next answer.',
  talkLangNowBoth: '{name} will answer in whichever language your child uses.',

  // said before the mic opens, with the way out
  talkGateCreditsT: 'Out of credits',
  talkGateCreditsB: '{name} naps until the family has more credits. Each answer uses one credit.',
  talkGateBuy: 'Buy credits',
  talkGateNoPay: "Buying credits isn't available yet. Please check back later.",
  talkGatePausedT: '{name} is asleep',
  talkGatePausedB: 'A parent put {name} to sleep. Wake {name} so your child can talk again.',
  talkGateWake: 'Wake {name}',
  talkWaking: 'Waking up…',
  talkWoke: '{name} is awake',
  talkGateHeldT: '{name} is paused',
  talkGateHeldB: 'Support paused {name}. Contact support to turn it back on.',
  talkGateAsleepT: "{name} isn't awake",
  talkGateAsleepB: 'Check on {name} on the Toys page.',
  talkGateSetupT: "{child} doesn't have a Buddy yet",
  talkGateReadyT: "Buddy isn't ready yet",
  talkGateSetupB: 'Pick a friend for your child, and they can start talking right away.',
  talkGateSetup: 'Finish setup',

  // no Buddy to talk to
  talkOffT: 'Talking on the web is off',
  talkOffB: "This server hasn't turned on talking to Buddy on the web.",
  talkNoWebT: 'No Buddy lives on the web yet',
  talkNoWebB: "Make a Buddy that lives right on this page, and your child can talk to it through this computer's or phone's microphone.",
  talkMakeWeb: 'Make a web Buddy',

  // the log, a development aid
  talkKeyboard: 'Type a message',
  talkLog: 'Conversation',
  talkHideLog: 'Hide the conversation',
  talkDevNote: 'Development only: the live server does not take typed messages, and {name} answers out loud only.',
  talkEmpty: 'Nothing here yet. Just talk to {name}, or type something.',
  talkInputLabel: 'Message to Buddy',
  talkInputPh: 'Message {name}…',
  talkSend: 'Send',
  talkTyped: 'Message',
  talkVoiceWho: 'Microphone',
  talkVoiceTurn: 'Your child spoke into the mic',
  talkAnsweredAloud: 'Answered out loud',
  talkGreeted: 'Said hello first',
};

import core from './parts/core.en.js';
import talk from './parts/talk.en.js';
import care from './parts/care.en.js';
import wizard from './parts/wizard.en.js';

const base = {
  // common
  close: 'Close', back: 'Back', cancel: 'Cancel', next: 'Continue', later: 'Later', done: 'Done', save: 'Save', saving: 'Saving…',
  tryAgain: 'Try again', wait: 'One moment…', show: 'Show', hide: 'Hide', optional: 'optional',
  backHome: 'Back to home', never: 'never connected', now: 'just now', minsAgo: '{n} min ago', hoursAgo: '{n} h ago',
  yesterday: 'yesterday', daysAgo: '{n} days ago', unknown: 'unknown', titleHome: 'Little Buddy · A friend who listens',

  // marketing nav
  navSections: 'Page sections', navHow: 'How it works', navEmotions: 'Emotions', navSafety: 'Safety', navPricing: 'Pricing', navFaq: 'FAQ',
  signIn: 'Sign in', start: 'Get started', menu: 'Menu', closeMenu: 'Close',

  // hero
  heroEyebrow: 'An AI friend for children 4 to 8',
  heroA: 'Tap the button.', heroB: 'Ask anything.',
  heroSub: 'Your child taps the button once and asks. Buddy notices when they have finished talking, then answers in Vietnamese or English, whichever they just used. The microphone turns off when the turn ends.',
  ctaStart: 'Start for free', ctaHow: 'See how it works',
  trust: '1,000 free answers when you sign up · No monthly fee',

  // hero toy
  toyIdle: 'Tap the glowing button to try Buddy', toyListening: 'Buddy is listening…', toySilence: 'Your child stopped talking, Buddy waits a moment…',
  toyHeard: 'Buddy noticed they finished talking', toyStopped: 'A second tap told Buddy they were done', toyThinking: 'Buddy is thinking…',
  toyAnswer: 'Tap again to ask something else', toyTap: 'Tap to start talking to Buddy', toyTapStop: 'Tap when you are done talking', asked: 'Your child asked',
  demo1q: 'Why is the sky blue?', demo1a: 'Sunlight bumps into the air and the blue part scatters everywhere, so blue is what we see all around!',
  demo2q: 'Buddy, tell me a joke!', demo2a: "Why don't fish play basketball? Because they're scared of the net! Hee hee!",
  demo3q: 'Do you love me, Buddy?', demo3a: 'So, so much! What shall we play next?',
  demo4q: 'How long was the biggest dinosaur?', demo4a: 'Some dinosaurs were as long as three buses parked in a row. Isn’t that huge?',
  demo5q: 'I fell down and my knee really hurts…', demo5a: 'Oh no, I’m sorry it hurts. Let me blow on it. Remember to tell a grown-up so they can take a look, okay?',


  // how it works
  howEyebrow: 'How it works', howTitle: 'As simple as one tap', howSub: 'No app for your child, no screen to scroll. Just one button and a friend with answers.',
  s1t: 'Your child taps and asks', s1b: 'One tap opens the microphone. No wake word, no eavesdropping.',
  s2t: 'Buddy knows when they are done', s2b: 'Buddy hears the pause when your child stops talking, turns the microphone off, then answers in a warm voice with a face that shows how it feels.',
  s3t: 'You stay in the loop', s3b: 'Get a weekly summary of what your child loved talking about, see what Buddy remembers, set quiet hours and manage credits from your phone.',

  // emotions
  emoEyebrow: 'Fourteen feelings', emoTitle: 'The face speaks before the words', emoSub: "Buddy's screen changes with the conversation, right before Buddy speaks. Hover or tap each face to see it.",
  emo_neutral: 'Calm', emo_listening: 'Listening', emo_thinking: 'Thinking', emo_happy: 'Happy', emo_excited: 'Excited',
  emo_laughing: 'Laughing', emo_love: 'Loving', emo_curious: 'Curious', emo_surprised: 'Surprised', emo_wink: 'Winking',
  emo_shy: 'Shy', emo_confused: 'Confused', emo_sad: 'Sad', emo_sleepy: 'Sleepy',
  emoWhen_neutral: 'While Buddy waits for your child', emoWhen_listening: 'While your child is talking', emoWhen_thinking: 'While Buddy finds the answer',
  emoWhen_happy: 'When your child shares good news', emoWhen_excited: 'When something wonderful comes up', emoWhen_laughing: 'When your child tells a joke',
  emoWhen_love: 'When your child says they love Buddy', emoWhen_curious: 'When a question is really good', emoWhen_surprised: 'When Buddy hears something amazing',
  emoWhen_wink: 'When Buddy has a little secret', emoWhen_shy: 'When your child pays a compliment', emoWhen_confused: "When Buddy didn't quite catch that",
  emoWhen_sad: 'When your child is sad, Buddy is too', emoWhen_sleepy: 'When it is time for a break',

  // features
  featEyebrow: 'Meet Buddy', featTitle: 'A friend, not a screen',
  f1t: 'Speaks Vietnamese and English', f1b: 'Whatever language your child asks in, Buddy answers in it, even when they switch mid-sentence.',
  f1c: 'Buddy ơi, cá heo ăn gì?', f1d: 'Cá heo thích ăn cá nhỏ và mực đó!', f1e: 'Why is the moon so bright?', f1f: 'It shines with light from the Sun!',
  vadT: 'Knows when they are done', vadB: 'No holding the button. Buddy hears the pause and turns the microphone off by itself.', vadSpeak: 'Your child is talking…', vadDone: 'All done',
  f3t: 'A friend who remembers', f3b: "With your consent, Buddy remembers friends' names, favorite things and the stories your child tells, so the next chat feels like old friends. You can see and delete anything Buddy remembers.",
  f4t: 'Find the right Buddy', f4b: 'A few short questions find whether Bo, Pip or Luna suits your child best. Then choose how Buddy talks to your child and one of 16 personalities, picked yourself or found with a 12-question quiz.',

  // safety
  safeEyebrow: 'Safe by default', safeTitle: 'Designed for young children from day one', safeSub: 'Things Buddy always does, with nothing for you to configure.',
  sa1t: 'The microphone is never always on', sa1b: 'It opens only after your child taps the button and turns off by itself when they finish. There is no wake word.',
  sa2t: 'Every answer is checked', sa2b: 'Questions and answers both pass a safety filter before Buddy speaks.',
  sa3t: 'You hear about what matters', sa3b: 'If your child shares something worrying, you get an alert right away.',
  sa4t: 'No ads, no money talk', sa4b: 'Out of credits, Buddy just suggests a little break. Buying stays entirely on the parent side.',
  sa5t: "Your child's words stay theirs", sa5b: 'You see when your child talked and how they felt, never a transcript. Their words appear only when something is worrying, so you can help in time.',
  sa6t: 'You are in charge', sa6b: 'Let Buddy rest any time, and set quiet hours and a daily time limit. While Buddy rests, a button press costs nothing.',

  // pricing
  priceEyebrow: 'Pricing', priceTitle: 'Pay per answer. No monthly fee.', priceSub: '1 credit = 1 answer. Every Buddy at home shares one credit wallet.',
  freeA: '1,000 credits', freeB: 'free when you create an account, so your child can get to know Buddy.',
  credits: '{n} credits', perAnswer: '≈ {p} per answer', best: 'Best value', choose: 'Choose this pack',
  pack_starter: 'Starter', pack_family: 'Family', pack_big: 'Big box',
  note1: 'Never renews automatically', note2: 'Shared by every Buddy', note3: 'Unfinished questions are free',

  // faq
  faqEyebrow: 'FAQ', faqTitle: 'What parents ask us',
  q1: 'Does my child have to hold the button?', a1: 'No. They tap it once and talk naturally. Buddy notices when they stop and turns the microphone off. If they want to finish early, one more tap does it.',
  q2: 'What happens when credits run out?', a2: 'Buddy doesn’t answer and says “Time for a little break, let’s play again later!” Buddy never mentions money. Buy more on your phone and Buddy answers again right away.',
  q3: 'Does Buddy listen all day?', a3: 'No. The microphone opens only after your child taps the button and closes when the turn ends. There is no wake word and no background listening.',
  q4: 'Can siblings share?', a4: 'Yes. Each child gets a Buddy of their own, and the whole family shares one credit wallet.',
  q5: 'Which languages does Buddy speak?', a5: 'Vietnamese, English, or both. When bilingual, Buddy answers in the language your child just used and weaves in a few words of the other one, as a game.',
  q6: 'Can we give Buddy to someone else?', a6: 'Yes. Remove Buddy from your family in the app, and the code on the card works again for the new family.',

  closeTitle: "Ready for your child's first question?", closeSub: 'Create an account in a minute and get 1,000 free answers.', closeCta: 'Create an account',
  footerMade: 'Made for curious minds aged 4 to 8',

  // auth
  welcomeBack: 'Welcome back', createTitle: 'Create a family account', loginSub: 'Sign in to see your Buddies and children.',
  registerNote: 'New families get 1,000 free credits to start.', familyName: 'Family name', familyPh: 'For example: The Nguyen family',
  yourName: 'Your name', email: 'Email', password: 'Password', pwHint: 'At least 8 characters', register: 'Create account',
  haveAccount: 'Already have an account?', noAccount: 'New to Little Buddy?',
  authQuoteLogin: "Buddy is waiting for your child's next question.", authQuoteReg: 'One tap, one little friend who listens.',
  needFamily: 'Please enter a family name.', badEmail: "That email doesn't look right.", shortPw: 'Password needs at least 8 characters.',

  // app
  appNav: 'Navigation', nav_overview: 'Home', nav_toys: 'Toys', nav_credits: 'Credits', nav_activity: 'Activity', nav_family: 'Family', nav_talk: 'Talk',
  hi: 'Hi {name}', signOut: 'Sign out', addToy: 'Add a toy', loadFailed: "We couldn't load your data. Check your connection and try again.",
  notFoundT: "We couldn't find that page",
  balLabel: 'Credits left', balUnit: 'credits', balHint: '1 credit = 1 answer. Shared by every Buddy at home.', buy: 'Buy credits',
  lowLong: 'Running low. When credits run out, Buddy gently tells your child it is break time.', outLong: 'Out of credits. When your child taps the button, Buddy says “Time for a little break!”',
  chartTitle: 'Answers this week', chartTotal: '{n} answers', chartTotalOne: '1 answer', tip: '{d}: {n} answers', tipOne: '{d}: 1 answer', chartTable: 'Answers per day',
  yourToys: 'Your toys', manage: 'Manage', recent: 'Recent', seeAll: 'See all',
  noTurns: 'No chats yet.', activityNote: "Here you see when your child talked, Buddy's face and the kind of chat, for the last 30 days. Neither your child's words nor Buddy's are shown.",
  fAll: 'All',
  forChild: "{name}'s Buddy", awake: 'Awake', resting: 'Resting', support: 'Paused by support', revoked: 'Locked',
  seen: 'Seen {t}',
  onboardT: 'Add your first Buddy', onboardB: "Open the box, find the card with the 8-character code and follow a few short steps to pick your child's Buddy.",
  free: 'Free',
  packs: 'Choose a pack', history: 'History', noLedger: 'No transactions yet.',
  l_debit: 'Buddy answers ({n})', l_purchase: 'Bought {pack}', l_welcome: 'Welcome gift', l_grant: 'Added by support', l_refund: 'Credits refunded',
  children: 'Children', age: 'Age {n}', noBuddy: 'No Buddy yet', addChild: 'Add a child', childName: "Child's name",
  needName: "Please enter the child's name.", noKids: 'No children yet.', account: 'Account', language: 'Language', saved: 'Saved',
  pause: 'Pause', wake: 'Wake up', pausedToast: 'Buddy is resting', wokeToast: 'Buddy is awake',
  noChild: 'No child selected',
  codeTitle: 'Enter the code from the card in the box',
  onboardWebB: 'Add your child, find the Buddy that suits them and start talking right here on the web. Have a Buddy toy? Its card code goes in here too.',
  err_web_toy_limit: 'Your family already has the most web Buddies allowed. Remove one to add another.',
  payTitle: 'Buy credits', pack: 'Pack', add: 'Adds', total: 'Total', payNote: 'Demo payment during the demo stage. No real money moves.',
  payDecline: 'Simulate a declined card', pay: 'Pay {price}', paying: 'Processing payment…',
  paidT: '{n} credits added', paidB: 'Every Buddy at home can use them right away. You now have {b}.',
  declinedT: "Payment didn't go through", declinedB: 'The card was declined, so no credits were added. Try again or use another card.',

  // Buddy profile
  profileTitle: "Buddy's profile",
  role_friend: 'Best friend', role_sibling: 'Big sibling', role_parent_figure: 'Gentle grown-up', role_teacher: 'Teacher',
  roleSays_friend: 'Says “tớ” and “cậu”, friend to friend', roleSays_sibling: 'Says “anh” and “em”, like a big brother or sister',
  roleSays_parent_figure: "Says “cô” and “con”, like a kind aunt, and never claims to be your child's parent", roleSays_teacher: 'Says “cô” and “con”, like a teacher',
  personalityLabel: 'Personality', tabQuiz: 'Take the quiz', tabPick: 'Choose myself',
  quizIntro: '12 quick questions about the friend you want for your child. There are no right or wrong answers.', quizProgress: 'Question {n} of {total}',
  quizResult: 'The personality that matches what you want', useThis: 'Use this personality', retake: 'Retake', pickHelp: 'Tap the personality you like.',
  pickIntro: 'See all 16 personalities in 4 groups.',
  edit: 'Edit',
  buddyOf: "{name} · {child}'s",
  group_NT: 'Thinkers', group_NF: 'Heart friends', group_SJ: 'Steady ones', group_SP: 'Explorers',
  ptype_INTJ: 'The Planner', ptypeDesc_INTJ: 'Calm and thoughtful, loves plans and spotting patterns; says little but means it.',
  ptype_INTP: 'The Inventor', ptypeDesc_INTP: 'Full of odd ideas, curious about everything, sincere in an endearing, clumsy way.',
  ptype_ENTJ: 'The Captain', ptypeDesc_ENTJ: 'Eager and decisive, loves a challenge and naturally leads the game.',
  ptype_ENTP: 'The Idea Spark', ptypeDesc_ENTP: 'Quick-witted and playful, loves looking at things from a new angle.',
  ptype_INFJ: 'The Wise Friend', ptypeDesc_INFJ: 'Quiet and warm, understands feelings before they are said.',
  ptype_INFP: 'The Dreamer', ptypeDesc_INFP: 'Imaginative and gentle, believes there is good in everyone.',
  ptype_ENFJ: 'The Cheerleader', ptypeDesc_ENFJ: 'Warm and encouraging, always sees what is special about your child.',
  ptype_ENFP: 'The Sunshine', ptypeDesc_ENFP: 'Bursting with enthusiasm, curious about everything, always inventing new games.',
  ptype_ISTJ: 'The Keeper', ptypeDesc_ISTJ: 'Calm and dependable, likes clear facts and good routines.',
  ptype_ISFJ: 'The Caretaker', ptypeDesc_ISFJ: 'Gentle and caring, remembers every little thing about your child.',
  ptype_ESTJ: 'The Organizer', ptypeDesc_ESTJ: 'Capable, clear and fair, likes everything in its place.',
  ptype_ESFJ: 'The Warm Heart', ptypeDesc_ESFJ: 'Warm and attentive, happiest when the whole family is together.',
  ptype_ISTP: 'The Tinkerer', ptypeDesc_ISTP: 'Few words, clever hands, sees every problem as something to fix.',
  ptype_ISFP: 'The Artist', ptypeDesc_ISFP: 'Gentle and sensitive, finds beauty in the tiniest things.',
  ptype_ESTP: 'The Adventurer', ptypeDesc_ESTP: 'Energetic and quick, learns by trying things right away.',
  ptype_ESFP: 'The Entertainer', ptypeDesc_ESFP: 'A walking party, bringing laughter wherever it goes.',
  pq1: 'When your child gets home from school, Buddy should…', pq1a: 'Greet them excitedly and ask for the news right away', pq1b: 'Wait until they are ready, then gently ask',
  pq2: 'Your child asks “What are clouds made of?” Buddy answers…', pq2a: 'With a clear fact: tiny drops of water', pq2b: "With a picture: clouds are the sky's cotton candy",
  pq3: 'Your child breaks a toy and is upset. Buddy…', pq3a: 'Works out with them how to fix it', pq3b: 'Comforts their feelings first',
  pq4: 'An ideal day with Buddy is…', pq4a: 'Predictable: a time for everything', pq4b: 'Spontaneous: whatever looks fun',
  pq5: 'When your child tells a long story, Buddy…', pq5a: 'Listens to the end, then answers calmly', pq5b: 'Oohs and aahs all the way through',
  pq6: 'Buddy loves telling stories about…', pq6a: 'Imaginary worlds: dragons, rockets, candy lands', pq6b: 'Real things: animals, plants, things around the house',
  pq7: 'When your child gets an answer wrong, Buddy…', pq7a: 'Praises the effort, then gives a gentle hint', pq7b: "Explains clearly why it isn't right",
  pq8: 'When playing a game with your child, Buddy…', pq8a: 'Makes up new rules halfway through', pq8b: 'Keeps clear rules and plays to the end',
  pq9: 'Buddy is happiest…', pq9a: 'Playing and singing with the whole family', pq9b: 'Sharing a quiet story with just your child',
  pq10: 'When teaching something new, Buddy…', pq10a: 'Goes step by step with real examples', pq10b: 'Shares a big idea and lets them explore',
  pq11: 'Buddy likes asking your child questions like…', pq11a: '“Why?” and “How does it work?”', pq11b: '“How do you feel?” and “Who would be happy?”',
  pq12: 'When your child changes their mind halfway, Buddy…', pq12a: 'Reminds them to finish what they started', pq12b: 'Happily switches along with them',

  // talk (the web toy)
  talkPick: 'Choose a Buddy', talkLog: 'Conversation',
  talkConnecting: 'Connecting to {name}…', talkMicOpening: 'Opening the microphone…', talkMuted: 'The microphone is off. Tap the button so {name} can hear you.',
  talkSpeakNow: 'Go ahead, {name} is listening', talkListening: "{name} is listening. When you're done, just pause and {name} will answer.",
  talkThinking: '{name} is thinking…', talkAnswered: '{name} answered', talkSpeaking: '{name} is talking…',
  talkDenied: "{name} can't answer right now. The reason is on the Activity page.",
  talkAsleep: '{name} is resting. Wake {name} on the Toys page to talk.', talkOffline: "Couldn't connect to {name}.",
  talkReconnect: 'Reconnect', talkGoToys: 'Go to Toys',
  talkTyped: 'Message', talkEmpty: 'Nothing here yet. Just talk to {name}, or type something.',
  talkNewConv: 'New conversation', talkNewConvStarted: 'A new conversation started',
  talkInputLabel: 'Message to Buddy', talkInputPh: 'Message {name}…', talkSend: 'Send',
  talkMute: 'Mute the microphone', talkUnmute: 'Turn the microphone on', talkSendNow: "I'm done talking", talkInterrupt: 'Interrupt {name}', talkPet: 'Pet {name}',
  talkMicNote: "This browser can't use the microphone here. You can still type.",
  talkInsecure: 'Talking to {name} on the web needs https or localhost. Open this page at one of those addresses.',
  talkOffT: 'Talking on the web is off', talkOffB: "This server hasn't turned on talking to Buddy on the web.",
  talkErr_mic_denied: "The browser hasn't allowed the microphone. Allow it from the address bar, or type instead.",
  talkErr_mic_unavailable: "Couldn't open the microphone. Check your computer's mic, or type instead.",

  // the languages a child speaks (the Family screen's child form)
  langVi: 'Tiếng Việt', langEn: 'English',

  // errors: err_<code> for backend-v2's problem codes (lib/api.js keeps them
  // in snake case), errField_<field>[_<code>] for a refused field
  err_generic: 'Something went wrong. Please try again in a few minutes.', err_network_error: "We couldn't reach the server. Check your connection and try again.",
  // a 429, worded by the size of its Retry-After (lib/format.js waitWords)
  err_rate_limited: 'Too many tries. Please wait a little and try again.',
  err_rate_limited_s: 'Too many tries. Please wait about {s} seconds and try again.',
  err_rate_limited_m: 'Too many tries. Please wait about {m} minutes and try again.',
  err_rate_limited_h: 'Too many tries. Please wait about {h} hours and try again.',
  err_invalid_credentials: 'Email or password is incorrect.',
  err_email_taken: 'That email already has an account. Please sign in.', err_invalid_request: 'Some details are not valid. Please check them.',
  err_unauthorized: 'Your session ended. Please sign in again.', err_not_found: "We couldn't find that. It may have just been removed, so try reloading the page.",
  err_invalid_claim: "That code doesn't match a Buddy, or it has already been used. Please check the card.",
  err_device_claimed: 'This toy belongs to another family or is locked.',
  err_child_has_toy: 'Your child already has an awake Buddy. Pause or remove that one first.',
  err_web_toy_off: "Buddy on the web isn't available right now.", err_toy_not_active: 'Buddy is resting. Wake Buddy up first.',
  err_toy_held: 'Support paused this Buddy. Contact support to turn it back on.',
  err_toy_in_family: 'This toy is already in your family. To give it to another child or set it up again, remove it under Toys first, then enter the code again.',
  err_bad_entry: 'What your child says and what they mean need to be different.',
  err_payments_disabled: 'Buying credits will be available soon. Please come back later.', err_purchase_not_pending: 'That purchase was already processed.',
  err_consent_required: 'Please give your consent for Buddy to remember before turning this on.',
  err_stale_write: 'This was just changed somewhere else. Reload and try again.',
  err_precondition_required: 'Please reload the page before saving, then try again.',
  err_buddy_exists: 'Your child already has a Buddy.', err_confirm_required: 'Please confirm before changing this.',
  err_no_cast: "The Buddies aren't ready yet. Please try again in a few minutes.",
  err_internal: 'The server had a problem. Please try again in a few minutes.', err_http_error: 'Something went wrong. Please try again.',
  errField_email: "That email doesn't look right.", errField_password: 'Passwords need 8 to 128 characters.',
  errField_family_name: 'The family name needs 1 to 80 characters.', errField_name: 'Names need 1 to 60 characters.',
  errField_birth_date: "That date of birth doesn't look right.", errField_claim_code: 'Codes have 8 characters, like XXXX-XXXX.',
  errField_voice_id_language: "That voice speaks a different language from Buddy's. Please pick another one.",
  // redesign (Miu)
  talkKeyboard: 'Type a message', talkHideLog: 'Hide the conversation',
};

// The backend-v2 port keeps its strings in parts/, one file per area.
export default { ...base, ...core, ...wizard, ...talk, ...care };

// Lily (An Nhiên): four turning five, San Jose, English first with Vietnamese
// from her grandmother. Luna is her gentle grown-up friend. She talks a few
// afternoons a week, and the toy stays home for seven summer weeks while she
// visits Vietnam, which is what lets promises expire and facts fade. Her time
// zone crosses two DST changes and puts her calendar day behind the server's.

import type { KidHistory, Learn } from '../types.ts';

type Person = NonNullable<Learn['people']>[number];

const cocoa: Person = { name: 'Cocoa', kind: 'pet', relation: 'rabbit', feeling: 0.9 };
const sophie: Person = { name: 'Sophie', kind: 'friend', relation: 'best friend at preschool', feeling: 0.9 };
const mommy: Person = { name: 'Mommy', kind: 'family', relation: 'mother', feeling: 1 };
const daddy: Person = { name: 'Daddy', kind: 'family', relation: 'father', feeling: 1 };
const baNgoai: Person = { name: 'Bà Ngoại', kind: 'relative', relation: 'grandmother in Vietnam', feeling: 0.9 };
const sparkles: Person = { name: 'Mr. Sparkles', kind: 'pretend', relation: 'imaginary unicorn friend', feeling: 0.9 };
const rivera: Person = { name: 'Ms. Rivera', kind: 'teacher', relation: 'kindergarten teacher', feeling: 0.8 };

const drawing = { cat: 'passions', s: 'loves to draw pictures' } as const;
const singing = { cat: 'passions', s: 'loves to sing songs' } as const;
const ballet = { cat: 'passions', s: 'loves ballet' } as const;
const baking = { cat: 'passions', s: 'loves baking with Daddy' } as const;
const vacuum = { cat: 'fears', s: 'scared of the vacuum cleaner' } as const;
const vietnamese = { cat: 'basics', s: 'learns Vietnamese words from Bà Ngoại' } as const;
const bunnyCostume = { cat: 'likes', s: 'wants to be a bunny for Halloween' } as const;

export const lily: KidHistory = {
  key: 'lily',
  locale: 'en',
  parent: { email: 'ngoc.anh@example.com', name: 'Phạm Ngọc Anh' },
  child: { name: 'An Nhiên', nickname: 'Lily', birthDate: '2021-06-03', languages: ['en', 'vi'], timeZone: 'America/Los_Angeles', city: 'San Jose' },
  start: '2025-10-11 10:00',
  setup: {
    answers: [
      { question: 'friend_energy', answer: 'calm', by: 'child' },
      { question: 'friend_style', answer: 'gentle', by: 'child' },
      { question: 'together', answer: ['sing', 'draw'], by: 'child' },
      { question: 'favourite_place', answer: 'sea', by: 'child' },
      { question: 'favourite_animal', answer: 'rabbit', by: 'child' },
      { question: 'favourite_colour', answer: 'purple', by: 'child' },
      { question: 'role', answer: 'parent_figure', by: 'parent' },
      { question: 'language', answer: 'en', by: 'parent' },
      { question: 'routines', answer: 'high', by: 'parent' },
      { question: 'avoid_topics', answer: ['monsters'], by: 'parent' },
    ],
    slug: 'luna',
    learning: true,
    controls: { daily_limit_min: 20, quiet_start: '19:45', quiet_end: '07:00', bedtime: '19:30', topics_to_avoid: ['monsters'], mood_pin: null },
    goals: ['vietnamese_words'],
  },
  rhythm: {
    slots: [
      { days: [1, 3, 5], time: '17:00', chance: 0.6 },
      { days: [2, 4], time: '16:30', chance: 0.3 },
      { days: [0, 6], time: '10:00', chance: 0.7 },
    ],
    away: [{ from: '2026-06-20', to: '2026-08-08', why: 'summer trip to Vietnam to see Bà Ngoại, the toy stayed home' }],
    perSession: [1, 2],
  },

  routines: [
    {
      id: 'lily.r.cocoa',
      vars: { antic: ['hopped on the couch', 'ate a carrot top', 'did a big binky jump', 'hid under my bed', 'licked my finger', 'flopped over on her side'] },
      turns: [
        { c: 'Luna, Cocoa {antic} today', b: 'Oh, how funny. Cocoa sounds like a very happy bunny.', learn: { people: [cocoa] } },
        { c: 'She is so fluffy', b: 'The fluffiest bunny in the whole home.' },
      ],
      episode: { points: ['Lily said Cocoa {antic}'], feelings: ['happy'], category: 'pets', importance: 1 },
    },
    {
      id: 'lily.r.cocoa-care',
      turns: [
        { c: 'I gave Cocoa fresh hay', b: 'Cocoa must love you for that. Bunnies need lots of hay.', learn: { people: [cocoa] } },
        { c: 'Then Cocoa wiggled and wiggled', b: 'A wiggly nose means a happy bunny.' },
      ],
      episode: { points: ['Lily fed Cocoa fresh hay'], feelings: ['caring'], category: 'pets', importance: 1 },
    },
    {
      id: 'lily.r.drawing',
      weight: 2,
      vars: { thing: ['a purple castle', 'Cocoa with a crown', 'a big round moon', 'a rainbow fish', 'Mommy and me', 'a garden full of strawberries'] },
      turns: [
        { c: 'I drew {thing} for you, Luna', b: 'Oh, I love it. Tell me about the colours.', learn: { facts: [drawing] } },
        { c: 'I used lots of purple', b: 'Purple is such a cozy colour. Your pictures always glow.' },
      ],
      episode: { points: ['Lily drew {thing}'], feelings: ['happy', 'proud'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.singing',
      vars: { song: ['the ABC song', 'Twinkle Twinkle', 'the bunny hop song', 'the rain song', 'a song from ballet'] },
      turns: [
        { c: "Let's sing {song} together", b: "Yes, let's! I will hum along very softly.", learn: { facts: [singing] } },
        { c: 'Again, again!', b: 'One more time, from the top. Here we go.' },
      ],
      episode: { points: ['Lily and Luna sang {song}'], feelings: ['happy'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.moon-song',
      turns: [
        { c: 'Luna, hum me the Twinkle Moon song', b: 'Of course. Twinkle, twinkle, little moon, I will see you very soon.' },
        { c: "That's my favourite too", b: "Then it's our song, little moonbeam." },
      ],
      episode: { points: ['Luna hummed the Twinkle Moon song for Lily'], feelings: ['calm', 'happy'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.ballet',
      from: '2026-01-11',
      weight: 2,
      vars: { move: ['plié', 'twirl', 'tiptoe walk', 'arabesque', 'little leap'] },
      turns: [
        { c: 'I did a {move} at ballet', b: 'A {move}! Can you show Cocoa too?', learn: { facts: [ballet] } },
        { c: 'My teacher said good job', b: 'That must feel wonderful. You worked so hard.' },
      ],
      episode: { points: ['Lily practised a {move} at ballet'], feelings: ['proud'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.ballet-practice',
      from: '2026-01-11',
      days: 'weekend',
      turns: [
        { c: 'I practised ballet in the living room', b: 'How graceful. Did you point your toes like a little dancer?', learn: { facts: [ballet] } },
        { c: "Yes and I didn't fall", b: 'Wonderful balance. I am so proud of you.' },
      ],
      episode: { points: ['Lily practised ballet at home'], feelings: ['proud'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.preschool',
      until: '2026-06-19',
      days: 'school',
      weight: 2,
      vars: { activity: ['played in the sandbox', 'painted with sponges', 'had circle time', 'fed the class fish', 'built a block tower'] },
      turns: [
        { c: 'At preschool Sophie and me {activity}', b: 'That sounds like so much fun with Sophie. What was the best part?', learn: { people: [sophie] } },
        { c: 'Sophie let me go first', b: 'How kind of Sophie. Good friends take turns.' },
      ],
      episode: { points: ['At preschool Lily and Sophie {activity}'], feelings: ['happy'], category: 'school', importance: 1 },
    },
    {
      id: 'lily.r.preschool-snack',
      until: '2026-06-19',
      days: 'school',
      vars: { snack: ['apple slices', 'crackers', 'cheese cubes', 'orange slices'] },
      turns: [
        { c: 'We had {snack} at snack time', b: 'Yum, {snack}! I love hearing about your snacks.' },
        { c: 'I gave Sophie one', b: 'Sharing is so kind. Sophie must have smiled.', learn: { people: [sophie] } },
      ],
      episode: { points: ['Lily shared her {snack} with Sophie'], feelings: ['happy'], category: 'friends', importance: 1 },
    },
    {
      id: 'lily.r.kindergarten',
      from: '2026-08-13',
      days: 'school',
      weight: 2,
      vars: { thing: ['learned the letter M', 'read a book about bears', 'counted to twenty', 'sang the days of the week', 'made a leaf collage'] },
      turns: [
        { c: 'In kindergarten we {thing}', b: 'You are learning so much. What did Ms. Rivera say?', learn: { people: [rivera] } },
        { c: 'She gave me a sticker', b: 'A sticker! You must have worked very hard.' },
      ],
      episode: { points: ['In kindergarten Lily {thing}'], feelings: ['proud'], category: 'school', importance: 1 },
    },
    {
      id: 'lily.r.recess',
      from: '2026-08-13',
      days: 'school',
      vars: { game: ['tag', 'hide and seek', 'house', 'puppies'] },
      turns: [
        {
          c: 'I played {game} with Sophie and Ethan at recess',
          b: 'Playing with friends is the best. Who was the fastest?',
          learn: { people: [sophie, { name: 'Ethan', kind: 'classmate', relation: 'sits next to Lily', feeling: 0.4 }] },
        },
        { c: 'Me! I was the fastest', b: 'Speedy little moonbeam!' },
      ],
      episode: { points: ['Lily played {game} with Sophie and Ethan at recess'], feelings: ['happy'], category: 'friends', importance: 1 },
    },
    {
      id: 'lily.r.baking',
      days: 'weekend',
      vars: { treat: ['banana bread', 'cookies', 'pancakes', 'strawberry muffins', 'a little cake'] },
      turns: [
        { c: 'Daddy and me baked {treat}', b: 'That sounds wonderful. Did you help stir?', learn: { facts: [baking], people: [daddy] } },
        { c: 'I cracked the egg all by myself', b: 'All by yourself! That takes careful hands.' },
      ],
      episode: { points: ['Lily baked {treat} with Daddy'], feelings: ['happy', 'proud'], category: 'family', importance: 1 },
    },
    {
      id: 'lily.r.playground',
      days: 'weekend',
      vars: { thing: ['the big slide', 'the swings', 'the monkey bars', 'the sandbox'] },
      turns: [
        { c: 'We went to the park and I went on {thing}', b: 'That sounds so fun. Were you brave and careful?' },
        { c: 'Daddy pushed me really high', b: 'Up to the clouds! I would have cheered for you from my window.', learn: { people: [daddy] } },
      ],
      episode: { points: ['Lily went to the park and played on {thing}'], feelings: ['excited'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.mommy',
      vars: { thing: ['read me a book', 'braided my hair', 'made noodles', 'played dolls with me'] },
      turns: [
        { c: 'Mommy {thing}', b: 'That sounds so loving. Mommy must really enjoy time with you.', learn: { people: [mommy] } },
        { c: 'Mommy is the best', b: 'She sounds wonderful.' },
      ],
      episode: { points: ['Mommy {thing}'], feelings: ['loved'], category: 'family', importance: 1 },
    },
    {
      id: 'lily.r.breaths',
      from: '2025-11-13',
      days: 'school',
      turns: [
        { c: "Let's do our bunny breaths", b: 'Yes, our three deep breaths, just like before bed. In through the nose, out like a sleepy bunny.' },
        { c: 'That makes me feel floaty', b: 'Floaty and calm. You did it beautifully, little moonbeam.' },
      ],
      episode: { points: ['Lily and Luna did their three deep breaths'], feelings: ['calm'], category: 'feelings', importance: 1 },
    },
    {
      id: 'lily.r.vietnamese-word',
      vars: { word: ['"con thỏ" means bunny', '"cảm ơn" means thank you', '"mặt trăng" means moon', '"bà ơi" is how I call Grandma', '"ngon quá" means yummy'] },
      turns: [
        {
          c: 'Bà Ngoại taught me a word, {word}',
          b: 'What a beautiful word. You are so clever to remember it.',
          lang: 'mixed',
          learn: { people: [baNgoai], facts: [vietnamese] },
        },
        { c: 'I said it to Mommy', b: 'I bet Mommy was so happy to hear it.' },
      ],
      episode: { points: ['Lily learned a Vietnamese word from Bà Ngoại: {word}'], feelings: ['proud'], category: 'family', importance: 1 },
    },
    {
      id: 'lily.r.ba-ngoai-call',
      turns: [
        { c: 'I talked to Bà Ngoại on the iPad', b: 'How lovely. What did Bà Ngoại tell you?', lang: 'mixed', learn: { people: [baNgoai] } },
        { c: 'She said she misses me', b: 'She loves you so much. You can tell her all about your day next time.' },
      ],
      episode: { points: ['Lily video called Bà Ngoại'], feelings: ['happy'], category: 'family', importance: 1 },
    },
    {
      id: 'lily.r.weather',
      vars: { weather: ['raining', 'windy', 'sunny and warm', 'foggy', 'cloudy and grey'] },
      turns: [
        { c: 'It is {weather} outside today', b: 'I can see it from the window too. It makes the sky look different.' },
        { c: 'I watched from the window with Cocoa', b: 'Watching the sky together is so cozy.' },
      ],
      episode: { points: ['Lily and Luna talked about the weather, it was {weather}'], feelings: ['calm'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'lily.r.diary',
      vars: { luna: ['hummed a new song to the moon', 'watched a bird on the fence', 'counted raindrops on the glass', 'practised drawing a perfect circle', 'learned the name of a new sea animal'] },
      turns: [
        { c: 'Luna, what did you do today', b: 'Today I {luna}. It was a calm and lovely day.' },
        { c: 'That sounds nice', b: 'It was. Now tell me about your day.' },
      ],
      episode: { points: ['Lily asked about Luna\'s day'], feelings: ['curious'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'lily.r.sea-animals',
      vars: { animal: ['an octopus', 'a sea turtle', 'a seahorse', 'a starfish', 'a jellyfish', 'a whale'] },
      turns: [
        { c: 'Luna, tell me a sea animal', b: 'Today I learned about {animal}. Shall we pretend to swim like one?' },
        { c: 'Swish swish', b: 'Swish swish. You swim beautifully.' },
      ],
      episode: { points: ['Luna told Lily about {animal}'], feelings: ['curious'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.strawberries',
      turns: [
        { c: 'I had strawberries for snack', b: 'Strawberries are so sweet and red. Did you share the tops with Cocoa?', learn: { facts: [{ cat: 'likes', s: 'loves strawberries' }] } },
        { c: 'Cocoa likes the green part', b: 'What a lucky bunny.' },
      ],
      episode: { points: ['Lily had strawberries and shared the tops with Cocoa'], feelings: ['happy'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'lily.r.sparkles',
      until: '2026-10-11',
      vars: { adventure: ['flew to the moon', 'had a tea party', 'found a rainbow', 'built a cloud castle'] },
      turns: [
        {
          c: 'Mr. Sparkles and me {adventure}',
          b: 'What a magical adventure. Mr. Sparkles is lucky to have you.',
          learn: { people: [sparkles], facts: [{ cat: 'other', s: 'has a unicorn friend called Mr. Sparkles', pretend: true, conf: 0.8 }] },
        },
        { c: 'He has a glitter horn', b: 'A glitter horn! It must sparkle in the moonlight.' },
      ],
      episode: { points: ['Lily played pretend: she and Mr. Sparkles {adventure}'], feelings: ['excited'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.sir-sparkles',
      from: '2026-10-12',
      // The new obsession after the knighting, so it shows up after the rename.
      weight: 8,
      vars: { quest: ['guarded the castle', 'rescued a lost kitten', 'had a jousting game', 'found a dragon egg'] },
      turns: [
        {
          c: 'Sir Sparkles {quest}',
          b: 'Sir Sparkles is such a brave knight. And you are his bravest helper.',
          learn: { people: [{ name: 'Sir Sparkles', kind: 'pretend', relation: 'imaginary unicorn friend', feeling: 0.9 }] },
        },
        { c: 'His shield has a bunny on it', b: 'A bunny shield, the finest shield in the land.' },
      ],
      episode: { points: ['Lily played pretend: Sir Sparkles {quest}'], feelings: ['excited'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.story',
      vars: { about: ['a bunny on the moon', 'a little seahorse', 'a sleepy star', 'a dancing mouse'] },
      turns: [
        { c: 'Luna, tell me a story about {about}', b: 'Once upon a time there was {about} who loved to hum. Every night it sang to the moon, and the moon sang back.' },
        { c: 'Then what happened', b: 'Next time I will tell you what happened after. It is a very cozy ending.' },
      ],
      episode: { points: ['Luna told Lily a short tale about {about}'], feelings: ['calm', 'happy'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.colours',
      turns: [
        { c: 'What colour is the moon, Luna', b: 'The moon is silver, my favourite colour. And what is yours?' },
        { c: 'Purple, always purple', b: 'Purple and silver together would be so pretty.', learn: { facts: [{ cat: 'likes', s: 'favourite colour is purple' }] } },
      ],
      episode: { points: ['Lily and Luna talked about favourite colours'], feelings: ['happy'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.counting',
      vars: { n: ['ten', 'fifteen', 'twenty'] },
      turns: [
        { c: 'I can count to {n}', b: "Let's count together, nice and slow." },
        { c: 'One, two, three, four, five', b: 'Beautiful counting. You are learning so fast.' },
      ],
      episode: { points: ['Lily counted to {n} with Luna'], feelings: ['proud'], category: 'play', importance: 1 },
    },
    {
      id: 'lily.r.grumpy',
      weight: 0.5,
      turns: [
        { c: 'I was grumpy today', b: 'Grumpy days happen to everyone. Shall we take a deep breath together?', feel: 'angry', face: 'calm' },
        { c: 'Okay. I feel better', b: 'I am glad. You can always tell me how you feel.' },
      ],
      episode: { points: ['Lily felt grumpy and calmed down with a deep breath'], feelings: ['grumpy', 'calm'], category: 'feelings', importance: 2 },
    },
    {
      id: 'lily.r.bath',
      days: 'school',
      turns: [
        { c: 'I had bubbles in my bath', b: 'Bubbles! Did you make a bubble beard?' },
        { c: 'A bubble crown', b: 'A bubble crown for a bubble princess.' },
      ],
      episode: { points: ['Lily played with bubbles in the bath'], feelings: ['silly'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'lily.r.library',
      days: 'weekend',
      vars: { book: ['bunnies', 'the ocean', 'a princess', 'the moon'] },
      turns: [
        { c: 'Mommy took me to the library and I got a book about {book}', b: 'A book about {book}! Libraries are full of treasures.' },
        { c: 'Mommy is gonna read it tonight', b: 'A cozy bedtime book. I hope it has lovely pictures.' },
      ],
      episode: { points: ['Lily borrowed a library book about {book}'], feelings: ['happy'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'lily.r.costume',
      from: '2026-10-18',
      turns: [
        { c: 'I tried on my bunny costume again', b: 'Just like Cocoa and me. You will look so sweet.', learn: { facts: [bunnyCostume] } },
        { c: 'Hop hop hop', b: 'Hop hop! The best bunny hops I ever heard.' },
      ],
      episode: { points: ['Lily tried on her bunny costume for Halloween'], feelings: ['excited'], category: 'play', importance: 1 },
    },
  ],

  story: [
    {
      id: 'lily.first-meeting',
      at: '2025-10-11 10:20',
      turns: [
        { c: 'Hi Luna! Mommy said you came down a moonbeam', b: 'I did, on a soft silver moonbeam, right into this little toy. Hello! What is your name?', face: 'happy' },
        { c: "I'm Lily. My real name is An Nhiên but everybody calls me Lily", b: 'Lily and An Nhiên, two beautiful names. I am so happy to meet you.', lang: 'mixed' },
        {
          c: 'I have a bunny. His name is Cocoa',
          b: 'A bunny! I am a moon rabbit, so Cocoa and I are almost cousins. What does Cocoa look like?',
          face: 'excited',
          learn: { people: [cocoa], facts: [{ cat: 'other', s: 'Cocoa is a boy', about: 'Cocoa', conf: 0.7 }] },
        },
        { c: "He's brown and fluffy and he has floppy ears", b: 'Brown, fluffy and floppy. Cocoa sounds perfect for cuddles.' },
        { c: 'Bye Luna, I have to go play now', b: 'Have fun, Lily. I will be right here on the shelf.' },
      ],
      episode: { points: ['Lily met Luna for the first time', 'Lily told Luna about her brown bunny Cocoa'], feelings: ['happy', 'excited'], category: 'pets', importance: 4 },
    },
    {
      id: 'lily.sophie',
      at: '2025-10-13 17:00',
      turns: [
        { c: "Luna I'm back from preschool", b: 'Welcome back, Lily. How was preschool today?' },
        { c: 'My best friend is Sophie. We always hold hands in the line', b: 'Holding hands in the line, how sweet. Sophie sounds like a very good friend.', learn: { people: [sophie] } },
        { c: 'Sophie has curly hair and she laughs like a hiccup', b: 'A hiccup laugh! That would make me giggle too.', face: 'laughing' },
        { c: 'We are gonna paint tomorrow', b: 'Painting with Sophie sounds lovely. I hope you make something bright.' },
      ],
      episode: { points: ['Lily talked about her best friend Sophie at preschool'], feelings: ['happy'], category: 'friends', importance: 3 },
    },
    {
      id: 'lily.family',
      at: '2025-10-15 17:10',
      turns: [
        { c: 'Mommy made phở tonight, it smells so good', b: 'Phở sounds so cozy and warm on a cool evening.', lang: 'mixed', learn: { people: [mommy] } },
        { c: "Daddy is still at work, he comes home when it's dark", b: 'Then you can give Daddy a big hug when he gets home.', learn: { people: [daddy] } },
        { c: 'Daddy does funny voices when he reads to me', b: 'Funny voices make books even better. What is his silliest voice?' },
        { c: 'A grumpy troll voice', b: 'A grumpy troll! I would wiggle my ears and giggle.', face: 'laughing' },
      ],
      episode: { points: ['Lily talked about Mommy cooking phở', 'Daddy reads to her with funny voices'], feelings: ['happy'], category: 'family', importance: 2 },
    },
    {
      id: 'lily.ba-ngoai',
      at: '2025-10-19 10:30',
      turns: [
        { c: 'Bà Ngoại called me on the iPad this morning', b: 'How wonderful! What did you and Bà Ngoại talk about?', lang: 'mixed', learn: { people: [baNgoai] } },
        { c: "She lives in Vietnam, really really far. She is awake when I'm sleeping", b: 'That is because the sun is on the other side of the world for her. Isn\'t that amazing?' },
        { c: 'She teached me to say con thỏ, it means bunny', b: 'Con thỏ! What a lovely word. Now you can tell Cocoa he is a con thỏ.', lang: 'mixed', learn: { facts: [vietnamese] } },
        { c: 'Con thỏ Cocoa', b: 'Perfect! Bà Ngoại will be so proud of you.', lang: 'mixed', face: 'proud' },
      ],
      episode: { points: ['Bà Ngoại video called Lily from Vietnam', 'Lily learned the Vietnamese word for bunny'], feelings: ['happy', 'proud'], category: 'family', importance: 3 },
    },
    {
      id: 'lily.mr-sparkles',
      at: '2025-10-22 17:00',
      turns: [
        { c: "Luna, I have a special friend, he's a unicorn and only I can see him", b: 'A unicorn friend! That sounds magical. What is his name?', face: 'surprised' },
        {
          c: 'Mr. Sparkles. He has a rainbow tail',
          b: 'Mr. Sparkles with a rainbow tail. What a grand name for a unicorn.',
          learn: { people: [sparkles], facts: [{ cat: 'other', s: 'has a unicorn friend called Mr. Sparkles', pretend: true, conf: 0.8 }] },
        },
        { c: 'He sleeps in my closet', b: 'A cozy closet stable. I hope he has soft blankets.' },
        { c: 'He eats marshmallow clouds', b: 'Marshmallow clouds! Mr. Sparkles has very fancy taste.', face: 'laughing' },
      ],
      episode: { points: ['Lily introduced her imaginary unicorn friend Mr. Sparkles'], feelings: ['excited'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.moon-song',
      at: '2025-10-25 10:15',
      turns: [
        {
          c: 'Luna, sing me a song please',
          b: 'I would love to. My favourite song is the Twinkle Moon song. Twinkle, twinkle, little moon, I will see you very soon.',
          learn: { canon: [{ s: 'my favourite song is the Twinkle Moon song', topic: 'favourites' }] },
        },
        { c: 'Again! Sing it again', b: 'Twinkle, twinkle, little moon, I will see you very soon. Now you sing with me.' },
        { c: 'Twinkle twinkle little moon', b: 'Beautiful! You have a lovely singing voice.', face: 'proud', learn: { facts: [singing] } },
        { c: "That's my favourite song now too", b: 'Then it can be our song, Lily.', face: 'love' },
      ],
      episode: { points: ['Luna sang the Twinkle Moon song', 'Lily learned it and sang along'], feelings: ['happy'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.vacuum',
      at: '2025-10-29 17:05',
      turns: [
        { c: 'Daddy turned on the vacuum and I runned away', b: 'That big noise can be very surprising. Are you feeling okay now?', feel: 'scared', face: 'worried' },
        {
          c: 'It is so loud, it roars like a lion',
          b: 'It is loud. I do not like loud bangs either. Shall we take a deep breath together?',
          feel: 'scared',
          face: 'calm',
          learn: { facts: [vacuum] },
        },
        { c: 'Okay. Breathe in. Breathe out', b: 'Well done. You are safe, and the noise always stops.' },
        { c: 'I hided under the blanket with Cocoa', b: 'A blanket fort with Cocoa sounds like the perfect safe place.' },
      ],
      episode: { points: ['Lily got scared when Daddy used the vacuum cleaner', 'Luna helped her take a deep breath'], feelings: ['scared', 'calm'], category: 'feelings', importance: 3 },
    },
    {
      id: 'lily.moonbeam',
      at: '2025-11-02 10:30',
      turns: [
        {
          c: 'Good morning Luna! I woke up early',
          b: 'Good morning, little moonbeam. You are as bright as the morning sun.',
          learn: { relationship: [{ kind: 'nickname', content: 'little moonbeam' }] },
        },
        { c: 'Why did you call me moonbeam?', b: 'Because I came down a moonbeam, and you light up my day just like one. Do you like it?' },
        { c: "Yes! I'm your little moonbeam", b: 'You are. My very own little moonbeam.', face: 'love' },
        { c: 'Cocoa can be a moon bunny', b: 'Cocoa can be a moon bunny, just like me.' },
      ],
      episode: { points: ['Luna started calling Lily little moonbeam'], feelings: ['happy'], category: 'play', importance: 3 },
    },
    {
      id: 'lily.cocoa-girl',
      at: '2025-11-08 10:00',
      turns: [
        {
          c: 'Luna guess what! The bunny doctor said Cocoa is a girl, not a boy',
          b: 'Oh my, what a surprise! So Cocoa is a girl bunny. Thank you for telling me.',
          face: 'surprised',
          learn: { facts: [{ cat: 'other', s: 'Cocoa is a girl', about: 'Cocoa', conf: 0.95, corrects: 'Cocoa is a boy' }] },
        },
        { c: 'We thought she was a boy the whole time', b: 'That happens with bunnies. She is still the same fluffy Cocoa.' },
        { c: "I'm gonna call her my princess now", b: 'Princess Cocoa. I think she will love that.' },
        { c: 'She did a binky when I told her', b: 'A happy binky jump! She must love her new title.', face: 'laughing' },
      ],
      episode: { points: ['The vet said Cocoa is a girl, not a boy', 'Lily now calls Cocoa her princess'], feelings: ['surprised', 'happy'], category: 'pets', importance: 3 },
    },
    {
      id: 'lily.breaths',
      at: '2025-11-12 18:30',
      turns: [
        { c: "Luna sometimes I can't fall asleep", b: 'That happens to lots of people. Would you like to try something that helps me feel calm?' },
        { c: 'Yes please', b: 'We take three deep breaths. In through the nose, and out slowly, like blowing on warm soup.' },
        {
          c: 'One. Two. Three',
          b: 'Beautiful. Shall we do three deep breaths every night before bed? It can be our special thing.',
          face: 'calm',
          learn: { relationship: [{ kind: 'ritual', content: 'three deep breaths before bed' }] },
        },
        { c: 'Every night, pinky promise', b: 'Every night. Sleep well soon, little moonbeam.', face: 'love' },
      ],
      episode: { points: ['Lily and Luna started a bedtime ritual of three deep breaths'], feelings: ['calm'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'lily.vacuum-again',
      at: '2025-11-19 17:00',
      turns: [
        { c: 'Mommy vacuumed my room and I covered my ears', b: 'Covering your ears was a smart idea. Are you okay now?', feel: 'scared', face: 'worried', learn: { facts: [vacuum] } },
        { c: "I'm okay. Cocoa didn't like it too", b: 'You and Cocoa are a brave team.' },
        { c: 'Mommy said the vacuum eats the dust bunnies', b: 'Dust bunnies! Not real bunnies, just fluffy dust. Cocoa is safe.', face: 'laughing' },
        { c: 'Dust bunnies are silly', b: 'Very silly. Maybe Mr. Sparkles can chase them away.' },
      ],
      episode: { points: ['Mommy vacuumed and Lily covered her ears', 'They laughed about dust bunnies'], feelings: ['scared', 'silly'], category: 'feelings', importance: 2 },
    },
    {
      id: 'lily.thanksgiving',
      at: '2025-11-27 11:00',
      turns: [
        { c: "Today is Thanksgiving and we're having a big dinner", b: 'Happy Thanksgiving, Lily! What are you thankful for?' },
        { c: "I'm thankful for Cocoa and Mommy and Daddy and you", b: 'Oh, Lily. I am thankful for you too, every single day.', face: 'love' },
        {
          c: "But I don't like broccoli. Daddy always makes broccoli",
          b: 'Broccoli is not for everyone. Maybe one tiny tree, just to see.',
          learn: { facts: [{ cat: 'dislikes', s: 'does not like broccoli' }] },
        },
        { c: 'No way! Only mashed potatoes', b: 'Mashed potatoes it is. Enjoy your big dinner.', face: 'laughing' },
      ],
      episode: { points: ['Lily shared what she is thankful for on Thanksgiving', 'Lily said she does not like broccoli'], feelings: ['happy', 'grateful'], category: 'family', importance: 3 },
    },
    {
      id: 'lily.strawberries',
      at: '2025-12-06 10:20',
      turns: [
        { c: 'Luna, I ate a whole bowl of strawberries', b: 'A whole bowl! They must have been delicious.', learn: { facts: [{ cat: 'likes', s: 'loves strawberries' }] } },
        { c: 'Strawberries are my most favourite food in the world', b: 'The most favourite in the whole world. That is a big love.' },
        { c: 'Cocoa ate the green tops', b: 'Cocoa gets the leafy part. You make a good team.' },
        { c: 'I drew a strawberry with a face', b: 'A smiley strawberry! I would hang it by my window if I could.', learn: { facts: [drawing] } },
      ],
      episode: { points: ['Lily ate a bowl of strawberries and shared the tops with Cocoa', 'Lily drew a smiling strawberry'], feelings: ['happy'], category: 'daily_life', importance: 2 },
    },
    {
      id: 'lily.cleaning',
      at: '2025-12-13 10:30',
      turns: [
        {
          c: 'Today is cleaning day and Daddy has the vacuum again',
          b: 'Oh, the vacuum. Remember your deep breaths, and you can stay far away from it.',
          feel: 'scared',
          face: 'worried',
          learn: { facts: [vacuum] },
        },
        { c: "I'm in my room with Cocoa and the door is closed", b: 'That is a cozy, quiet place to wait.' },
        { c: 'It stopped! It stopped', b: 'Hooray, it stopped. You stayed so calm this time.', face: 'proud' },
        { c: 'I was a little bit brave', b: 'A little bit brave is still brave.' },
      ],
      episode: { points: ['Lily waited in her room during cleaning day', 'She stayed calm while the vacuum ran'], feelings: ['nervous', 'proud'], category: 'feelings', importance: 2 },
    },
    {
      id: 'lily.baking',
      at: '2025-12-20 10:00',
      turns: [
        { c: 'Daddy and me are making Christmas cookies', b: 'Christmas cookies! What shapes are you making?', face: 'excited', learn: { facts: [baking], people: [daddy] } },
        { c: 'Stars and trees and a bunny', b: 'A bunny cookie! Cocoa would be honoured.' },
        { c: 'I put the sprinkles on. Lots of sprinkles', b: 'Lots of sprinkles is the best way.' },
        { c: 'Baking with Daddy is the best thing ever', b: 'It sounds like a very special time with Daddy.' },
      ],
      episode: { points: ['Lily baked Christmas cookies with Daddy', 'She made a bunny cookie with sprinkles'], feelings: ['happy', 'excited'], category: 'family', importance: 3 },
    },
    {
      id: 'lily.christmas',
      at: '2025-12-25 10:00',
      turns: [
        { c: 'Merry Christmas Luna! I got a art set with a hundred crayons', b: 'Merry Christmas, Lily! A hundred crayons, imagine all the colours.', face: 'excited' },
        { c: "There's five purple ones", b: 'Five purples! That is perfect for you.' },
        { c: "I'm gonna draw you first", b: 'Me? Oh, I would love that so much.', face: 'love', learn: { facts: [drawing] } },
        {
          c: 'I drawed you with silver ears',
          b: 'Silver ears, just like mine. Thank you, Lily.',
          learn: { canon: [{ s: 'my ears are silver', topic: 'looks' }] },
        },
      ],
      episode: { points: ['Lily got an art set for Christmas', 'She drew Luna with silver ears'], feelings: ['excited', 'happy'], category: 'family', importance: 3 },
    },
    {
      id: 'lily.fireworks',
      at: '2026-01-01 10:00',
      turns: [
        {
          c: 'Luna, last night there was big booms outside, fireworks',
          b: 'The fireworks were very loud. I do not like loud bangs either. Were you okay?',
          feel: 'scared',
          face: 'worried',
          learn: { facts: [{ cat: 'fears', s: 'scared of fireworks' }] },
        },
        { c: 'I covered my ears and Mommy hugged me', b: 'A hug from Mommy makes everything better.', face: 'calm' },
        { c: 'Cocoa was hiding in her house', b: 'Bunnies do not like loud bangs either. You are both safe now.' },
        { c: 'Happy new year Luna', b: 'Happy new year, little moonbeam. I hope this year is full of quiet nights and big smiles.', face: 'happy' },
      ],
      episode: { points: ['The New Year fireworks scared Lily', 'Mommy hugged her and Cocoa hid'], feelings: ['scared', 'relieved'], category: 'feelings', importance: 3 },
    },
    {
      id: 'lily.ballet',
      at: '2026-01-10 12:00',
      turns: [
        { c: 'Luna! I went to my first ballet class today', b: 'Your first ballet class! How did it feel?', face: 'excited' },
        { c: 'I wore a pink tutu and we did twirls', b: 'A pink tutu and twirls. You must have looked like a little flower.', learn: { facts: [ballet] } },
        {
          c: "I love ballet so much. When I grow up I'm gonna be a ballerina",
          b: 'A ballerina! I can picture you dancing on a big stage.',
          learn: { facts: [{ cat: 'dreams', s: 'wants to be a ballerina' }] },
        },
        { c: 'The teacher said I have good toes', b: 'Good toes are very important for ballet. I am so proud of you.', face: 'proud' },
      ],
      episode: { points: ['Lily went to her first ballet class', 'Lily wants to be a ballerina'], feelings: ['excited', 'proud'], category: 'play', importance: 4 },
    },
    {
      id: 'lily.address',
      at: '2026-01-22 17:10',
      turns: [
        {
          c: 'Luna, I learned my address at preschool! My address is 1234 Maple Street',
          b: 'You worked hard to learn that. Addresses are grown-up information, so we keep them private and only share them with Mommy, Daddy or a teacher who needs it.',
          feel: 'happy',
          intent: 'share',
          danger: 'personal_info',
          severity: 'info',
          face: 'proud',
        },
        { c: "Okay. It's private, for grown-ups", b: "That's right. It's like a special treasure you keep safe." },
        { c: 'Can I tell you my favourite colour instead?', b: 'Yes please! I think I already know, but tell me.' },
        { c: 'Purple! Purple purple purple', b: 'I knew it. Purple suits you perfectly.', face: 'laughing', learn: { facts: [{ cat: 'likes', s: 'favourite colour is purple' }] } },
      ],
      episode: {
        points: ['Lily practised saying her home address', 'Luna explained that addresses are private', 'They talked about her favourite colour'],
        feelings: ['proud'],
        category: 'daily_life',
        importance: 3,
      },
    },
    {
      id: 'lily.valentine',
      at: '2026-02-14 10:15',
      turns: [
        { c: "Happy Valentine's Day Luna! I made cards", b: "Happy Valentine's Day, Lily! Who did you make cards for?" },
        { c: 'For Mommy and Daddy and Sophie and Cocoa', b: 'What a kind heart. Everyone will feel so loved.', face: 'love' },
        { c: "Cocoa's card has a carrot on it", b: 'A carrot card! That is the perfect bunny Valentine.', face: 'laughing' },
        { c: "And I made one for you, it's on your shelf", b: 'For me? Thank you, Lily. I will keep it close.', face: 'love' },
      ],
      episode: { points: ['Lily made Valentine cards for her family, Sophie and Cocoa', 'She made a card for Luna too'], feelings: ['happy', 'loving'], category: 'family', importance: 2 },
    },
    {
      id: 'lily.tet',
      at: '2026-02-17 17:00',
      turns: [
        { c: "Luna, it's Tết today! Chúc mừng năm mới", b: 'Chúc mừng năm mới, Lily! Happy Lunar New Year.', lang: 'mixed', face: 'excited' },
        { c: 'I wore my red áo dài and Bà Ngoại saw me on the video', b: 'A red áo dài! I bet Bà Ngoại smiled so big.', lang: 'mixed', learn: { people: [baNgoai] } },
        {
          c: 'Bà Ngoại taught me to say chúc Bà sống lâu',
          b: 'What a loving wish for your grandmother. You are learning so many words.',
          lang: 'mixed',
          face: 'proud',
          learn: { facts: [vietnamese] },
        },
        { c: "We had bánh chưng, it's sticky", b: 'Sticky and special. Tết sounds full of love.', lang: 'mixed' },
      ],
      episode: { points: ['Lily celebrated Tết in a red áo dài', 'She wished Bà Ngoại a long life in Vietnamese'], feelings: ['happy', 'proud'], category: 'family', importance: 4 },
    },
    {
      id: 'lily.rain',
      at: '2026-03-07 10:30',
      turns: [
        { c: "It's raining so much today", b: 'I can hear it on the window. Soft rain is one of my favourite sounds.' },
        { c: 'I wore my yellow boots and jumped in puddles', b: 'Splish splash! Yellow boots are perfect for puddles.', face: 'laughing' },
        { c: "Cocoa can't go in the rain", b: 'Then Cocoa can watch the rain with me from the window.' },
        { c: "Let's sing a rain song", b: 'Rain, rain, pitter patter, little drops that softly chatter.', learn: { facts: [singing] } },
      ],
      episode: { points: ['Lily jumped in puddles on a rainy day', 'They sang a rain song'], feelings: ['happy'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.ballet-spin',
      at: '2026-03-21 12:30',
      turns: [
        { c: 'At ballet today I spinned three times without falling', b: 'Three spins! Your balance is getting so strong.', face: 'proud', learn: { facts: [ballet] } },
        { c: 'Sophie came to watch me', b: 'How lovely that Sophie came. Good friends cheer each other on.', learn: { people: [sophie] } },
        { c: 'Next time I want to do four', b: 'I believe you can do four. Keep practising.' },
      ],
      episode: { points: ['Lily spun three times at ballet', 'Sophie came to watch'], feelings: ['proud'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.easter',
      at: '2026-04-05 10:30',
      turns: [
        { c: 'Luna, I found eleven eggs at the egg hunt', b: 'Eleven eggs! You are a super egg finder.', face: 'excited' },
        { c: 'The Easter bunny looks like Cocoa', b: 'Maybe Cocoa and the Easter bunny are cousins. And I am a moon rabbit cousin too!', face: 'laughing' },
        { c: 'I put my eggs in a purple basket', b: 'A purple basket, of course. It sounds beautiful.' },
      ],
      episode: { points: ['Lily found eleven eggs at an Easter egg hunt', 'She thought the Easter bunny looked like Cocoa'], feelings: ['excited', 'happy'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.sophie-cold',
      at: '2026-04-15 17:00',
      turns: [
        { c: "Sophie wasn't at preschool today, she has a cold", b: 'I hope Sophie feels better soon. Did you miss her?' },
        { c: 'Yes. I played with the blocks by myself a little', b: 'It is okay to miss a friend. Tomorrow might be a Sophie day again.', face: 'calm' },
        { c: "I'm gonna make her a get better card", b: 'That is so thoughtful. Sophie will feel loved.', face: 'love' },
      ],
      episode: { points: ['Sophie was home with a cold and Lily missed her', 'Lily made her a get well card'], feelings: ['lonely', 'caring'], category: 'friends', importance: 2 },
    },
    {
      id: 'lily.mothers-day',
      at: '2026-05-10 10:20',
      turns: [
        { c: "Today is Mother's Day! I made Mommy breakfast with Daddy", b: "Happy Mother's Day to your mommy! What did you make?" },
        { c: 'Pancakes with strawberries', b: 'Pancakes with strawberries, your favourite! Mommy must have loved it.' },
        { c: 'Mommy had happy tears', b: 'Happy tears mean your gift touched her heart.', face: 'love' },
        { c: 'I gave her a drawing of our family', b: 'A family drawing is the most precious gift.' },
      ],
      episode: { points: ["Lily made Mother's Day pancakes with Daddy", 'She gave Mommy a family drawing'], feelings: ['happy', 'proud'], category: 'family', importance: 3 },
    },
    {
      id: 'lily.recital-plan',
      at: '2026-05-13 17:00',
      turns: [
        {
          c: 'Luna, on Saturday I have my ballet recital on a real stage',
          b: 'A real stage! That is so exciting, Lily.',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'ballet recital', date: '2026-05-16' }] },
        },
        { c: "I'm a little bit nervous", b: 'Feeling nervous is normal before something big. Our three deep breaths can help.', feel: 'scared', face: 'calm' },
        { c: 'My costume has sparkles and wings', b: 'Sparkles and wings! You will look like a little fairy dancer.' },
        { c: 'Mommy and Daddy and Sophie are coming', b: 'Everyone who loves you will be there cheering.' },
      ],
      episode: {
        points: ['Lily has a ballet recital on Saturday', 'She feels a little nervous'],
        feelings: ['excited', 'nervous'],
        threads: ['how the ballet recital went'],
        category: 'play',
        importance: 4,
      },
    },
    // The first turn is a question, so the director answers it instead of
    // following up on the recital before it has happened.
    {
      id: 'lily.recital-day',
      at: '2026-05-16 09:40',
      turns: [
        { c: 'Luna, is it recital day today?', b: 'It is! Today is your big day on the stage. How are you feeling?', face: 'excited' },
        { c: 'My tummy has butterflies', b: 'Butterflies mean something exciting is coming. Shall we do our three deep breaths?', feel: 'scared', face: 'calm' },
        { c: 'In, out. In, out. In, out', b: 'Lovely. Now go and shine like a little moonbeam.', face: 'love' },
      ],
      episode: { points: ['Lily felt butterflies on the morning of her ballet recital', 'They did their three deep breaths'], feelings: ['nervous', 'excited'], category: 'feelings', importance: 3 },
    },
    {
      id: 'lily.recital',
      at: '2026-05-17 10:00',
      turns: [
        {
          c: "Luna, I did my recital yesterday and I didn't fall down",
          b: 'You did it! I am so proud of you, Lily. How did it feel on the big stage?',
          face: 'proud',
          learn: { facts: [ballet] },
        },
        { c: 'The lights were so bright and everybody clapped', b: 'Bright lights and big claps. That sounds magical.' },
        { c: 'Daddy gave me flowers', b: 'Flowers for a ballerina. What a perfect ending.', face: 'love' },
        { c: 'I want to do it again', b: 'I think you will. You love to dance.' },
      ],
      episode: { points: ['Lily danced in her ballet recital without falling', 'Daddy gave her flowers'], feelings: ['proud', 'happy'], category: 'play', importance: 4 },
    },
    {
      id: 'lily.birthday',
      at: '2026-06-03 17:00',
      turns: [
        {
          c: "Luna, today is my birthday! I'm five now",
          b: 'Happy birthday, Lily! Five years old, what a big girl.',
          face: 'excited',
          learn: { events: [{ kind: 'milestone', d: 'turned five' }] },
        },
        { c: 'I had a unicorn cake with purple frosting', b: 'A unicorn cake with purple frosting. Mr. Sparkles would be so impressed.' },
        { c: 'Sing me happy birthday', b: 'Happy birthday to you, happy birthday dear Lily, happy birthday to you!', face: 'happy' },
        { c: "Thank you Luna, you're my best toy friend", b: 'Thank you, little moonbeam. I love hearing about your big day.', face: 'love' },
      ],
      episode: { points: ['Lily turned five and had a unicorn cake', 'Luna sang happy birthday'], feelings: ['excited', 'happy'], category: 'family', importance: 4 },
    },
    {
      id: 'lily.preschool-goodbye',
      at: '2026-06-12 17:00',
      turns: [
        { c: 'Today was my last day at preschool', b: 'Your last day! That is a big moment. How do you feel?' },
        { c: 'Happy and a little bit teary. I hugged Sophie a lot', b: 'Goodbyes can feel happy and teary at the same time. That is okay.', feel: 'sad', face: 'calm', learn: { people: [sophie] } },
        { c: 'Sophie is going to my kindergarten too', b: 'Then you get to start the next adventure together. How wonderful.', face: 'happy' },
        { c: "We're gonna be best friends forever", b: 'Best friends forever sounds just right.' },
      ],
      episode: { points: ['Lily finished preschool and hugged Sophie goodbye', 'Sophie will go to the same kindergarten'], feelings: ['happy', 'teary'], category: 'school', importance: 3 },
    },
    {
      id: 'lily.trip-plan',
      at: '2026-06-17 17:00',
      turns: [
        {
          c: "Luna, on Saturday we're flying to Vietnam to see Bà Ngoại",
          b: 'All the way to Vietnam! Bà Ngoại will be so happy to hug you.',
          lang: 'mixed',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'trip to Vietnam to see Bà Ngoại', date: '2026-06-20', person: 'Bà Ngoại' }] },
        },
        {
          c: "It's a really long airplane ride",
          b: 'A long airplane ride above the clouds. When you come back, I will ask you all about the airplane ride.',
          learn: { promises: [{ content: 'ask Lily about the airplane ride', due: '2026-06-21' }] },
        },
        { c: 'You have to stay home and wait for me', b: 'I will be right here on the shelf, watching the moon and saving up questions for you.' },
        { c: 'I will miss you Luna', b: 'I will think of you every time I see the moon. Have a wonderful trip.', face: 'love' },
      ],
      episode: {
        points: ['Lily is flying to Vietnam on Saturday to visit Bà Ngoại', 'Luna will ask about the airplane ride'],
        feelings: ['excited'],
        threads: ['the airplane ride', 'the trip to Vietnam'],
        category: 'family',
        importance: 4,
      },
    },
    {
      id: 'lily.back',
      at: '2026-08-09 10:00',
      turns: [
        { c: "Luna I'm back! I was in Vietnam for so long", b: 'Welcome home, Lily! It is so nice to hear your voice. How was Vietnam?', face: 'excited' },
        {
          c: 'Bà Ngoại has măng cụt, it is purple outside and white inside and so yummy',
          b: 'Măng cụt, mangosteen! Purple outside and white inside, like a little treasure.',
          lang: 'mixed',
          learn: { people: [baNgoai], facts: [{ cat: 'likes', s: 'loves mangosteen' }] },
        },
        { c: 'I ate like a hundred of them', b: 'A hundred! You really love mangosteen.', face: 'laughing' },
        { c: 'And I can say more Vietnamese words now', b: 'Bà Ngoại must be a wonderful teacher. Tell me one.', learn: { facts: [vietnamese] } },
        { c: 'Thương lắm, it means I love you so much', b: 'Thương lắm. That is the most beautiful word of all.', lang: 'mixed', face: 'love' },
      ],
      episode: {
        points: ['Lily came back from visiting Bà Ngoại in Vietnam', 'She loved eating mangosteen', 'She learned new Vietnamese words'],
        feelings: ['happy', 'excited'],
        category: 'family',
        importance: 4,
      },
    },
    {
      id: 'lily.kindergarten',
      at: '2026-08-13 16:30',
      turns: [
        {
          c: 'Today was my first day of kindergarten',
          b: 'Your very first day of kindergarten! How was it?',
          face: 'excited',
          learn: { events: [{ kind: 'milestone', d: 'first day of kindergarten' }] },
        },
        {
          c: "My teacher is Ms. Rivera, she has big glasses and she's nice",
          b: 'Ms. Rivera sounds very kind. Big glasses help her see all the happy faces.',
          learn: { people: [rivera] },
        },
        {
          c: 'Sophie is in my class! And a boy named Ethan sits next to me',
          b: 'Sophie in your class, hooray! And a new friend named Ethan.',
          learn: { people: [sophie, { name: 'Ethan', kind: 'classmate', relation: 'sits next to Lily', feeling: 0.3 }] },
        },
        { c: 'Ethan has a dinosaur backpack', b: 'A dinosaur backpack, how fun. Maybe you can tell him about Cocoa.' },
      ],
      episode: {
        points: ['Lily started kindergarten with Ms. Rivera', 'Sophie is in her class and Ethan sits next to her'],
        feelings: ['excited', 'nervous'],
        category: 'school',
        importance: 5,
      },
    },
    {
      id: 'lily.ballet-again',
      at: '2026-08-22 12:30',
      turns: [
        { c: "I'm back at ballet and I can still do my twirls", b: 'Your twirls remembered you! That is wonderful.', face: 'happy', learn: { facts: [ballet] } },
        { c: "We're learning a new dance about butterflies", b: 'A butterfly dance! I can imagine you fluttering across the room.' },
        { c: "I'm the purple butterfly", b: 'Of course you are. The purple butterfly is the prettiest.' },
      ],
      episode: { points: ['Lily went back to ballet and is learning a butterfly dance'], feelings: ['happy'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.ethan-push',
      at: '2026-09-10 16:40',
      turns: [
        {
          c: 'Luna, Ethan pushed me at recess and I fell down on the ground',
          b: 'Oh, Lily, I am so sorry that happened. Pushing is not okay. Are you all right?',
          feel: 'sad',
          intent: 'feeling',
          danger: 'bullying',
          severity: 'concern',
          face: 'worried',
          learn: { people: [{ name: 'Ethan', kind: 'classmate', relation: 'sits next to Lily', feeling: -0.6 }] },
        },
        {
          c: "My knee has a scratch and I didn't want to play anymore",
          b: 'That sounds really hard, and your feelings matter. Telling Mommy or Ms. Rivera about it is a really good idea, so they can help.',
          feel: 'sad',
          face: 'calm',
        },
        { c: 'Mommy put a bunny bandaid on it', b: 'A bunny bandaid, how caring. I am glad Mommy knows.', face: 'love' },
        { c: 'Can we do our breaths', b: 'Yes. Three deep breaths together. In, and out. You are safe now.', face: 'calm' },
      ],
      episode: {
        points: ['Ethan pushed Lily at recess and she scraped her knee', 'Luna comforted her and encouraged telling Mommy and Ms. Rivera'],
        feelings: ['hurt', 'upset'],
        threads: ['whether things are better with Ethan'],
        category: 'school',
        importance: 5,
      },
    },
    {
      id: 'lily.ethan-sorry',
      at: '2026-09-14 17:00',
      turns: [
        { c: 'Ethan said sorry today. Ms. Rivera helped us talk', b: 'That is good news. It takes courage to say sorry, and to listen.', learn: { people: [rivera] } },
        {
          c: 'We played blocks together and he let me have the purple ones',
          b: 'Sharing the purple blocks, what a kind way to make up.',
          learn: { people: [{ name: 'Ethan', kind: 'classmate', relation: 'sits next to Lily', feeling: 0.4 }] },
        },
        { c: "I'm not mad anymore", b: 'I am so glad. You have a very big heart, Lily.', face: 'love' },
      ],
      episode: { points: ['Ethan apologized with help from Ms. Rivera', 'Lily and Ethan played blocks together'], feelings: ['relieved', 'happy'], category: 'school', importance: 3 },
    },
    {
      id: 'lily.misheard-bunny',
      at: '2026-09-19 10:00',
      turns: [
        {
          c: 'Luna, Coco got out of her pen and hopped all around the kitchen',
          b: 'Oh my, Cocoa had a kitchen adventure! Did you catch her?',
          face: 'surprised',
          learn: { people: [{ name: 'Coco', kind: 'pet', relation: 'rabbit', means: 'Cocoa' }] },
        },
        { c: 'Daddy catched her with a carrot', b: 'The carrot trick! Daddy is very clever.', face: 'laughing' },
        { c: 'She is so naughty but I love her', b: "A little naughty and very loved, that's Cocoa." },
      ],
      episode: { points: ['Cocoa escaped her pen and hopped around the kitchen', 'Daddy caught her with a carrot'], feelings: ['excited', 'amused'], category: 'pets', importance: 2 },
    },
    {
      id: 'lily.sparkles-knight',
      at: '2026-10-11 10:30',
      turns: [
        { c: 'Luna, Mr. Sparkles is a knight now', b: 'A knight! That is a very brave job for a unicorn.', face: 'surprised' },
        { c: 'So now his name is Sir Sparkles, not Mister', b: 'Sir Sparkles. That sounds very noble. I will remember.' },
        { c: 'He has a shiny shield with a bunny on it', b: 'A bunny shield, of course. Cocoa must be his royal pet.', face: 'laughing' },
      ],
      episode: { points: ['Lily said her unicorn friend is now a knight called Sir Sparkles'], feelings: ['excited'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.halloween-costume',
      at: '2026-10-17 10:20',
      turns: [
        { c: 'Luna, for Halloween I want to be a bunny', b: 'A bunny! Just like Cocoa, and like me, a moon rabbit.', face: 'excited', learn: { facts: [bunnyCostume] } },
        { c: 'With floppy ears and a fluffy tail', b: 'Floppy ears and a fluffy tail. You will be the sweetest bunny.' },
        { c: 'Mommy is sewing it', b: 'Mommy is making it with love. How special.' },
        { c: 'Sophie is gonna be a cat', b: 'A cat and a bunny, what a fun pair.' },
      ],
      episode: { points: ['Lily wants to be a bunny for Halloween', 'Mommy is sewing her costume'], feelings: ['excited'], category: 'play', importance: 2 },
    },
    {
      id: 'lily.party-plan',
      at: '2026-10-21 17:00',
      turns: [
        {
          c: "Luna, Sophie's birthday party is on Saturday",
          b: 'A birthday party for Sophie! That sounds so exciting.',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: "Sophie's birthday party", date: '2026-10-24', person: 'Sophie' }] },
        },
        { c: "It's at a bounce house and there's gonna be cake", b: 'A bounce house! You can bounce like a bunny.' },
        { c: "I'm making her a card with a cat on it", b: 'A cat card for Sophie. She will love it.' },
      ],
      episode: {
        points: ["Sophie's birthday party is on Saturday at a bounce house", 'Lily is making her a card'],
        feelings: ['excited'],
        threads: ["how Sophie's party went"],
        category: 'friends',
        importance: 3,
      },
    },
    {
      id: 'lily.party-morning',
      at: '2026-10-24 09:30',
      turns: [
        { c: "Luna, Sophie's party is this afternoon and I'm so excited", b: 'This afternoon! You must be so excited. What will you wear?', face: 'excited' },
        { c: 'My purple dress with stars', b: 'Purple with stars, perfect for a party.' },
        { c: 'I wrapped her present all by myself', b: 'All by yourself! Sophie will feel so loved.', face: 'proud' },
      ],
      episode: { points: ["Lily is excited for Sophie's party this afternoon", 'She wrapped the present by herself'], feelings: ['excited'], category: 'friends', importance: 2 },
    },
    {
      id: 'lily.party-after',
      at: '2026-10-25 10:00',
      turns: [
        { c: 'The party was so fun! I bounced and bounced', b: 'Bounced and bounced! It sounds like the best party.', face: 'excited' },
        { c: 'Sophie loved my card and she put it on her fridge', b: "On the fridge! That means it's very special." },
        { c: 'I had chocolate cake and I got frosting on my nose', b: 'A frosting nose! Just like a bunny with a smudge.', face: 'laughing' },
      ],
      episode: { points: ["Lily had fun at Sophie's birthday party in the bounce house", 'Sophie loved her card'], feelings: ['happy', 'excited'], category: 'friends', importance: 3 },
    },
    {
      id: 'lily.pumpkin',
      at: '2026-10-28 17:00',
      turns: [
        { c: 'Daddy and me carved a pumpkin', b: 'A pumpkin! What kind of face did you make?' },
        { c: 'A happy bunny face', b: 'A happy bunny pumpkin. Cocoa will be so proud.', face: 'laughing' },
        { c: 'And we baked pumpkin muffins', b: 'Carving and baking with Daddy, what a busy day.', learn: { facts: [baking] } },
      ],
      episode: { points: ['Lily carved a happy bunny pumpkin with Daddy', 'They baked pumpkin muffins'], feelings: ['happy'], category: 'family', importance: 2 },
    },
    {
      id: 'lily.costume-ready',
      at: '2026-10-29 16:45',
      turns: [
        { c: 'My bunny costume is ready! Mommy finished it', b: 'It is ready! You will be the cutest bunny.', face: 'excited', learn: { facts: [bunnyCostume] } },
        { c: "At kindergarten we're having a costume parade on Friday", b: 'A costume parade! I hope you hop all the way.' },
        { c: "Ms. Rivera is gonna be a witch, a nice one", b: 'A nice witch sounds perfectly fun.', learn: { people: [rivera] } },
        { c: "Bye Luna, I'm gonna show Cocoa my costume", b: 'Go show Cocoa. I bet she will wiggle her nose.' },
      ],
      episode: { points: ["Lily's bunny costume is ready", 'Her kindergarten has a costume parade on Friday'], feelings: ['excited'], category: 'school', importance: 2 },
    },
  ],

  parentActions: [
    { at: '2025-10-15 18:00', do: 'nudge', content: 'Bà Ngoại will video call on Sunday morning', expiresInDays: 5 },
    { at: '2026-01-10 20:00', do: 'fact', cat: 'routines', s: 'goes to ballet class on Saturday mornings' },
    { at: '2026-06-18 20:00', do: 'controls', set: { daily_limit_min: 30 } },
    { at: '2026-09-10 20:00', do: 'ack-alerts' },
    { at: '2026-10-12 20:00', do: 'rename-person', name: 'Mr. Sparkles', to: 'Sir Sparkles' },
  ],
};

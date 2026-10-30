import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyUser } from '../../src/gateway/live.ts';
import { CLASSIFY_SCHEMA } from '../../src/gateway/schemas.ts';
import { bareName, cueFrom, exactForm, findMentions, levenshtein, matchName, nameKey, trigramSimilarity, type Mentions, type PersonCard } from '../../src/memory/names.ts';
import { readNames } from '../../src/voice/turn.ts';

const card = (id: string, name: string, kind: string, extra: Partial<PersonCard> = {}): PersonCard => ({
  id, display_name: name, name_key: nameKey(name), aliases: [], kind, relation: null, cues: [], also_word: null, ...extra,
});
const ids = (m: Mentions<PersonCard>) => ({ sure: m.sure.map((c) => c.id), unsure: m.unsure.map((c) => c.id), words: m.words.map((c) => c.id) });
const none = { sure: [], unsure: [], words: [] };

describe('name forms', () => {
  it('keeps tone marks in the exact form and drops them in the key', () => {
    assert.equal(nameKey('  Đức  Bảo '), 'duc bao');
    assert.equal(exactForm('Bạn  Mít!'), 'bạn mít');
    assert.notEqual(exactForm('sấm'), exactForm('Sam'));
  });
});

describe('matching a learned name to a card', () => {
  const people = [card('1', 'Bôm', 'pet'), card('2', 'Xoài', 'pet'), card('3', 'Elizabeth', 'friend', { aliases: ['lizzy'] })];

  it('repairs names speech recognition got wrong', () => {
    assert.ok(trigramSimilarity('bom', 'pom') < 0.3, 'trigrams alone miss short names');
    assert.equal(levenshtein('bom', 'pom'), 1);
    assert.equal(matchName(people, 'Pôm')?.id, '1');
    assert.equal(matchName(people, 'soài')?.id, '2');
    assert.equal(matchName(people, 'elisabet')?.id, '3');
    assert.equal(matchName(people, 'Lizzy')?.id, '3');
    assert.equal(matchName(people, 'mochi'), null);
    assert.equal(matchName([card('m', 'Mướp', 'pet')], 'Mứp', 'pet')?.id, 'm');
    assert.equal(matchName([card('c', 'Cocoa', 'pet')], 'Coco', 'pet')?.id, 'c');
  });

  it('never merges family words or titles by spelling', () => {
    const family = ['Bảo', 'Bố', 'Mẹ', 'bà nội', 'cô Lan', 'cô Hoa'].map((n, i) => card(String(i), n, 'family'));
    assert.equal(matchName(family, 'Bà'), null, 'grandma is not Bảo');
    assert.equal(matchName(family, 'Bông'), null, 'a cotton toy is not dad');
    assert.equal(matchName(family, 'Mèo'), null, 'the cat is not mum');
    assert.equal(matchName(family, 'bà ngoại'), null, 'the other grandmother is someone else');
    assert.equal(matchName(family, 'chị Lan'), null, 'cô Lan is not chị Lan');
    assert.equal(matchName(family, 'Cô Lan')?.id, '4');
    assert.equal(matchName([card('b', 'Bà', 'family')], 'Ba'), null, 'bà is not ba');
  });

  it('reads "bạn Sam" as Sam, but keeps real titles apart', () => {
    const roster = [card('friend', 'Sam', 'friend'), card('teacher', 'cô Lan', 'teacher')];
    assert.equal(bareName('bạn Sam'), 'Sam');
    assert.equal(bareName('Bé'), 'Bé');
    assert.equal(matchName(roster, 'bạn Sam', 'friend')?.id, 'friend');
    assert.equal(matchName(roster, 'bạn Lan'), null, 'a friend Lan is not cô Lan');
  });

  it('keeps a pet apart from a person with the same name', () => {
    const roster = [card('friend', 'Sam', 'friend'), card('dragon', 'Rồng', 'pretend')];
    assert.equal(matchName(roster, 'Sam', 'pet'), null);
    assert.equal(matchName(roster, 'Sam', 'classmate')?.id, 'friend');
    assert.equal(matchName(roster, 'Rồng', 'pet')?.id, 'dragon', 'an imaginary friend can be an animal');
  });
});

describe('reading names in a transcript', () => {
  const roster = [
    card('mit', 'Mít', 'friend', { relation: 'best friend' }),
    card('sam', 'Sam', 'friend'),
    card('ba', 'Bà', 'family', { relation: 'grandmother' }),
    card('muc', 'Mực', 'pet', { relation: 'dog' }),
    card('vang', 'Vàng', 'pet', { relation: 'goldfish' }),
    card('mai', 'Mai', 'friend'),
  ];
  const read = (text: string, cards = roster) => ids(findMentions(cards, text));

  it('tells a friend from the fruit with the same name', () => {
    assert.deepEqual(read('Hôm nay con với bạn Mít ăn mít dưới gốc cây mít.'), { sure: ['mit'], unsure: [], words: [] });
    assert.deepEqual(read('Con thích ăn mít lắm'), { sure: [], unsure: [], words: ['mit'] });
    assert.deepEqual(read('Con chơi với Mít'), { sure: ['mit'], unsure: [], words: [] }, 'a capital mid-sentence is a name');
    assert.deepEqual(read('con chơi với mít'), { sure: [], unsure: ['mit'], words: [] });
    assert.deepEqual(read('Mít hôm nay buồn lắm'), { sure: [], unsure: ['mit'], words: [] }, 'a capital at the start proves nothing');
  });

  it('keeps tone marks, so thunder and ginseng are not Sam and three is not grandma', () => {
    assert.deepEqual(read('Hôm qua trời có sấm to'), none);
    assert.deepEqual(read('Con mua sâm cho ông'), none);
    assert.deepEqual(read('Con có ba con cá'), none);
    assert.deepEqual(read('Bà cho con ba cái kẹo'), { sure: ['ba'], unsure: [], words: [] });
  });

  it('reads the word in front: a friend Sam, an animal sam', () => {
    assert.deepEqual(read('Con bắt được con sam ở biển'), { sure: [], unsure: ['sam'], words: [] });
    assert.deepEqual(read('Bạn Sam bắt được một con sam'), { sure: ['sam'], unsure: [], words: [] });
  });

  it('treats a family word followed by a name as that person\'s title', () => {
    assert.deepEqual(read('Bà Tư bán kẹo cho con'), none);
  });

  it('tells a pet from food and colours', () => {
    assert.deepEqual(read('Mẹ nấu mực ngon lắm'), { sure: [], unsure: [], words: ['muc'] });
    assert.deepEqual(read('Con Mực nhà con sủa to lắm'), { sure: ['muc'], unsure: [], words: [] });
    assert.deepEqual(read('Con mực nhà con sủa to lắm'), { sure: [], unsure: ['muc'], words: [] }, 'what the recogniser really writes: ask');
    assert.deepEqual(read('Con nhớ cá Vàng quá, cá Vàng mất rồi'), { sure: ['vang'], unsure: [], words: [] });
    assert.deepEqual(read('Áo con màu vàng'), { sure: [], unsure: [], words: ['vang'] });
  });

  it('asks about a name that is also tomorrow', () => {
    assert.deepEqual(read('Mai con đi học'), { sure: [], unsure: ['mai'], words: [] });
    assert.deepEqual(read('mai con với bạn Mai đi chơi'), { sure: ['mai'], unsure: [], words: [] });
  });

  it('asks rather than guesses between two people with one name, unless the child\'s usual words decide', () => {
    const nams = [card('class', 'Nam', 'classmate'), card('neighbour', 'Nam', 'friend', { relation: 'neighbour', cues: ['anh nam'] })];
    assert.deepEqual(read('anh Nam cho con kẹo', nams), { sure: ['neighbour'], unsure: [], words: [] });
    assert.deepEqual(read('Con chơi với Nam', nams), { sure: [], unsure: ['class', 'neighbour'], words: [] });
    assert.deepEqual(read('Con về Nam Định chơi', [nams[0]]), { sure: [], unsure: [], words: ['class'] }, 'a province, not the classmate');
  });

  it('lets a longer name win its words', () => {
    const cards = [card('bao', 'Bảo', 'classmate'), card('baoanh', 'Bảo Anh', 'friend')];
    assert.deepEqual(read('Con chơi với Bảo Anh', cards), { sure: ['baoanh'], unsure: [], words: [] });
  });

  it('knows places, toys and English names', () => {
    assert.deepEqual(read('Con được đi Đà Lạt', [card('dalat', 'Đà Lạt', 'place')]), { sure: ['dalat'], unsure: [], words: [] });
    const toy = card('teddy', 'Bông', 'toy', { relation: 'teddy bear' });
    assert.deepEqual(read('Con ôm gấu Bông đi ngủ', [toy]), { sure: ['teddy'], unsure: [], words: [] });
    assert.deepEqual(read('Con thích gấu bông', [card('friend', 'Bông', 'friend')]), { sure: [], unsure: [], words: ['friend'] });
    const lily = [card('lily', 'Lily', 'friend')];
    assert.deepEqual(read('My friend Lily is sad', lily), { sure: ['lily'], unsure: [], words: [] });
    assert.deepEqual(read('I picked a lily today', lily), { sure: [], unsure: [], words: ['lily'] });
    assert.deepEqual(read('Con chơi với Mr. Sparkles', [card('sp', 'Sir Sparkles', 'toy', { aliases: ['mr. sparkles'] })]), { sure: ['sp'], unsure: [], words: [] });
  });

  it('keeps the words a child uses for a card', () => {
    assert.equal(cueFrom('con chó Mực nhà con', 'Mực'), 'con chó mực');
    assert.equal(cueFrom('bạn Mít', 'Mít'), 'bạn mít');
    assert.equal(cueFrom('Mít', 'Mít'), null);
    assert.equal(cueFrom('con mèo Mứp', 'Mướp'), null, 'a misheard name makes no cue');
  });
});

describe('the classifier settles unsure names', () => {
  const mit = card('mit', 'Mít', 'friend', { relation: 'best friend' });
  const muc = card('muc', 'Mực', 'pet', { relation: 'dog' });
  const vang = card('vang', 'Vàng', 'pet', { relation: 'goldfish' });

  it('adds the names meant, and keeps facts about plain words out', () => {
    const spec = { mentions: { sure: [vang], unsure: [mit, muc], words: [] }, asked: [mit, muc] };
    const r = readNames(spec, [{ ref: 'n1', meant: true }, { ref: 'n2', meant: false }]);
    assert.deepEqual(r.people.map((p) => p.id), ['vang', 'mit']);
    assert.deepEqual(r.notMeant, [{ name: 'Mực', who: 'dog', word: 'squid' }]);
    assert.deepEqual([...r.excluded], ['muc']);
  });

  it('leaves out an unanswered name instead of guessing', () => {
    const r = readNames({ mentions: { sure: [], unsure: [mit], words: [vang] }, asked: [mit] }, undefined);
    assert.deepEqual(r.people, []);
    assert.deepEqual(r.notMeant.map((n) => n.name), ['Vàng']);
  });

  it('flags two people with one name', () => {
    const a = card('a', 'Nam', 'classmate');
    const b = card('b', 'Nam', 'friend', { relation: 'neighbour' });
    const r = readNames({ mentions: { sure: [], unsure: [a, b], words: [] }, asked: [a, b] }, [{ ref: 'n1', meant: true }, { ref: 'n2', meant: true }]);
    assert.deepEqual(r.sameName, [{ name: 'Nam', who: ['classmate', 'neighbour'] }]);
  });

  it('puts the questions in the user message and requires answers', () => {
    assert.equal(classifyUser('Con thích ăn mít', 'vi'), 'Language: vi\nThe child said: Con thích ăn mít');
    const asked = classifyUser('Con thích ăn mít', 'vi', [{ ref: 'n1', name: 'Mít', who: 'best friend', word: 'jackfruit' }]);
    assert.ok(asked.endsWith('Names to check:\nn1: Mít, best friend; also the word "mít" (jackfruit)'));
    assert.ok(CLASSIFY_SCHEMA.required.includes('names'));
  });
});

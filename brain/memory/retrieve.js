// Per-turn memory fan-out. Every leg writes into `state` the moment it
// lands, and the turn takes whatever has landed when MEMORY_WAIT_MS runs
// out (or the turn is aborted): a slow embeddings call costs the semantic
// blocks, never the ones that did not need it.
//
// Legs without the embedding: current summary, recent summaries, facts by
// recency. Legs behind it: semantic summaries, verbatim exchanges (when
// MEMORY_RETRIEVAL allows) and fact ranking. On voice turns the name
// corrector runs beside all of that; a corrected search with hits wins.

import * as exchangesStore from '../store/exchanges.js';
import * as factsStore from '../store/facts.js';
import * as summariesStore from '../store/summaries.js';
import { fixNames } from './extract.js';
import { trustedNames } from './names.js';

// A conversation group never grows past this many exchanges: prompt budget.
const MAX_CONVO_ROWS = 8;
// Deliberately loose, same reasoning as MEMORY_CONTEXT_MIN_SCORE: below it a
// fact competes on recency instead.
const FACT_MIN_SCORE = 0.15;

function normalize(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Semantic hits over-fetched past top-k (duplicates would otherwise fill
// every slot), one slot per distinct memory, then each anchor drags its
// conversation along, because a hit is often only the opening of a story.
export async function searchVerbatim(pool, { subject, vec, exclude, memory }) {
  const limit = Math.min(memory.topK * 5 + exclude.length, 40);
  const rows = await exchangesStore.search(pool, subject, vec, limit);
  const scored = rows.filter((row) => Number(row.score) >= memory.minScore);
  const seen = new Set(exclude.map(normalize));
  const kept = [];
  for (const row of scored) {
    const key = normalize(row.user_text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
    if (kept.length >= memory.topK) break;
  }
  if (!kept.length) return { groups: [], kept: 0, convIds: [] };

  // Newest first: when memories contradict, position is the strongest
  // signal a model follows.
  kept.sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
  if (!memory.context) {
    return { groups: kept.map((row) => [row]), kept: kept.length, convIds: [...new Set(kept.map((r) => r.conversation_id))] };
  }

  const anchorKeys = new Set(kept.map((row) => normalize(row.user_text)));
  const convIds = [...new Set(kept.map((row) => row.conversation_id))];
  const fetched = new Map(
    await Promise.all(
      convIds.map(async (id) => [id, await exchangesStore.conversation(pool, subject, id, vec, MAX_CONVO_ROWS * 2)]),
    ),
  );
  const done = new Set();
  const groups = [];
  for (const anchor of kept) {
    if (done.has(anchor.conversation_id)) continue;
    done.add(anchor.conversation_id);
    const group = [];
    for (const row of fetched.get(anchor.conversation_id) || []) {
      const key = normalize(row.user_text);
      const isAnchor = anchorKeys.has(key);
      if (seen.has(key) && !isAnchor) continue;
      // Anchors already cleared the real bar; tag-alongs only the loose one.
      if (!isAnchor && Number(row.score) < memory.contextMinScore) continue;
      anchorKeys.delete(key);
      seen.add(key);
      group.push(row);
      if (group.length >= MAX_CONVO_ROWS) break;
    }
    // The cap or the floor must never evict the match itself.
    if (!group.some((row) => normalize(row.user_text) === normalize(anchor.user_text))) group.push(anchor);
    groups.push(group);
  }
  groups.sort((x, y) => new Date(y[y.length - 1].created_at) - new Date(x[x.length - 1].created_at));
  return { groups, kept: kept.length, convIds: [...done] };
}

async function searchSummaries(pool, { subject, vec, conversationId, memory }) {
  if (memory.summaryTop <= 0) return [];
  const rows = await summariesStore.search(pool, subject, vec, conversationId, memory.summaryTop);
  return rows.filter((row) => Number(row.score) >= memory.summaryMinScore);
}

function waitFor(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function retrieve(deps, { subject, conversationId, text, isVoice, names, exclude, lang, signal }) {
  const { pool, embed, helper, config, log } = deps;
  const memory = config.memory;
  const verbatimOn = memory.retrieval !== 'summary';
  const summaryRetrieval = memory.summary && memory.retrieval !== 'verbatim';
  const started = Date.now();

  const state = {
    settled: false,
    spoken: text,
    fixes: [],
    verbatim: { groups: [], kept: 0, convIds: [] },
    bestKept: -1,
    facts: [],
    factsRanked: false,
    current: null,
    recent: [],
    past: [],
    pastFromFix: false,
    landed: [],
  };
  // A leg that lands after the turn moved on must not change what it saw.
  const set = (leg, fn) => {
    if (state.settled) return;
    fn();
    state.landed.push(leg);
  };
  const failed = (leg) => (err) => {
    // An aborted turn fails every in-flight call on purpose.
    if (signal?.aborted) return;
    log.warn('memory_leg_failed', { leg, err_name: err?.name, err_status: err?.status });
  };
  // A corrected search wins any tie: equal hit counts on the wrong name are
  // still the wrong child.
  const adopt = (res, preferred) => {
    if (preferred ? res.kept === 0 : res.kept <= state.bestKept) return;
    state.bestKept = preferred ? Infinity : res.kept;
    state.verbatim = res;
  };

  const legs = [];
  if (memory.summary) {
    legs.push(summariesStore.get(pool, subject, conversationId).then((row) => set('current', () => (state.current = row)), failed('current')));
    if (memory.recent > 0) {
      legs.push(
        summariesStore.recent(pool, subject, conversationId, memory.recent).then((rows) => set('recent', () => (state.recent = rows)), failed('recent')),
      );
    }
  }
  if (memory.profile) {
    legs.push(
      factsStore.recent(pool, subject, memory.profileTop).then(
        (rows) => set('facts_recent', () => {
          if (!state.factsRanked) state.facts = rows;
        }),
        failed('facts_recent'),
      ),
    );
  }

  const semantic = (vec, preferred) => {
    const sub = [];
    if (summaryRetrieval) {
      sub.push(
        searchSummaries(pool, { subject, vec, conversationId, memory }).then(
          (rows) => set(preferred ? 'summaries_fixed' : 'summaries', () => {
            if (preferred) {
              if (!rows.length) return;
              state.past = rows;
              state.pastFromFix = true;
            } else if (!state.pastFromFix) {
              state.past = rows;
            }
          }),
          failed('summaries'),
        ),
      );
    }
    if (verbatimOn) {
      sub.push(
        searchVerbatim(pool, { subject, vec, exclude, memory }).then(
          (res) => set(preferred ? 'verbatim_fixed' : 'verbatim', () => adopt(res, preferred)),
          failed('verbatim'),
        ),
      );
    }
    if (memory.profile && !preferred) {
      sub.push(
        factsStore.ranked(pool, subject, vec, memory.profileTop, FACT_MIN_SCORE).then(
          (rows) => set('facts_ranked', () => {
            state.facts = rows;
            state.factsRanked = true;
          }),
          failed('facts_ranked'),
        ),
      );
    }
    return Promise.all(sub);
  };

  legs.push(embed(text, signal).then((vec) => semantic(vec, false), failed('embed')));

  if (isVoice && memory.nameFix) {
    const known = trustedNames(names, memory.nameTrust).slice(0, 200).map((row) => row.display);
    if (known.length) {
      legs.push(
        fixNames(helper, {
          model: memory.namesModel,
          lang,
          text,
          known,
          serviceTier: config.llm.serviceTier,
          signal,
        })
          .then(async ({ text: fixedText, fixed }) => {
            if (fixedText === text) return;
            set('name_fix', () => {
              state.spoken = fixedText;
              state.fixes = fixed;
            });
            if (verbatimOn || summaryRetrieval) await semantic(await embed(fixedText, signal), true);
          })
          .catch(failed('name_fix')),
      );
    }
  }

  const all = Promise.allSettled(legs);
  const complete = await Promise.race([all.then(() => true), waitFor(memory.waitMs, signal).then(() => false)]);
  state.settled = true;

  return {
    spoken: state.spoken,
    fixes: state.fixes,
    groups: state.verbatim.groups,
    convIds: state.verbatim.convIds,
    facts: state.facts,
    current: state.current,
    recent: state.recent,
    past: state.past,
    complete,
    landed: state.landed,
    ms: Date.now() - started,
  };
}

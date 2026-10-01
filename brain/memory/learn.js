// Post-turn writes. Serialized per subject by a promise chain: two quick
// turns from one child would otherwise both read summary next_id and a
// name's contexts before either wrote them back. Different subjects still
// learn in parallel.
//
// The prototype's gates, in order: the no-info reply filter, the 0.97
// near-duplicate check (within this subject), then names + summary in one
// extractor call and the profile ops in another. A failed step costs a
// lesson, never a turn: the reply is already on its way.

import en from '../persona/text/en.js';
import vi from '../persona/text/vi.js';
import { withTransaction } from '../store/db.js';
import * as exchangesStore from '../store/exchanges.js';
import * as factsStore from '../store/facts.js';
import * as namesStore from '../store/names.js';
import * as subjectsStore from '../store/subjects.js';
import * as summariesStore from '../store/summaries.js';
import { renderSummary } from './blocks.js';
import { applySummaryOps, extractExchange, extractProfile } from './extract.js';
import { mergeContexts } from './names.js';

// A long answer that merely contains "không biết X" still carries content;
// only short, pure admissions are skipped. Both languages are checked,
// because the reply language follows the child, not the setting.
export function isNoInfoReply(text) {
  const reply = String(text || '').trim();
  return reply.length <= 120 && (vi.noInfoRe.test(reply) || en.noInfoRe.test(reply));
}

export function createLearner(deps) {
  const { pool, embed, helper, config, log } = deps;
  const memory = config.memory;
  const chains = new Map();

  // Runs `task` after everything already queued for this subject. The
  // returned promise rejects with the task's own error; the chain itself
  // never breaks.
  function enqueue(subject, task) {
    const prev = chains.get(subject) || Promise.resolve();
    const run = prev.then(task);
    const tail = run.catch(() => {});
    chains.set(subject, tail);
    tail.then(() => {
      if (chains.get(subject) === tail) chains.delete(subject);
    });
    return run;
  }

  async function learnNamesAndSummary({ subject, conversationId, spokenText, assistantText, lang }) {
    if (!memory.names && !memory.summary) return;
    const row = memory.summary ? await summariesStore.get(pool, subject, conversationId) : null;
    const points = Array.isArray(row?.points) ? row.points : [];
    const { names, summary } = await extractExchange(helper, {
      model: memory.namesModel,
      lang,
      userText: spokenText,
      assistantText,
      currentPoints: points,
      config,
    });

    if (names.dropped) log.info('memory_names_dropped', { subject, count: names.dropped });
    if (names.names.length) {
      const at = new Date().toISOString();
      for (const name of names.names) {
        const key = name.display.toLowerCase();
        const existing = await namesStore.contextsOf(pool, subject, key);
        const contexts = memory.nameContext
          ? mergeContexts(existing, { note: name.note, conversationId, at, max: memory.nameContexts })
          : existing;
        await namesStore.upsert(pool, subject, { ...name, key, contexts });
      }
      log.info('memory_names_learned', { subject, count: names.names.length });
    }

    if (summary) {
      const { points: next, nextId } = applySummaryOps(points, row?.next_id || 1, summary.ops);
      const categoryChanged = summary.category && summary.category !== row?.category;
      if (summary.overflow) log.info('memory_summary_full', { subject, dropped: summary.overflow });
      // An op-less turn (the common case) must not buy an embeddings call.
      if (summary.ops.length || categoryChanged) {
        const text = renderSummary({ points: next });
        // No points left: null keeps it out of retrieval instead of leaving
        // a stale vector pointing at empty text.
        const vec = text ? await embed(text) : null;
        await summariesStore.save(pool, subject, {
          conversationId,
          points: next,
          nextId,
          category: summary.category,
          embedding: vec,
        });
        log.info('memory_summary_updated', { subject, ops: summary.ops.length, points: next.length });
      }
    }
  }

  async function embedFact(subject, id, fact) {
    try {
      await factsStore.setEmbedding(pool, subject, id, await embed(fact));
    } catch (err) {
      // The fact is already usable by recency; only its ranking waits.
      log.warn('memory_fact_embed_failed', { subject, err_name: err?.name });
    }
  }

  async function learnProfile({ subject, spokenText, assistantText, lang }) {
    if (!memory.profile) return;
    const rows = await factsStore.all(pool, subject);
    const ops = await extractProfile(helper, {
      model: memory.profileModel,
      lang,
      userText: spokenText,
      assistantText,
      currentRows: rows,
    });
    let applied = 0;
    for (const op of ops) {
      // One op tripping the unique index must not lose the rest.
      try {
        if (op.op === 'add') {
          const id = await factsStore.add(pool, subject, op.category, op.fact);
          await embedFact(subject, id, op.fact);
        } else if (op.op === 'bump') {
          await factsStore.bump(pool, subject, op.id);
        } else if (op.op === 'update') {
          await factsStore.update(pool, subject, op.id, op.fact);
          await embedFact(subject, op.id, op.fact);
        } else if (op.op === 'drop') {
          await factsStore.drop(pool, subject, op.id);
        }
        applied += 1;
      } catch (err) {
        log.warn('memory_fact_op_failed', { subject, op: op.op, err_code: err?.code });
      }
    }
    if (applied) log.info('memory_profile_updated', { subject, ops: applied });
  }

  // userText is the raw transcript (stored verbatim: a memory is quoted back
  // to the child and a correction must never become something they said);
  // spokenText is the name-corrected one, which the extractors reason about.
  async function learnExchange(args) {
    const { subject, conversationId, userText, assistantText } = args;
    if (isNoInfoReply(assistantText)) {
      log.info('memory_skipped', { subject, reason: 'no_info' });
      return { stored: false, reason: 'no_info' };
    }
    const vec = await embed(`${userText}\n${assistantText}`);
    const nearest = await exchangesStore.nearestScore(pool, subject, vec);
    if (nearest !== null && nearest >= memory.dedupeScore) {
      log.info('memory_skipped', { subject, reason: 'duplicate' });
      return { stored: false, reason: 'duplicate' };
    }
    await exchangesStore.insert(pool, { subject, conversationId, userText, assistantText, embedding: vec });
    const spoken = { ...args, spokenText: args.spokenText || userText };
    const results = await Promise.allSettled([learnNamesAndSummary(spoken), learnProfile(spoken)]);
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        log.warn('memory_learn_failed', { subject, step: i === 0 ? 'names_summary' : 'profile', err_name: result.reason?.name });
      }
    }
    return { stored: true };
  }

  return {
    learn(args) {
      return enqueue(args.subject, () => learnExchange(args)).catch((err) => {
        log.warn('memory_learn_failed', { subject: args.subject, step: 'store', err_name: err?.name });
        return { stored: false, reason: 'error' };
      });
    },
    // Queued behind any learning in flight, so a lesson from before the
    // wipe cannot land after it.
    wipe(subject) {
      return enqueue(subject, () => withTransaction(pool, (client) => subjectsStore.wipe(client, subject)));
    },
    async drain() {
      while (chains.size) await Promise.all([...chains.values()]);
    },
  };
}

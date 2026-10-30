import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { weekRange } from '../lib/stats.js';

// Everything the dashboard shows, loaded together and refreshed after each
// action so every screen agrees (the balance on Overview and on Credits is
// the same number).
//
// me        { parent, family: { id, name }, web_toy, payments, speak_first }
// wallet    { balance, ledger }
// devices   toys, each with child_id (see lib/buddy.js toyView)
// children  every child of the family
// buddies   { [childId]: Buddy | null }, the child's Buddy (null until set up)
// alerts    { [childId]: number }, safety alerts not yet acknowledged
// usage     { [childId]: [{ day, turns, talk_minutes }] }, the last seven days
//           (lib/stats.js weekRange), for the week chart
// turns     recent answered turns, never the words
// packs     credit packs; voices and characters change rarely
//
// refreshAfterTurn(result) is for the Talk screen's turn_done; reload is for
// everything else.
const DataContext = createContext(null);

const EMPTY = {
  loading: true, error: null, me: null, wallet: null, devices: [], children: [], buddies: {}, alerts: {}, usage: {},
  turns: [], packs: [], voices: [], characters: [],
};

// A whole family load costs 5 calls plus 3 per child of backend-v2's 60 a
// minute per parent (the credit packs count against the public budget), too
// much for every turn of a chatty child. An answered turn refreshes just the
// balance and the activity list (the week chart waits for the next family
// load), and the refresh trails: turn_done arrives before the voice service
// has written the turn and its debit, and turn after turn costs at most one
// refresh every LIGHT_EVERY_MS.
const LIGHT_EVERY_MS = 10_000;
const LIGHT_SETTLE_MS = 1_500;

// Reference data shared by every reload of this page.
let referenceOnce = null;
function reference() {
  referenceOnce ??= Promise.all([api.voices(), api.characters()])
    .then(([v, c]) => ({ voices: v.data ?? [], characters: c.data ?? [] }))
    .catch((err) => {
      referenceOnce = null;
      throw err;
    });
  return referenceOnce;
}

async function openAlerts(childId) {
  const out = await api.alerts(childId, { limit: 100 });
  return (out.data ?? []).filter((a) => !a.acknowledged_at).length;
}

export function FamilyDataProvider({ children: content }) {
  const [state, setState] = useState(EMPTY);
  const light = useRef({ timer: null, last: 0 });

  const reload = useCallback(async () => {
    try {
      const [me, wallet, devices, turns, kids, packs, ref] = await Promise.all([
        api.me(), api.wallet(), api.devices(), api.turns(), api.children(), api.packs(), reference(),
      ]);
      const list = kids.data ?? [];
      const week = weekRange();
      const [buddyList, alertList, usageList] = await Promise.all([
        Promise.all(list.map((c) => api.buddy(c.id))),
        Promise.all(list.map((c) => openAlerts(c.id).catch(() => 0))),
        // null keeps what the chart showed: a failed call is not a quiet week.
        Promise.all(list.map((c) => api.usage(c.id, week).then((out) => out.data ?? []).catch(() => null))),
      ]);
      setState((s) => ({
        loading: false, error: null, me, wallet,
        devices: devices.data ?? [], children: list, turns: turns.data ?? [], packs: packs.packs ?? [],
        buddies: Object.fromEntries(list.map((c, i) => [c.id, buddyList[i]])),
        alerts: Object.fromEntries(list.map((c, i) => [c.id, alertList[i]])),
        usage: Object.fromEntries(list.map((c, i) => [c.id, usageList[i] ?? s.usage[c.id] ?? []])),
        voices: ref.voices, characters: ref.characters,
      }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, []);

  // Every answer moves the timer, so the refresh always comes after the last
  // one; turns are seconds apart, so it never waits for long.
  const refreshAfterTurn = useCallback((result) => {
    if (result !== 'answered') return;
    const l = light.current;
    clearTimeout(l.timer);
    l.timer = setTimeout(async () => {
      l.timer = null;
      l.last = Date.now();
      try {
        const [wallet, turns] = await Promise.all([api.wallet(), api.turns()]);
        setState((s) => ({ ...s, wallet, turns: turns.data ?? [] }));
      } catch {
        // The next family load catches up.
      }
    }, Math.max(LIGHT_SETTLE_MS, l.last + LIGHT_EVERY_MS - Date.now()));
  }, []);

  useEffect(() => {
    const l = light.current;
    return () => clearTimeout(l.timer);
  }, []);

  useEffect(() => {
    reload();
    // A parent often leaves the dashboard open while the child plays; a
    // gentle refresh keeps "last seen", alerts and the balance honest.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  const value = useMemo(() => ({ ...state, reload, refreshAfterTurn }), [state, reload, refreshAfterTurn]);
  return <DataContext.Provider value={value}>{content}</DataContext.Provider>;
}

export const useFamilyData = () => useContext(DataContext);

// Opening a toy, adding a toy or buying a pack happens from several screens;
// AppShell owns the layers and exposes these openers.
export const LayerContext = createContext({ openToy() {}, openAdd() {}, openPay() {} });
export const useLayers = () => useContext(LayerContext);

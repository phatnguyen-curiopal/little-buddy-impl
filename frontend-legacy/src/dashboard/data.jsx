import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

// Everything the dashboard shows, loaded together and refreshed after each
// action so every screen agrees (the balance on Overview and on Credits is
// the same number).
const DataContext = createContext(null);

export function FamilyDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, me: null, wallet: null, devices: [], turns: [], children: [], packs: [] });

  const reload = useCallback(async () => {
    try {
      const [me, wallet, devices, turns, kids, packs] = await Promise.all([
        api.me(), api.wallet(), api.devices(), api.turns(), api.children(), api.packs(),
      ]);
      setState({ loading: false, error: null, me, wallet, devices: devices.devices, turns: turns.turns, children: kids.children, packs: packs.packs });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, []);

  useEffect(() => {
    reload();
    // A parent often leaves the dashboard open while the child plays; a
    // gentle refresh keeps "last seen" and the balance honest.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useFamilyData = () => useContext(DataContext);

// Opening a toy, adding a toy or buying a pack happens from several screens;
// AppShell owns the layers and exposes these openers.
export const LayerContext = createContext({ openToy() {}, openAdd() {}, openPay() {} });
export const useLayers = () => useContext(LayerContext);

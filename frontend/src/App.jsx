import { useState } from 'react';
import TopBar from './components/TopBar.jsx';
import LogPanel from './components/LogPanel.jsx';
import ParentLane from './components/ParentLane.jsx';
import ToyLane from './components/ToyLane.jsx';
import AdminLane from './components/AdminLane.jsx';
import { useToy } from './useToy.js';
import * as session from './session.js';

const TABS = [
  ['parent', 'Parent'],
  ['toy', 'Toy'],
  ['admin', 'Admin'],
];

export default function App() {
  const [tab, setTab] = useState('parent');
  // The toy hook lives here, not in ToyLane, so the simulated toy keeps
  // heartbeating and streaming while the tester pauses it from another tab.
  const toy = useToy();

  const simulate = (deviceId) => {
    session.set({ toy: { ...session.get().toy, deviceId } });
    setTab('toy');
  };

  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <main className="main">
          <nav className="tabs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={`tab ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
                {label}
                {id === 'toy' && toy.state.phase !== 'idle' && <span className={`dot dot-${toy.state.status ?? 'none'}`} />}
              </button>
            ))}
          </nav>
          <div hidden={tab !== 'parent'}><ParentLane onSimulate={simulate} /></div>
          <div hidden={tab !== 'toy'}><ToyLane toy={toy} /></div>
          <div hidden={tab !== 'admin'}><AdminLane onSimulate={simulate} /></div>
        </main>
        <LogPanel />
      </div>
    </div>
  );
}

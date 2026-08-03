import { useCallback, useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import Controls from './components/Controls';
import StatsPanel from './components/StatsPanel';
import EventLog from './components/EventLog';
import { connectEventSocket, fetchNodes, fetchRouterInfo } from './api';
import { SIMULATED_REGIONS } from './regions';
import { SIMULATED_REGIONS, ORIGIN_LOCATION } from './regions';

const NODE_POLL_MS = 3000;

function regionByKey(key) {
  return SIMULATED_REGIONS.find((r) => r.key === key) || SIMULATED_REGIONS[0];
}

let eventIdCounter = 0;

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [regionKey, setRegionKey] = useState(SIMULATED_REGIONS[0].key);
  const [packets, setPackets] = useState([]);
  const [events, setEvents] = useState([]);
  const [routerInfo, setRouterInfo] = useState(null);
  const nodesRef = useRef([]);
  const routerInfoRef = useRef(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    routerInfoRef.current = routerInfo;
  }, [routerInfo]);

  useEffect(() => {
    fetchRouterInfo()
      .then(setRouterInfo)
      .catch(() => {
        /* router-info endpoint unreachable — map just won't show a router marker */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const list = await fetchNodes();
        if (!cancelled) setNodes(list);
      } catch {
        // router unreachable — leave last known node list in place
      }
    }
    poll();
    const id = setInterval(poll, NODE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const addPacketAndLog = useCallback((clientLoc, chosenNodeName, cacheStatus, latencyMs, file) => {
    const node = nodesRef.current.find((n) => n.name === chosenNodeName);
    const router = routerInfoRef.current;
    if (node && clientLoc && router) {
      setPackets((prev) => [
        ...prev.slice(-40),
        {
          id: `${Date.now()}-${Math.random()}`,
          from: clientLoc,
          router: { lat: router.lat, lon: router.lon },
          to: { lat: node.lat, lon: node.lon },
          origin: { lat: ORIGIN_LOCATION.lat, lon: ORIGIN_LOCATION.lon },   // ← new line
          cacheStatus,
          startedAt: performance.now(),
        },
      ]);
    }
    setEvents((prev) => [
      {
        id: eventIdCounter++,
        time: new Date().toLocaleTimeString(),
        file,
        chosenNode: chosenNodeName,
        cacheStatus,
        latencyMs,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  useEffect(() => {
    const close = connectEventSocket((event) => {
      if (event.type === 'connection') {
        setConnected(event.status === 'open');
        return;
      }
      if (event.type === 'route') {
        const clientLoc = SIMULATED_REGIONS.find((r) => r.key === event.clientRegionGuess);
        addPacketAndLog(clientLoc, event.chosenNode, event.cacheStatus, event.latencyMs, event.file);
      }
      if (event.type === 'node-status') {
        setNodes((prev) =>
          prev.map((n) => (n.name === event.node ? { ...n, healthy: event.status === 'up' } : n))
        );
      }
    });
    return close;
  }, [addPacketAndLog]);

  function handleControlsResult(regionKeyUsed, result) {
    // The websocket broadcast already animates this request for every
    // connected dashboard; nothing else to do here besides letting errors
    // surface via Controls' own error state.
  }

  const clientLocation = regionByKey(regionKey);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">mini-cdn</span>
          <span className="brand-sub">routing console</span>
        </div>
        <div className="header-right">
          {routerInfo && <div className="router-badge mono">router: {routerInfo.region}</div>}
          <div className={`conn-indicator ${connected ? 'is-live' : 'is-down'}`}>
            <span className="dot" />
            {connected ? 'live' : 'reconnecting…'}
          </div>
        </div>
      </header>

      <main className="app-grid">
        <MapView nodes={nodes} clientLocation={clientLocation} packets={packets} routerInfo={routerInfo} />

        <aside className="sidebar">
          <Controls
            nodes={nodes}
            onResult={handleControlsResult}
            busy={busy}
            setBusy={setBusy}
            regionKey={regionKey}
            setRegionKey={setRegionKey}
          />
          <StatsPanel nodes={nodes} />
          <EventLog events={events} />
        </aside>
      </main>
    </div>
  );
}

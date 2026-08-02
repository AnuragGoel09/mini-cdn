const ROUTER_URL = import.meta.env.VITE_ROUTER_URL || 'http://localhost:8082';
const ROUTER_WS_URL = import.meta.env.VITE_ROUTER_WS_URL || ROUTER_URL.replace(/^http/, 'ws') + '/ws/events';

export const ROUTER_HTTP_URL = ROUTER_URL;

export async function fetchRouterInfo() {
  const res = await fetch(`${ROUTER_URL}/router-info`);
  if (!res.ok) throw new Error(`GET /router-info failed: ${res.status}`);
  return res.json();
}

export async function fetchNodes() {
  const res = await fetch(`${ROUTER_URL}/nodes`);
  if (!res.ok) throw new Error(`GET /nodes failed: ${res.status}`);
  return res.json();
}

export async function fetchFiles(originUrl) {
  const res = await fetch(`${originUrl}/files`);
  if (!res.ok) throw new Error(`GET /files failed: ${res.status}`);
  return res.json();
}

export async function requestFile(file, { overrideRegion, lat, lon } = {}) {
  const params = new URLSearchParams();
  if (overrideRegion) params.set('overrideRegion', overrideRegion);
  if (lat != null) params.set('lat', lat);
  if (lon != null) params.set('lon', lon);

  const start = performance.now();
  const res = await fetch(`${ROUTER_URL}/route/${encodeURIComponent(file)}?${params.toString()}`);
  const clientTripMs = Math.round(performance.now() - start);

  if (!res.ok) {
    throw new Error(`GET /route/${file} failed: ${res.status}`);
  }

  return {
    file,
    cacheStatus: res.headers.get('X-Cache') || 'UNKNOWN',
    cacheNode: res.headers.get('X-Cache-Node') || 'unknown',
    routerLatencyMs: Number(res.headers.get('X-Router-Latency-Ms') || 0),
    clientTripMs,
    body: await res.text(),
  };
}

export async function invalidateFile(file) {
  const res = await fetch(`${ROUTER_URL}/admin/invalidate/${encodeURIComponent(file)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`invalidate failed: ${res.status}`);
  return res.json();
}

export async function setNodeDown(name) {
  const res = await fetch(`${ROUTER_URL}/admin/nodes/${encodeURIComponent(name)}/down`, { method: 'POST' });
  if (!res.ok) throw new Error(`mark down failed: ${res.status}`);
  return res.json();
}

export async function setNodeUp(name) {
  const res = await fetch(`${ROUTER_URL}/admin/nodes/${encodeURIComponent(name)}/up`, { method: 'POST' });
  if (!res.ok) throw new Error(`mark up failed: ${res.status}`);
  return res.json();
}

export async function fetchEdgeStats(edgeUrl) {
  const res = await fetch(`${edgeUrl}/stats`);
  if (!res.ok) throw new Error(`GET /stats failed: ${res.status}`);
  return res.json();
}

export function connectEventSocket(onEvent) {
  let socket;
  let closedByUser = false;
  let retryDelay = 1000;

  function open() {
    socket = new WebSocket(ROUTER_WS_URL);

    socket.onopen = () => {
      retryDelay = 1000;
      onEvent({ type: 'connection', status: 'open' });
    };

    socket.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        onEvent(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      onEvent({ type: 'connection', status: 'closed' });
      if (!closedByUser) {
        setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  open();

  return () => {
    closedByUser = true;
    socket && socket.close();
  };
}

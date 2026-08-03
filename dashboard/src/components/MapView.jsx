import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const ORIGIN = { name: 'origin', label: 'Origin (source of truth)', lat: 38.9517, lon: -77.4481 };
const PACKET_DURATION_MS = 1400;

function colorForCache(status) {
  if (status === 'HIT') return 'var(--accent-green)';
  if (status === 'MISS') return 'var(--accent-amber)';
  return 'var(--accent-cyan)';
}

// If the router happens to be co-located with an edge (common — the
// control plane is often deployed alongside one region), nudge its
// *displayed* position slightly so the two markers don't visually stack.
// This only affects rendering; the real coordinates used for any
// distance/geography logic (all server-side) are untouched.
function displayCoordsFor(routerInfo, nodes) {
  const collidesWithEdge = nodes.some(
    (n) => Math.abs(n.lat - routerInfo.lat) < 0.01 && Math.abs(n.lon - routerInfo.lon) < 0.01
  );
  if (!collidesWithEdge) return [routerInfo.lat, routerInfo.lon];
  return [routerInfo.lat + 3, routerInfo.lon + 3];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The real request path is a three-stage flow for the cache-miss case:
 * client → router (route selection / proxy decision),
 * router → edge (the selected edge actually serves the file),
 * edge → origin (only when the edge needs to fill its cache).
 *
 * For a HIT, the origin leg is omitted because the content is served from
 * the edge cache and never needs to pull from the origin.
 */
function AnimatedPacket({ packet, now }) {
  const elapsed = now - packet.startedAt;
  const t = Math.min(1, elapsed / PACKET_DURATION_MS);

  const routeBoundary = 0.34;
  const edgeBoundary = 0.68;
  const isMiss = packet.cacheStatus === 'MISS';

  let lat, lon, legColor;

  if (t < routeBoundary) {
    const legT = t / routeBoundary;
    const eased = 1 - Math.pow(1 - legT, 2);
    lat = lerp(packet.from.lat, packet.router.lat, eased);
    lon = lerp(packet.from.lon, packet.router.lon, eased);
    legColor = 'var(--accent-cyan)';
  } else if (t < edgeBoundary) {
    const legT = (t - routeBoundary) / (edgeBoundary - routeBoundary);
    const eased = 1 - Math.pow(1 - legT, 2);
    lat = lerp(packet.router.lat, packet.to.lat, eased);
    lon = lerp(packet.router.lon, packet.to.lon, eased);
    legColor = colorForCache(packet.cacheStatus);
  } else if (isMiss) {
    const legT = (t - edgeBoundary) / (1 - edgeBoundary);
    const eased = 1 - Math.pow(1 - legT, 2);
    lat = lerp(packet.to.lat, packet.origin.lat, eased);
    lon = lerp(packet.to.lon, packet.origin.lon, eased);
    legColor = 'var(--accent-amber)';
  } else {
    // HIT responses end at the edge; the last hop never needs to reach origin.
    const legT = (t - edgeBoundary) / (1 - edgeBoundary);
    const eased = 1 - Math.pow(1 - legT, 2);
    lat = lerp(packet.to.lat, packet.to.lat, eased);
    lon = lerp(packet.to.lon, packet.to.lon, eased);
    legColor = colorForCache(packet.cacheStatus);
  }

  const opacity = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
  const cacheColor = colorForCache(packet.cacheStatus);

  return (
    <>
      <Polyline
        positions={[
          [packet.from.lat, packet.from.lon],
          [packet.router.lat, packet.router.lon],
        ]}
        pathOptions={{ color: 'var(--accent-cyan)', weight: 1, opacity: opacity * 0.3, dashArray: '2 6' }}
      />
      <Polyline
        positions={[
          [packet.router.lat, packet.router.lon],
          [packet.to.lat, packet.to.lon],
        ]}
        pathOptions={{ color: cacheColor, weight: 1, opacity: opacity * 0.3, dashArray: '2 6' }}
      />
      {isMiss && (
        <Polyline
          positions={[
            [packet.to.lat, packet.to.lon],
            [packet.origin.lat, packet.origin.lon],
          ]}
          pathOptions={{ color: 'var(--accent-amber)', weight: 1, opacity: opacity * 0.3, dashArray: '2 6' }}
        />
      )}
      <CircleMarker
        center={[lat, lon]}
        radius={5}
        pathOptions={{ color: legColor, fillColor: legColor, fillOpacity: opacity, opacity, weight: 2 }}
      />
    </>
  );
}

export default function MapView({ nodes, clientLocation, packets, routerInfo }) {
  const [now, setNow] = useState(() => performance.now());
  const rafRef = useRef();

  useEffect(() => {
    function tick(t) {
      setNow(t);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const liveePackets = packets.filter((p) => now - p.startedAt < PACKET_DURATION_MS);

  return (
    <div className="map-panel">
      <MapContainer
        center={[20, 20]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        style={{ height: '100%', width: '100%', background: 'var(--bg)' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        <CircleMarker center={[ORIGIN.lat, ORIGIN.lon]} radius={7} pathOptions={{ color: 'var(--text-muted)', fillColor: 'var(--panel-raised)', fillOpacity: 1, weight: 2 }}>
          <Tooltip direction="top" offset={[0, -6]} permanent={false}>
            {ORIGIN.label}
          </Tooltip>
        </CircleMarker>

        {routerInfo && (
          <CircleMarker
            center={[routerInfo.lat, routerInfo.lon]}
            radius={9}
            pathOptions={{ color: 'var(--accent-cyan)', fillColor: 'var(--bg)', fillOpacity: 0.9, weight: 3, dashArray: '3 3' }}
          >
            <Tooltip direction="top" offset={[0, -9]} permanent={false}>
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                router ({routerInfo.region})
                <br />
                every request is decided + proxied from here
              </div>
            </Tooltip>
          </CircleMarker>
        )}

        {nodes.map((node) => {
          const color = node.manuallyDown || !node.healthy ? 'var(--accent-rose)' : 'var(--accent-green)';
          return (
            <CircleMarker
              key={node.name}
              center={[node.lat, node.lon]}
              radius={8}
              pathOptions={{ color, fillColor: color, fillOpacity: node.eligible ? 0.85 : 0.25, weight: 2 }}
            >
              <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                <div style={{ fontFamily: 'var(--font-mono)' }}>
                  {node.name} · {node.region}
                  <br />
                  {node.manuallyDown ? 'manually down' : node.healthy ? 'healthy' : 'unreachable'}
                  {node.latencyMs != null ? ` · ${node.latencyMs}ms` : ''}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {clientLocation && (
          <CircleMarker
            center={[clientLocation.lat, clientLocation.lon]}
            radius={6}
            pathOptions={{ color: 'var(--accent-cyan)', fillColor: 'var(--accent-cyan)', fillOpacity: 0.9, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -6]} permanent={false}>
              simulated client: {clientLocation.label}
            </Tooltip>
          </CircleMarker>
        )}

        {liveePackets.map((p) => (
          <AnimatedPacket key={p.id} packet={p} now={now} />
        ))}
      </MapContainer>
    </div>
  );
}

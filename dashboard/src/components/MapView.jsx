import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ORIGIN_LOCATION } from '../regions';

const ORIGIN = { name: 'origin', ...ORIGIN_LOCATION };

const MS_PER_HOP = 480;

function colorForCache(status) {
  if (status === 'HIT') return 'var(--accent-green)';
  if (status === 'MISS') return 'var(--accent-amber)';
  return 'var(--accent-cyan)';
}

// displayCoordsFor stays here, unchanged

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function flatDistance(a, b) {
  return Math.hypot(a.lat - b.lat, a.lon - b.lon);
}

function buildPath(packet) {
  const points = [packet.from, packet.router, packet.to];
  const colors = ['var(--accent-cyan)', 'var(--accent-cyan)'];

  if (packet.cacheStatus === 'MISS' && packet.origin) {
    points.push(packet.origin, packet.to);
    colors.push(colorForCache('MISS'), colorForCache('MISS'));
  }

  points.push(packet.router, packet.from);
  colors.push(colorForCache(packet.cacheStatus), colorForCache(packet.cacheStatus));

  return { points, colors };
}

function AnimatedPacket({ packet, now }) {
  const { points, colors } = buildPath(packet);

  const segmentDistances = points.slice(1).map((p, i) => Math.max(flatDistance(points[i], p), 0.5));
  const totalDistance = segmentDistances.reduce((a, b) => a + b, 0);
  const totalDuration = colors.length * MS_PER_HOP;
  const segmentDurations = segmentDistances.map((d) => (d / totalDistance) * totalDuration);

  const elapsed = now - packet.startedAt;
  const t = Math.min(1, elapsed / totalDuration);
  const elapsedMs = t * totalDuration;

  let cursor = 0;
  let segIndex = 0;
  for (let i = 0; i < segmentDurations.length; i++) {
    if (elapsedMs <= cursor + segmentDurations[i] || i === segmentDurations.length - 1) {
      segIndex = i;
      break;
    }
    cursor += segmentDurations[i];
  }

  const segT = Math.min(1, (elapsedMs - cursor) / segmentDurations[segIndex]);
  const eased = 1 - Math.pow(1 - segT, 2);
  const from = points[segIndex];
  const to = points[segIndex + 1];
  const lat = lerp(from.lat, to.lat, eased);
  const lon = lerp(from.lon, to.lon, eased);
  const dotColor = colors[segIndex];

  const opacity = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1;

  return (
    <>
      {points.slice(1).map((p, i) => (
        <Polyline
          key={i}
          positions={[
            [points[i].lat, points[i].lon],
            [p.lat, p.lon],
          ]}
          pathOptions={{ color: colors[i], weight: 1, opacity: opacity * 0.3, dashArray: '2 6' }}
        />
      ))}
      <CircleMarker
        center={[lat, lon]}
        radius={5}
        pathOptions={{ color: dotColor, fillColor: dotColor, fillOpacity: opacity, opacity, weight: 2 }}
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

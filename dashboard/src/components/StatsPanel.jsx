import { useEffect, useState } from 'react';
import { fetchEdgeStats } from '../api';

const POLL_MS = 4000;

export default function StatsPanel({ nodes }) {
  const [stats, setStats] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const results = await Promise.all(
        nodes.map(async (node) => {
          try {
            const s = await fetchEdgeStats(node.url);
            return [node.name, s];
          } catch {
            return [node.name, null];
          }
        })
      );
      if (!cancelled) {
        setStats(Object.fromEntries(results));
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodes]);

  return (
    <div className="panel stats-panel">
      <h2 className="panel-title">hit rate by region</h2>
      <div className="stats-list">
        {nodes.map((node) => {
          const s = stats[node.name];
          const hitRate = s ? Math.round(s.hitRate * 100) : null;
          return (
            <div className="stats-row" key={node.name}>
              <div className="stats-row-header">
                <span>{node.name}</span>
                <span className="mono">{hitRate != null ? `${hitRate}%` : '—'}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${hitRate ?? 0}%` }} />
              </div>
              <div className="stats-row-footer mono">
                {s ? `${s.hits} hits · ${s.misses} misses · cache=${s.cacheSize}` : 'unreachable'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

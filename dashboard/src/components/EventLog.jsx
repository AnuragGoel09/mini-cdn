function statusColorClass(status) {
  if (status === 'HIT') return 'tag-hit';
  if (status === 'MISS') return 'tag-miss';
  return 'tag-neutral';
}

export default function EventLog({ events }) {
  return (
    <div className="panel event-log">
      <h2 className="panel-title">recent requests</h2>
      <div className="event-list">
        {events.length === 0 && <div className="empty-hint">no requests routed yet</div>}
        {events.map((e) => (
          <div className="event-row" key={e.id}>
            <span className="mono event-time">{e.time}</span>
            <span className="event-file">{e.file}</span>
            <span className="event-node mono">{e.chosenNode}</span>
            <span className={`tag ${statusColorClass(e.cacheStatus)}`}>{e.cacheStatus}</span>
            <span className="mono event-latency">{e.latencyMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

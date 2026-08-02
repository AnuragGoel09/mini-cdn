import { useEffect, useState } from 'react';
import { SIMULATED_REGIONS } from '../regions';
import { fetchFiles, invalidateFile, requestFile, setNodeDown, setNodeUp } from '../api';

const FALLBACK_FILES = ['hello.txt', 'sample.json', 'readme-snippet.md', 'logo-placeholder.txt'];
const ORIGIN_URL = import.meta.env.VITE_ORIGIN_URL;

export default function Controls({ nodes, onResult, busy, setBusy, regionKey, setRegionKey }) {
  const [files, setFiles] = useState(FALLBACK_FILES);
  const [selectedFile, setSelectedFile] = useState(FALLBACK_FILES[0]);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    if (!ORIGIN_URL) return;
    fetchFiles(ORIGIN_URL)
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setFiles(list);
          setSelectedFile(list[0]);
        }
      })
      .catch(() => {
        /* keep fallback list — origin may not be reachable from the browser */
      });
  }, []);

  async function handleRequest() {
    setBusy(true);
    setLastError(null);
    try {
      const result = await requestFile(selectedFile, { overrideRegion: regionKey });
      onResult(regionKey, result);
    } catch (e) {
      setLastError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleInvalidate() {
    setBusy(true);
    setLastError(null);
    try {
      await invalidateFile(selectedFile);
    } catch (e) {
      setLastError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleNode(node) {
    setBusy(true);
    setLastError(null);
    try {
      if (node.manuallyDown) {
        await setNodeUp(node.name);
      } else {
        await setNodeDown(node.name);
      }
    } catch (e) {
      setLastError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel controls">
      <h2 className="panel-title">controls</h2>

      <label className="field-label" htmlFor="region-select">
        simulated client location
      </label>
      <select id="region-select" value={regionKey} onChange={(e) => setRegionKey(e.target.value)}>
        {SIMULATED_REGIONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="file-select">
        file
      </label>
      <select id="file-select" value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
        {files.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <div className="button-row">
        <button className="btn btn-primary" onClick={handleRequest} disabled={busy}>
          request file
        </button>
        <button className="btn btn-ghost" onClick={handleInvalidate} disabled={busy}>
          invalidate cache
        </button>
      </div>

      {lastError && <div className="error-text">{lastError}</div>}

      <h3 className="field-label" style={{ marginTop: '1.25rem' }}>
        node failover demo
      </h3>
      <div className="node-toggle-list">
        {nodes.map((node) => (
          <button
            key={node.name}
            className={`btn btn-node ${node.manuallyDown ? 'is-down' : ''}`}
            onClick={() => toggleNode(node)}
            disabled={busy}
          >
            <span className={`dot ${node.manuallyDown || !node.healthy ? 'dot-down' : 'dot-up'}`} />
            {node.name}
            <span className="node-action">{node.manuallyDown ? 'restore' : 'kill'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

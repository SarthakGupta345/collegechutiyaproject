// App.jsx ─ Main React component: state management, sidebar, log, stats, animations
import { useState, useCallback, useRef, useEffect } from 'react';
import { BTree, createFreshTree } from './btree';
import TreeSVG from './TreeSVG';

// ─ Toast helper ───────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─ Preset keys ────────────────────────────────────────────────────────────────
const PRESET_10 = [15, 7, 23, 3, 11, 19, 27, 1, 5, 9];
const PRESET_30 = [50, 25, 75, 12, 37, 62, 87, 6, 18, 31, 43, 56, 68, 81, 93,
  3, 9, 15, 21, 28, 34, 40, 46, 53, 59, 65, 72, 78, 84, 90];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─ Log helpers ────────────────────────────────────────────────────────────────
let _logId = 0;
function mkLog(text, type = 'system') {
  return { id: ++_logId, text, type, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
}

function LogItem({ item }) {
  return (
    <li className={`log-item ${item.type}`}>
      <span className="log-dot" />
      <span className="log-text" dangerouslySetInnerHTML={{ __html: item.text }} />
    </li>
  );
}

// ─ Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ tree, degree }) {
  const { height, nodeCount, keyCount } = tree?.getStats?.() ?? { height: 0, nodeCount: 0, keyCount: 0 };
  return (
    <div className="stats-grid">
      <div className="stat-chip"><span className="stat-value">{height}</span><span className="stat-label">Height</span></div>
      <div className="stat-chip"><span className="stat-value">{nodeCount}</span><span className="stat-label">Nodes</span></div>
      <div className="stat-chip"><span className="stat-value">{keyCount}</span><span className="stat-label">Keys</span></div>
      <div className="stat-chip"><span className="stat-value">{degree}</span><span className="stat-label">Degree (t)</span></div>
    </div>
  );
}

// ─ Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('btree-theme') || 'dark');
  const [degree, setDegree] = useState(2);
  const [degreeInput, setDegreeInput] = useState('2');

  // treeVersion is bumped every mutation so React re-renders
  const treeRef = useRef(createFreshTree(2));
  const [treeVer, setTreeVer] = useState(0);
  const [highlights, setHighlights] = useState({});
  const [logs, setLogs] = useState([]);
  const hlTimer = useRef(null);
  const traverseTimer = useRef(null);
  const presetTimer = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // inputs
  const [insertVal, setInsertVal] = useState('');
  const [deleteVal, setDeleteVal] = useState('');
  const [searchVal, setSearchVal] = useState('');

  // ─ theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('btree-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // ─ helpers ────────────────────────────────────────────────────────────────
  const bump = () => setTreeVer(v => v + 1);

  const addLog = useCallback((text, type) => {
    setLogs(prev => [mkLog(text, type), ...prev].slice(0, 120));
  }, []);

  const flashHighlight = useCallback((nodeId, cls, dur = 1200) => {
    if (!nodeId) return;
    clearTimeout(hlTimer.current);
    setHighlights({ [nodeId]: cls });
    hlTimer.current = setTimeout(() => setHighlights({}), dur);
  }, []);

  // ─ insert ─────────────────────────────────────────────────────────────────
  const handleInsert = useCallback(() => {
    const raw = insertVal.trim();
    if (!raw) return;
    const key = isNaN(Number(raw)) ? raw : Number(raw);
    const { events, insertedNodeId } = treeRef.current.insert(key);
    bump();

    const splits = events.filter(e => e.type === 'split');
    if (splits.length) {
      // animate splits sequentially
      let i = 0;
      const runSplit = () => {
        if (i >= splits.length) {
          flashHighlight(insertedNodeId, 'active');
          addLog(`Inserted <strong>${key}</strong> → ${splits.length} split(s)`, 'insert');
          showToast(`Inserted ${key}`, 'info');
          return;
        }
        const ev = splits[i++];
        setHighlights({ [ev.nodeId]: 'split', ...(ev.newNodeId ? { [ev.newNodeId]: 'split' } : {}) });
        hlTimer.current = setTimeout(runSplit, 450);
      };
      runSplit();
    } else {
      flashHighlight(insertedNodeId, 'active');
      addLog(`Inserted <strong>${key}</strong>`, 'insert');
      showToast(`Inserted ${key}`, 'info');
    }
    setInsertVal('');
  }, [insertVal, addLog, flashHighlight]);

  // ─ delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    const raw = deleteVal.trim();
    if (!raw) return;
    const key = isNaN(Number(raw)) ? raw : Number(raw);
    const { found, events } = treeRef.current.delete(key);
    bump();

    if (found) {
      const affectedEvt = events.find(e => e.type === 'remove-leaf' || e.type === 'borrow' || e.type === 'merge');
      if (affectedEvt) flashHighlight(affectedEvt.nodeId, 'deleted');
      addLog(`Deleted <strong>${key}</strong>`, 'delete');
      showToast(`Deleted ${key}`, 'info');
    } else {
      addLog(`Key <strong>${key}</strong> not found`, 'warning');
      showToast(`Key ${key} not found`, 'error');
    }
    setDeleteVal('');
  }, [deleteVal, addLog, flashHighlight]);

  // ─ search ─────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const raw = searchVal.trim();
    if (!raw) return;
    const key = isNaN(Number(raw)) ? raw : Number(raw);
    const { found, nodeId, steps } = treeRef.current.search(key);

    if (found) {
      flashHighlight(nodeId, 'found', 1800);
      addLog(`Found <strong>${key}</strong> after visiting ${steps.length} node(s)`, 'search');
      showToast(`Found ${key}! ✓`, 'success');
    } else {
      addLog(`Key <strong>${key}</strong> not found`, 'warning');
      showToast(`Key ${key} not found`, 'error');
      setHighlights({});
    }
    setSearchVal('');
  }, [searchVal, addLog, flashHighlight]);

  // ─ reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    clearTimeout(hlTimer.current);
    clearTimeout(traverseTimer.current);
    clearInterval(presetTimer.current);
    setIsAnimating(false);
    treeRef.current = createFreshTree(degree);
    bump();
    setHighlights({});
    addLog('Tree reset', 'system');
    showToast('Tree cleared', 'info');
  }, [degree, addLog]);

  // ─ apply degree ────────────────────────────────────────────────────────────
  const handleApplyDegree = useCallback(() => {
    const t = parseInt(degreeInput);
    if (isNaN(t) || t < 2 || t > 10) { showToast('Degree must be 2–10', 'error'); return; }
    setDegree(t);
    treeRef.current = createFreshTree(t);
    bump();
    setHighlights({});
    addLog(`Degree set to <strong>t=${t}</strong> — tree reset`, 'system');
    showToast(`Degree t=${t} applied`, 'info');
  }, [degreeInput, addLog]);

  // ─ traversal ──────────────────────────────────────────────────────────────
  const handleTraversal = useCallback(() => {
    if (isAnimating) return;
    const order = treeRef.current.inOrderTraversal();
    if (!order.length) { showToast('Tree is empty', 'error'); return; }

    setIsAnimating(true);
    addLog(`In-order traversal: <strong>${order.map(o => o.key).join(' → ')}</strong>`, 'traversal');
    showToast('In-order traversal started…', 'info');

    let i = 0;
    const step = () => {
      if (i > 0) setHighlights(prev => { const n = { ...prev }; delete n[order[i - 1].nodeId]; return n; });
      if (i >= order.length) { setHighlights({}); setIsAnimating(false); return; }
      setHighlights({ [order[i].nodeId]: 'traverse' });
      i++;
      traverseTimer.current = setTimeout(step, 380);
    };
    step();
  }, [isAnimating, addLog]);

  // ─ presets ────────────────────────────────────────────────────────────────
  const loadPreset = useCallback((keys) => {
    if (isAnimating) return;
    treeRef.current = createFreshTree(degree);
    bump();
    setHighlights({});
    addLog(`Loading ${keys.length}-key preset…`, 'system');
    setIsAnimating(true);

    const shuffled = shuffle(keys);
    let i = 0;
    const step = () => {
      if (i >= shuffled.length) { setIsAnimating(false); addLog('Preset loaded ✓', 'system'); showToast('Preset loaded!', 'success'); return; }
      const key = shuffled[i++];
      const { events, insertedNodeId } = treeRef.current.insert(key);
      bump();
      flashHighlight(insertedNodeId, 'active', 280);
      presetTimer.current = setTimeout(step, 120);
    };
    step();
  }, [isAnimating, degree, addLog, flashHighlight]);

  // ─ key enter handlers ─────────────────────────────────────────────────────
  const onInsertKey = (e) => e.key === 'Enter' && handleInsert();
  const onDeleteKey = (e) => e.key === 'Enter' && handleDelete();
  const onSearchKey = (e) => e.key === 'Enter' && handleSearch();

  return (
    <div className="app-root">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🌳</span>
          <span className="brand-title">B-Tree Visualizer</span>
        </div>
        <div className="header-right">
          <div className="degree-control">
            <span className="degree-label">Min Degree <em>t</em></span>
            <input
              type="number" min={2} max={10}
              className="degree-input"
              value={degreeInput}
              onChange={e => setDegreeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyDegree()}
            />
            <button className="btn btn-secondary btn-sm" onClick={handleApplyDegree}>Apply</button>
          </div>
          <button className="btn btn-icon" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">

          {/* Operations Panel */}
          <section className="panel">
            <h2 className="panel-title">Operations</h2>

            <div className="op-group">
              <label className="op-label">Insert Key</label>
              <div className="input-row">
                <input className="key-input" placeholder="e.g. 42" value={insertVal}
                  onChange={e => setInsertVal(e.target.value)} onKeyDown={onInsertKey} maxLength={12} />
                <button className="btn btn-primary" onClick={handleInsert} disabled={isAnimating}>Insert</button>
              </div>
            </div>

            <div className="op-group">
              <label className="op-label">Delete Key</label>
              <div className="input-row">
                <input className="key-input" placeholder="e.g. 42" value={deleteVal}
                  onChange={e => setDeleteVal(e.target.value)} onKeyDown={onDeleteKey} maxLength={12} />
                <button className="btn btn-danger" onClick={handleDelete} disabled={isAnimating}>Delete</button>
              </div>
            </div>

            <div className="op-group">
              <label className="op-label">Search Key</label>
              <div className="input-row">
                <input className="key-input" placeholder="e.g. 42" value={searchVal}
                  onChange={e => setSearchVal(e.target.value)} onKeyDown={onSearchKey} maxLength={12} />
                <button className="btn btn-accent" onClick={handleSearch} disabled={isAnimating}>Search</button>
              </div>
            </div>

            <div className="op-divider" />
            <div className="btn-row">
              <button className="btn btn-secondary btn-full" onClick={handleTraversal} disabled={isAnimating}>
                ▶ In-Order Traversal
              </button>
              <button className="btn btn-ghost btn-full" onClick={handleReset}>
                🗑 Reset Tree
              </button>
            </div>
          </section>

          {/* Presets */}
          <section className="panel">
            <h2 className="panel-title">Presets</h2>
            <div className="preset-grid">
              <button className="btn-preset" onClick={() => loadPreset(PRESET_10)} disabled={isAnimating}>Load 10 Keys</button>
              <button className="btn-preset" onClick={() => loadPreset(PRESET_30)} disabled={isAnimating}>Load 30 Keys</button>
            </div>
          </section>

          {/* Stats */}
          <section className="panel">
            <h2 className="panel-title">Tree Stats</h2>
            <StatsBar tree={treeRef.current} degree={degree} key={treeVer} />
          </section>

          {/* Log */}
          <section className="panel log-panel" style={{ flex: 1 }}>
            <div className="panel-header">
              <h2 className="panel-title">Operation Log</h2>
              <button className="btn btn-ghost btn-xs" onClick={() => setLogs([])}>Clear</button>
            </div>
            <ul className="log-list" aria-live="polite">
              {logs.map(l => <LogItem key={l.id} item={l} />)}
            </ul>
          </section>

        </aside>

        {/* Canvas */}
        <TreeSVG
          tree={treeRef.current}
          highlights={highlights}
          key={treeVer}
        />
      </div>

      {/* Toast */}
      <div id="toast" className="toast" />
    </div>
  );
}

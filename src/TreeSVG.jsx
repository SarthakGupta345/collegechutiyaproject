// TreeSVG.jsx ─ renders the B-Tree as an interactive SVG with pan/zoom
import { useRef, useState, useCallback, useEffect } from 'react';
import { useTreeLayout, KEY_H, H_MARGIN, KEY_W } from './useTreeLayout';

const ZOOM_MIN = 0.1, ZOOM_MAX = 4;

function lerp(a, b, t) { return a + (b - a) * t; }

export default function TreeSVG({ tree, highlights, onZoomChange }) {
    const svgRef = useRef(null);
    const wrapperRef = useRef(null);
    const [transform, setTransform] = useState({ tx: 0, ty: 0, scale: 1 });
    const drag = useRef(null);
    const pinch = useRef(null);
    const positions = useTreeLayout(tree);

    // ─ expose imperative zoom helpers to parent via ref callback
    useEffect(() => {
        onZoomChange?.(transform.scale);
    }, [transform.scale, onZoomChange]);

    // ─ fit tree into view after re-render ─────────────────────────────────────
    const fitView = useCallback(() => {
        const vals = Object.values(positions);
        if (!vals.length || !svgRef.current) return;
        const W = svgRef.current.clientWidth || 800;
        const H = svgRef.current.clientHeight || 600;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        vals.forEach(({ x, y, w, h }) => {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        const pad = 60;
        const tW = maxX - minX, tH = maxY - minY;
        const s = Math.min((W - pad * 2) / tW, (H - pad * 2) / tH, 2);
        setTransform({
            scale: s,
            tx: (W - tW * s) / 2 - minX * s,
            ty: (H - tH * s) / 2 - minY * s,
        });
    }, [positions]);

    // Re-fit whenever positions change (new insert/delete)
    useEffect(() => { fitView(); }, [fitView]);

    // ─ zoom controls ───────────────────────────────────────────────────────────
    const zoomAt = useCallback((delta, cx, cy) => {
        setTransform(prev => {
            const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.scale * delta));
            return {
                scale: newScale,
                tx: cx - (cx - prev.tx) * (newScale / prev.scale),
                ty: cy - (cy - prev.ty) * (newScale / prev.scale),
            };
        });
    }, []);

    const handleZoomIn = () => { const r = svgRef.current?.getBoundingClientRect(); zoomAt(1.2, (r?.width || 800) / 2, (r?.height || 600) / 2); };
    const handleZoomOut = () => { const r = svgRef.current?.getBoundingClientRect(); zoomAt(0.83, (r?.width || 800) / 2, (r?.height || 600) / 2); };

    // ─ mouse pan ───────────────────────────────────────────────────────────────
    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        drag.current = { lx: e.clientX, ly: e.clientY };
        wrapperRef.current?.classList.add('dragging');
    };
    const onMouseMove = (e) => {
        if (!drag.current) return;
        setTransform(p => ({ ...p, tx: p.tx + e.clientX - drag.current.lx, ty: p.ty + e.clientY - drag.current.ly }));
        drag.current = { lx: e.clientX, ly: e.clientY };
    };
    const onMouseUp = () => { drag.current = null; wrapperRef.current?.classList.remove('dragging'); };

    // ─ wheel zoom ─────────────────────────────────────────────────────────────
    const onWheel = (e) => {
        e.preventDefault();
        const rect = svgRef.current.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.1 : 0.91, e.clientX - rect.left, e.clientY - rect.top);
    };

    // ─ touch pan / pinch ──────────────────────────────────────────────────────
    const onTouchStart = (e) => {
        if (e.touches.length === 1) {
            drag.current = { lx: e.touches[0].clientX, ly: e.touches[0].clientY };
        } else {
            const [a, b] = [e.touches[0], e.touches[1]];
            pinch.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        }
    };
    const onTouchMove = (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && drag.current) {
            const dx = e.touches[0].clientX - drag.current.lx;
            const dy = e.touches[0].clientY - drag.current.ly;
            setTransform(p => ({ ...p, tx: p.tx + dx, ty: p.ty + dy }));
            drag.current = { lx: e.touches[0].clientX, ly: e.touches[0].clientY };
        } else if (e.touches.length === 2 && pinch.current != null) {
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const rect = svgRef.current.getBoundingClientRect();
            const cx = (a.clientX + b.clientX) / 2 - rect.left;
            const cy = (a.clientY + b.clientY) / 2 - rect.top;
            zoomAt(dist / pinch.current, cx, cy);
            pinch.current = dist;
        }
    };
    const onTouchEnd = () => { drag.current = null; pinch.current = null; };

    // ─ render edges ────────────────────────────────────────────────────────────
    const edges = [];
    Object.values(positions).forEach(({ x, y, w, h, node }) => {
        if (node.isLeaf) return;
        const parentCy = y + h;
        const childCount = node.children.length;
        node.children.forEach((child, i) => {
            const cp = positions[child.id];
            if (!cp) return;
            const connX = x + H_MARGIN + (i / childCount) * (w - H_MARGIN * 2) + (w - H_MARGIN * 2) / childCount / 2;
            const childCx = cp.x + cp.w / 2;
            const midY = (parentCy + cp.y) / 2;
            edges.push(
                <path
                    key={`e-${node.id}-${child.id}`}
                    className="edge-path"
                    d={`M${connX},${parentCy} C${connX},${midY} ${childCx},${midY} ${childCx},${cp.y}`}
                />
            );
        });
    });

    // ─ render nodes ────────────────────────────────────────────────────────────
    const nodes = Object.values(positions).map(({ x, y, w, h, node }) => {
        const hlClass = highlights[node.id] ? ` highlight-${highlights[node.id]}` : '';
        return (
            <g
                key={node.id}
                className={`node-group${hlClass}`}
                transform={`translate(${x},${y})`}
            >
                <rect className="node-rect" x={0} y={0} width={w} height={h} rx={10} ry={10} />
                {node.keys.map((key, i) => (
                    <g key={i}>
                        {i > 0 && (
                            <line
                                className="node-divider"
                                x1={H_MARGIN + i * KEY_W} y1={4}
                                x2={H_MARGIN + i * KEY_W} y2={h - 4}
                            />
                        )}
                        <text
                            className="node-text"
                            x={H_MARGIN + i * KEY_W + KEY_W / 2}
                            y={h / 2}
                        >
                            {String(key).length > 4 ? String(key).slice(0, 4) : key}
                        </text>
                    </g>
                ))}
            </g>
        );
    });

    const isEmpty = !tree?.root?.keys?.length;
    const { tx, ty, scale } = transform;

    return (
        <div className="canvas-area">
            {/* toolbar */}
            <div className="canvas-toolbar">
                <button className="btn btn-icon btn-sm" onClick={handleZoomIn} title="Zoom in">＋</button>
                <button className="btn btn-icon btn-sm" onClick={handleZoomOut} title="Zoom out">－</button>
                <button className="btn btn-icon btn-sm" onClick={fitView} title="Fit view">⊡</button>
                <span className="zoom-label">{Math.round(scale * 100)}%</span>
            </div>

            {/* SVG canvas */}
            <div
                ref={wrapperRef}
                className="svg-wrapper"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <svg ref={svgRef} className="tree-svg">
                    <defs>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    <g transform={`translate(${tx},${ty}) scale(${scale})`}>
                        <g>{edges}</g>
                        <g>{nodes}</g>
                    </g>
                </svg>

                {isEmpty && (
                    <div className="empty-state">
                        <div className="empty-icon">🌲</div>
                        <p>Insert keys to build the B-Tree</p>
                        <p className="empty-sub">or use a preset ↙</p>
                    </div>
                )}
            </div>
        </div>
    );
}

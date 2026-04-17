// useTreeLayout.js ─ computes node positions from B-Tree root
import { useMemo } from 'react';

const KEY_W = 36;
const KEY_H = 34;
const V_GAP = 70;
const H_MARGIN = 14;
const MIN_SIB = 16;

function nodeWidth(node) {
    return node.keys.length * KEY_W + H_MARGIN * 2;
}

function subtreeWidth(node) {
    const nw = nodeWidth(node);
    if (node.isLeaf) return nw;
    const total = node.children.reduce((acc, c) => acc + subtreeWidth(c), 0)
        + (node.children.length - 1) * MIN_SIB;
    return Math.max(nw, total);
}

function computePositions(root) {
    const positions = {};
    if (!root) return positions;

    function assign(node, cx, cy) {
        const nw = nodeWidth(node);
        positions[node.id] = { x: cx - nw / 2, y: cy, w: nw, h: KEY_H, node };

        if (!node.isLeaf) {
            const childWidths = node.children.map(c => Math.max(nodeWidth(c), subtreeWidth(c)));
            const totalW = childWidths.reduce((a, b) => a + b, 0)
                + (node.children.length - 1) * MIN_SIB;
            let startX = cx - totalW / 2;
            node.children.forEach((child, i) => {
                const cw = childWidths[i];
                assign(child, startX + cw / 2, cy + KEY_H + V_GAP);
                startX += cw + MIN_SIB;
            });
        }
    }

    assign(root, 0, 0);
    return positions;
}

export function useTreeLayout(tree) {
    return useMemo(() => {
        if (!tree || !tree.root) return {};
        return computePositions(tree.root);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tree]);
}

export { KEY_W, KEY_H, H_MARGIN, MIN_SIB, V_GAP };

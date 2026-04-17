// ─── B-Tree Core Implementation ───────────────────────────────────────────────
// Pure data structure — no React / DOM dependencies.
// All mutating ops return structured event arrays used for animation.

let _nodeIdCounter = 0;

export class BTreeNode {
    constructor(isLeaf) {
        this.id = ++_nodeIdCounter;
        this.keys = [];
        this.children = [];
        this.isLeaf = isLeaf;
    }
}

export class BTree {
    constructor(t = 2) {
        this.t = Math.max(2, parseInt(t) || 2);
        this.root = new BTreeNode(true);
    }

    // ── comparison (numeric-first) ────────────────────────────────────────────
    _cmp(a, b) {
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
        const sa = String(a), sb = String(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
    }

    // ── stats ─────────────────────────────────────────────────────────────────
    getStats() {
        let nodeCount = 0, keyCount = 0, height = 0;
        const walk = (node, depth) => {
            if (!node) return;
            nodeCount++;
            keyCount += node.keys.length;
            height = Math.max(height, depth);
            node.children.forEach(c => walk(c, depth + 1));
        };
        walk(this.root, 1);
        return { height, nodeCount, keyCount };
    }

    // ── search ────────────────────────────────────────────────────────────────
    search(key) {
        const steps = [];
        const result = this._searchNode(this.root, key, steps);
        return { ...result, steps };
    }

    _searchNode(node, key, steps) {
        if (!node) return { found: false, nodeId: null };
        steps.push(node.id);
        let i = 0;
        while (i < node.keys.length && this._cmp(key, node.keys[i]) > 0) i++;
        if (i < node.keys.length && this._cmp(key, node.keys[i]) === 0) {
            return { found: true, nodeId: node.id, keyIndex: i };
        }
        if (node.isLeaf) return { found: false, nodeId: null };
        return this._searchNode(node.children[i], key, steps);
    }

    // ── insert ────────────────────────────────────────────────────────────────
    insert(key) {
        const events = [];
        const root = this.root;

        if (root.keys.length === 2 * this.t - 1) {
            const newRoot = new BTreeNode(false);
            newRoot.children.push(this.root);
            const right = this._splitChild(newRoot, 0, events);
            this.root = newRoot;
            events.push({ type: 'root-promoted', nodeId: newRoot.id });
        }

        const insertedId = this._insertNonFull(this.root, key, events);
        events.push({ type: 'inserted', nodeId: insertedId });
        return { events, insertedNodeId: insertedId };
    }

    _insertNonFull(node, key, events) {
        let i = node.keys.length - 1;
        if (node.isLeaf) {
            while (i >= 0 && this._cmp(key, node.keys[i]) < 0) {
                node.keys[i + 1] = node.keys[i];
                i--;
            }
            node.keys[i + 1] = key;
            return node.id;
        }
        while (i >= 0 && this._cmp(key, node.keys[i]) < 0) i--;
        i++;
        if (node.children[i].keys.length === 2 * this.t - 1) {
            this._splitChild(node, i, events);
            if (this._cmp(key, node.keys[i]) > 0) i++;
        }
        return this._insertNonFull(node.children[i], key, events);
    }

    _splitChild(parent, i, events) {
        const t = this.t;
        const child = parent.children[i];
        const mid = t - 1;
        const promotedKey = child.keys[mid];

        const rightNode = new BTreeNode(child.isLeaf);
        rightNode.keys = child.keys.slice(mid + 1);
        child.keys = child.keys.slice(0, mid);

        if (!child.isLeaf) {
            rightNode.children = child.children.slice(t);
            child.children = child.children.slice(0, t);
        }

        parent.keys.splice(i, 0, promotedKey);
        parent.children.splice(i + 1, 0, rightNode);

        events.push({
            type: 'split',
            nodeId: child.id,
            newNodeId: rightNode.id,
            parentId: parent.id,
            promotedKey,
        });
        return rightNode;
    }

    // ── delete ────────────────────────────────────────────────────────────────
    delete(key) {
        const events = [];
        if (!this.root || this.root.keys.length === 0) return { found: false, events };
        const found = this._deleteKey(this.root, key, events);
        if (this.root.keys.length === 0 && !this.root.isLeaf) {
            this.root = this.root.children[0];
        }
        if (found) events.push({ type: 'deleted', key });
        return { found, events };
    }

    _deleteKey(node, key, events) {
        const t = this.t;
        let i = 0;
        while (i < node.keys.length && this._cmp(key, node.keys[i]) > 0) i++;

        if (i < node.keys.length && this._cmp(key, node.keys[i]) === 0) {
            if (node.isLeaf) {
                node.keys.splice(i, 1);
                events.push({ type: 'remove-leaf', nodeId: node.id });
                return true;
            }
            if (node.children[i].keys.length >= t) {
                const pred = this._getPred(node.children[i]);
                node.keys[i] = pred;
                return this._deleteKey(node.children[i], pred, events);
            } else if (node.children[i + 1].keys.length >= t) {
                const succ = this._getSucc(node.children[i + 1]);
                node.keys[i] = succ;
                return this._deleteKey(node.children[i + 1], succ, events);
            } else {
                this._merge(node, i, events);
                return this._deleteKey(node.children[i], key, events);
            }
        } else {
            if (node.isLeaf) return false;
            const isLast = i === node.keys.length;
            if (node.children[i].keys.length < t) {
                this._fill(node, i, events);
                if (isLast && i > node.keys.length) i--;
            }
            return this._deleteKey(node.children[i], key, events);
        }
    }

    _getPred(node) {
        while (!node.isLeaf) node = node.children[node.children.length - 1];
        return node.keys[node.keys.length - 1];
    }
    _getSucc(node) {
        while (!node.isLeaf) node = node.children[0];
        return node.keys[0];
    }

    _fill(node, i, events) {
        const t = this.t;
        if (i !== 0 && node.children[i - 1].keys.length >= t) {
            this._borrowPrev(node, i, events);
        } else if (i !== node.keys.length && node.children[i + 1].keys.length >= t) {
            this._borrowNext(node, i, events);
        } else {
            this._merge(node, i !== node.keys.length ? i : i - 1, events);
        }
    }

    _borrowPrev(node, i, events) {
        const child = node.children[i], sib = node.children[i - 1];
        child.keys.unshift(node.keys[i - 1]);
        node.keys[i - 1] = sib.keys.pop();
        if (!child.isLeaf) child.children.unshift(sib.children.pop());
        events.push({ type: 'borrow', nodeId: child.id });
    }

    _borrowNext(node, i, events) {
        const child = node.children[i], sib = node.children[i + 1];
        child.keys.push(node.keys[i]);
        node.keys[i] = sib.keys.shift();
        if (!child.isLeaf) child.children.push(sib.children.shift());
        events.push({ type: 'borrow', nodeId: child.id });
    }

    _merge(node, i, events) {
        const child = node.children[i], sib = node.children[i + 1];
        child.keys.push(node.keys[i]);
        child.keys.push(...sib.keys);
        if (!child.isLeaf) child.children.push(...sib.children);
        node.keys.splice(i, 1);
        node.children.splice(i + 1, 1);
        events.push({ type: 'merge', nodeId: child.id, mergedId: sib.id });
    }

    // ── in-order traversal ────────────────────────────────────────────────────
    inOrderTraversal() {
        const result = [];
        const walk = (node) => {
            if (!node) return;
            for (let i = 0; i < node.keys.length; i++) {
                if (!node.isLeaf) walk(node.children[i]);
                result.push({ nodeId: node.id, keyIndex: i, key: node.keys[i] });
            }
            if (!node.isLeaf) walk(node.children[node.keys.length]);
        };
        walk(this.root);
        return result;
    }

    // ── deep clone (for React immutable state) ────────────────────────────────
    clone() {
        const cloneNode = (node) => {
            if (!node) return null;
            const n = Object.assign(Object.create(BTreeNode.prototype), {
                ...node,
                keys: [...node.keys],
                children: node.children.map(cloneNode),
            });
            return n;
        };
        const c = new BTree(this.t);
        c.root = cloneNode(this.root);
        return c;
    }
}

export function createFreshTree(t) {
    _nodeIdCounter = 0;
    return new BTree(t);
}

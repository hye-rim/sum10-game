'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const board = (rows, cells) => ({ rows: rows.length, cols: rows[0].length, cells: rows.flat() });

test('new board has the right size, digits 1 to 9, and a sum that is a multiple of ten', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const b = L.newBoard(L.rng(seed));
    assert.strictEqual(b.cells.length, L.ROWS * L.COLS);
    assert.ok(b.cells.every((n) => Number.isInteger(n) && n >= 1 && n <= 9));
    assert.strictEqual(b.cells.reduce((s, n) => s + n, 0) % 10, 0, `seed ${seed}`);
    assert.ok(L.hasMove(b), 'a fresh board always has a move');
  }
});

test('a rectangle that sums to ten clears its digits', () => {
  const b = board([[1, 2, 7], [4, 6, 9]]);
  const r = L.clear(b, 1, 0, 1, 1);                       // 4 + 6
  assert.deepStrictEqual(r, { count: 2, cells: [3, 4] });
  assert.deepStrictEqual(b.cells, [1, 2, 7, 0, 0, 9]);
});

test('corners can be given in any order', () => {
  const b = board([[1, 9], [5, 5]]);
  assert.ok(L.clear(b, 0, 1, 0, 0));                      // 오른쪽에서 왼쪽으로
  assert.deepStrictEqual(b.cells, [0, 0, 5, 5]);
});

test('a rectangle with any other sum is refused and nothing changes', () => {
  const b = board([[1, 2, 3], [4, 5, 6]]);
  const before = b.cells.slice();
  assert.strictEqual(L.clear(b, 0, 0, 0, 2), null);       // 6
  assert.strictEqual(L.clear(b, 0, 0, 1, 2), null);       // 21
  assert.deepStrictEqual(b.cells, before);
});

test('empty cells count as zero so bigger rectangles open up', () => {
  const b = board([[3, 0, 7], [0, 0, 0]]);
  assert.strictEqual(L.rectSum(b, L.norm(b, 0, 0, 1, 2)), 10);
  const r = L.clear(b, 0, 0, 1, 2);
  assert.strictEqual(r.count, 2);
  assert.strictEqual(L.remaining(b), 0);
});

test('a single digit can never be cleared and an empty selection is refused', () => {
  const b = board([[9, 1], [0, 0]]);
  assert.strictEqual(L.clear(b, 0, 0, 0, 0), null);
  const z = board([[0, 0], [0, 0]]);
  assert.strictEqual(L.clear(z, 0, 0, 1, 1), null);
});

test('out-of-range and non-integer corners are refused', () => {
  const b = board([[5, 5], [5, 5]]);
  for (const a of [[-1, 0, 0, 1], [0, 0, 2, 1], [0, 0, 0, 2], [0, 0, 0.5, 1], [0, 0, 'a', 1], [0, 0, null, 1], [NaN, 0, 0, 1]]) assert.strictEqual(L.clear(b, ...a), null, JSON.stringify(a));
  assert.deepStrictEqual(b.cells, [5, 5, 5, 5]);
});

test('moves finds every rectangle that sums to ten with two or more digits', () => {
  const b = board([[4, 6, 0], [1, 2, 7]]);
  const m = L.moves(b);
  const key = (x) => `${x.r1},${x.c1},${x.r2},${x.c2}`;
  assert.deepStrictEqual(m.map(key).sort(), ['0,0,0,1', '0,0,0,2', '1,0,1,2'].sort());
  assert.ok(m.every((x) => L.rectSum(b, x) === 10 && L.rectCount(b, x) === x.count && x.count >= 2));
  const h = L.hint(b);
  assert.ok(h && L.rectSum(b, h) === 10);
  assert.strictEqual(L.hint(board([[9, 9], [9, 9]])), null);
  assert.strictEqual(L.hasMove(board([[9, 9], [9, 9]])), false);
});

test('moves matches a slow brute force on random boards', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const b = L.newBoard(L.rng(seed), 6, 7);
    for (let i = 0; i < 12; i++) { const h = L.hint(b); if (!h) break; L.clear(b, h.r1, h.c1, h.r2, h.c2); }
    let slow = 0;
    for (let r1 = 0; r1 < b.rows; r1++) for (let r2 = r1; r2 < b.rows; r2++) for (let c1 = 0; c1 < b.cols; c1++) for (let c2 = c1; c2 < b.cols; c2++) {
      const rect = { r1, c1, r2, c2 };
      if (L.rectSum(b, rect) === 10 && L.rectCount(b, rect) >= 2) slow++;
    }
    assert.strictEqual(L.moves(b).length, slow, `seed ${seed}`);
  }
});

test('scoring: more cells score more, combos multiply up to three', () => {
  assert.strictEqual(L.baseScore(2), 2);
  assert.strictEqual(L.baseScore(3), 4);
  assert.strictEqual(L.baseScore(5), 8);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 9].map(L.multiplier), [1, 1, 2, 2, 3, 3, 3]);
  assert.strictEqual(L.pointsFor(2, 1), 2);
  assert.strictEqual(L.pointsFor(4, 3), 12);
});

test('playing hints until stuck always ends and clears some digits', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const b = L.newBoard(L.rng(seed));
    const start = L.remaining(b);
    let n = 0, got = 0;
    for (let h; (h = L.hint(b)) && n < 500; n++) { const r = L.clear(b, h.r1, h.c1, h.r2, h.c2); assert.ok(r); got += r.count; }
    assert.ok(n < 500, 'ends');
    assert.strictEqual(start - L.remaining(b), got, 'cleared count adds up');
    assert.ok(got >= 40, `a greedy player clears a lot (seed ${seed}: ${got})`);
  }
});

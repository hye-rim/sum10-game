'use strict';

// 합 10 지우기: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 판은 ROWS x COLS 칸, 칸마다 1~9 (지우면 0 = 빈칸)
// - 직사각형 영역을 잡았을 때 안의 숫자 합이 정확히 10 이면 그 칸들을 지운다 (빈칸은 0 으로 센다)
// - 숫자가 적어도 두 칸 들어 있어야 한다 (한 칸으로는 10 이 안 된다)
// - 점수 = (지운 칸 수 + 3칸부터 칸 수-2 만큼 보너스) x 콤보 배수. 콤보는 직전에 지운 지 3초 안이면 이어진다
// - 판의 숫자 합은 10 의 배수라서 이론상 전부 지울 수 있다 (실제로는 지운 순서에 따라 막힌다)
const LOGIC_SUM10 = (() => {
const ROWS = 12, COLS = 10, TARGET = 10, COMBO_MS = 3000, COMBO_MAX = 3;

function rng(seed) {                   // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 새 판: 1~9 를 무작위로 깔고 합이 10 의 배수가 되도록 몇 칸을 고친다
function newBoard(rand = Math.random, rows = ROWS, cols = COLS) {
  const cells = [];
  for (let i = 0; i < rows * cols; i++) cells.push(1 + Math.floor(rand() * 9));
  let sum = cells.reduce((s, n) => s + n, 0);
  let guard = 0;
  while (sum % TARGET !== 0 && guard++ < 1000) {
    const i = Math.floor(rand() * cells.length);
    const v = cells[i];
    const need = TARGET - (sum % TARGET);                 // 더해야 할 양(1~9)
    const nv = Math.min(9, v + need);
    cells[i] = nv; sum += nv - v;
    if (sum % TARGET !== 0 && nv === 9) { /* 한 칸으로 모자라면 다음 칸에서 이어서 맞춘다 */ }
  }
  return { rows, cols, cells };
}
const clone = (b) => ({ rows: b.rows, cols: b.cols, cells: b.cells.slice() });

// 직사각형 (r1,c1)~(r2,c2) 은 모서리 순서가 바뀌어도 된다. { r1, c1, r2, c2 } 로 고쳐 돌려준다
function norm(b, r1, c1, r2, c2) {
  const ok = [r1, c1, r2, c2].every(Number.isInteger);
  if (!ok) return null;
  const R = { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
  if (R.r1 < 0 || R.c1 < 0 || R.r2 >= b.rows || R.c2 >= b.cols) return null;
  return R;
}
function rectCells(b, rect) {
  const out = [];
  for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) out.push(r * b.cols + c);
  return out;
}
const rectSum = (b, rect) => rectCells(b, rect).reduce((s, i) => s + b.cells[i], 0);
const rectCount = (b, rect) => rectCells(b, rect).filter((i) => b.cells[i] > 0).length;

// 지운다. 합이 10 이 아니거나 숫자가 두 칸 미만이면 null. 성공하면 { count, cells(지운 칸 번호들) }
function clear(b, r1, c1, r2, c2) {
  const rect = norm(b, r1, c1, r2, c2);
  if (!rect) return null;
  if (rectSum(b, rect) !== TARGET || rectCount(b, rect) < 2) return null;
  const cells = rectCells(b, rect).filter((i) => b.cells[i] > 0);
  cells.forEach((i) => { b.cells[i] = 0; });
  return { count: cells.length, cells };
}

// 지울 수 있는 영역 모두 (합 10, 숫자 2칸 이상). 누적합으로 센다
function moves(b) {
  const P = [];
  for (let r = 0; r <= b.rows; r++) P.push(new Array(b.cols + 1).fill(0));
  const N = [];
  for (let r = 0; r <= b.rows; r++) N.push(new Array(b.cols + 1).fill(0));
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    const v = b.cells[r * b.cols + c];
    P[r + 1][c + 1] = P[r][c + 1] + P[r + 1][c] - P[r][c] + v;
    N[r + 1][c + 1] = N[r][c + 1] + N[r + 1][c] - N[r][c] + (v > 0 ? 1 : 0);
  }
  const out = [];
  for (let r1 = 0; r1 < b.rows; r1++) for (let r2 = r1; r2 < b.rows; r2++)
    for (let c1 = 0; c1 < b.cols; c1++) for (let c2 = c1; c2 < b.cols; c2++) {
      const s = P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];
      if (s !== TARGET) continue;
      const n = N[r2 + 1][c2 + 1] - N[r1][c2 + 1] - N[r2 + 1][c1] + N[r1][c1];
      if (n >= 2) out.push({ r1, c1, r2, c2, count: n });
    }
  return out;
}
const hasMove = (b) => moves(b).length > 0;
// 도움말용: 한 영역을 골라 준다 (작은 영역 먼저, 같으면 위쪽 먼저)
function hint(b) {
  const all = moves(b);
  if (!all.length) return null;
  all.sort((x, y) => (x.r2 - x.r1 + 1) * (x.c2 - x.c1 + 1) - (y.r2 - y.r1 + 1) * (y.c2 - y.c1 + 1) || x.r1 - y.r1 || x.c1 - y.c1);
  return all[0];
}

const remaining = (b) => b.cells.filter((n) => n > 0).length;

// 점수: 지운 칸이 많을수록 보너스, 연속으로 빨리 지우면 배수 (콤보 1 -> x1, 3 -> x2, 5 -> x3)
const multiplier = (combo) => Math.min(COMBO_MAX, 1 + Math.floor((Math.max(1, combo) - 1) / 2));
const baseScore = (count) => count + Math.max(0, count - 2);
const pointsFor = (count, combo) => baseScore(count) * multiplier(combo);

return { ROWS, COLS, TARGET, COMBO_MS, COMBO_MAX, rng, newBoard, clone, norm, rectCells, rectSum, rectCount, clear, moves, hasMove, hint, remaining, multiplier, baseScore, pointsFor };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_SUM10;

'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 합 10 지우기: 화면·입력·소리. 규칙은 logic.js (LOGIC_SUM10)
(() => {
const L = LOGIC_SUM10;
const $ = (id) => document.getElementById(id);
const TUTORIAL = new URLSearchParams(location.search).has('tutorial');
const T = { round: TUTORIAL ? 600 : 60, hint: 1800, endDelay: 700 };   // 초·ms. 튜토리얼에서는 읽는 동안 시간이 끝나지 않게 길게 준다. 시험용으로 줄일 수 있다
const HINTS = 3;

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let best = Number(store.get('sum10Best')) || 0;
let muted = store.get('sum10Muted') === '1';

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.09) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  clear: (combo) => seq([523 + combo * 60, 659 + combo * 60, 784 + combo * 60], 55),
  bad: () => tone(150, 0.12, 'square', 0.05),
  hint: () => seq([660, 880], 70),
  tick: () => tone(900, 0.04, 'square', 0.04),
  end: () => seq([523, 440, 392, 330], 120, 'triangle', 0.09),
  record: () => seq([523, 659, 784, 1047], 100),
};
function toggleMute() { muted = !muted; store.set('sum10Muted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let phase = 'title';                 // title · play · over
let b = null;                        // 판
let score = 0, cleared = 0, combo = 0, bestCombo = 0, lastClearAt = -1e9, hintsLeft = HINTS;
let endAt = 0, timer = 0, hintTimer = 0, comboTimer = 0, busy = false;
let drag = null;                     // { r0, c0, r1, c1 } 끌고 있는 영역

// ---------- 그리기 ----------
const board = $('board');
function buildCells() {
  board.querySelectorAll('.cell').forEach((e) => e.remove());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < L.ROWS * L.COLS; i++) { const d = document.createElement('div'); d.className = 'cell empty'; d.dataset.i = i; frag.appendChild(d); }
  board.appendChild(frag);
}
function renderCells() {
  const els = board.querySelectorAll('.cell');
  for (let i = 0; i < els.length; i++) {
    const v = b ? b.cells[i] : 0;
    const want = v ? `cell n${v}` : 'cell empty';
    if (els[i].className !== want && !els[i].classList.contains('pop')) els[i].className = want;
    els[i].textContent = v || '';
  }
}
function render() {
  $('score').textContent = String(score);
  $('best').textContent = String(best);
  $('hintLeft').textContent = String(hintsLeft);
  $('hintBtn').disabled = phase !== 'play' || hintsLeft <= 0;
  const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
  $('time').textContent = phase === 'play' ? String(left) : String(T.round);
  const frac = phase === 'play' ? Math.max(0, (endAt - performance.now()) / (T.round * 1000)) : 1;
  $('barFill').style.transform = `scaleX(${frac})`;
  const low = phase === 'play' && left <= 10 && !TUTORIAL;
  $('bar').classList.toggle('low', low); $('timeItem').classList.toggle('low', low);
}
function say(t) { $('msg').textContent = t; }

// 칸 번호 → 판 안의 픽셀 사각형
function rectPx(r0, c0, r1, c1) {
  const first = board.querySelector(`.cell[data-i="${Math.min(r0, r1) * L.COLS + Math.min(c0, c1)}"]`);
  const last = board.querySelector(`.cell[data-i="${Math.max(r0, r1) * L.COLS + Math.max(c0, c1)}"]`);
  const bb = board.getBoundingClientRect(), a = first.getBoundingClientRect(), z = last.getBoundingClientRect();
  return { left: a.left - bb.left - 3, top: a.top - bb.top - 3, width: z.right - a.left + 6, height: z.bottom - a.top + 6 };
}
function place(el, px) { el.style.left = px.left + 'px'; el.style.top = px.top + 'px'; el.style.width = px.width + 'px'; el.style.height = px.height + 'px'; }
function renderSel() {
  const el = $('sel');
  if (!drag) { el.style.display = 'none'; return; }
  const rect = L.norm(b, drag.r0, drag.c0, drag.r1, drag.c1);
  const sum = L.rectSum(b, rect), n = L.rectCount(b, rect);
  el.className = sum === L.TARGET && n >= 2 ? 'ok' : sum > L.TARGET ? 'over' : '';
  el.style.display = 'block';
  place(el, rectPx(drag.r0, drag.c0, drag.r1, drag.c1));
  el.querySelector('b').textContent = String(sum);
}

// ---------- 입력 ----------
function cellAt(e) {
  const bb = board.getBoundingClientRect();
  const c = Math.min(L.COLS - 1, Math.max(0, Math.floor(((e.clientX - bb.left) / bb.width) * L.COLS)));
  const r = Math.min(L.ROWS - 1, Math.max(0, Math.floor(((e.clientY - bb.top) / bb.height) * L.ROWS)));
  return { r, c };
}
board.addEventListener('pointerdown', (e) => {
  if (phase !== 'play' || busy) return;
  e.preventDefault();
  try { board.setPointerCapture(e.pointerId); } catch (_) {}
  const { r, c } = cellAt(e);
  drag = { r0: r, c0: c, r1: r, c1: c };
  renderSel();
});
board.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { r, c } = cellAt(e);
  if (r === drag.r1 && c === drag.c1) return;
  drag.r1 = r; drag.c1 = c;
  renderSel();
});
function endDrag(commit) {
  if (!drag) return;
  const d = drag; drag = null;
  $('sel').style.display = 'none';
  if (commit && phase === 'play') tryClear(d.r0, d.c0, d.r1, d.c1);
}
board.addEventListener('pointerup', () => endDrag(true));
board.addEventListener('pointercancel', () => endDrag(false));
addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggleMute(); });
$('hintBtn').onclick = (e) => { e.currentTarget.blur(); showHint(); };

// ---------- 지우기 ----------
function tryClear(r0, c0, r1, c1) {
  const rect = L.norm(b, r0, c0, r1, c1);
  const res = L.clear(b, r0, c0, r1, c1);
  if (!res) {
    const sum = L.rectSum(b, rect);
    if (L.rectCount(b, rect) > 0 && (r0 !== r1 || c0 !== c1)) { sfx.bad(); say(sum > L.TARGET ? `합이 ${sum}이에요. 10을 넘었어요` : `합이 ${sum}이에요. 딱 10이 되어야 해요`); }
    return;
  }
  const now = performance.now();
  combo = now - lastClearAt <= L.COMBO_MS ? combo + 1 : 1;
  bestCombo = Math.max(bestCombo, combo);
  lastClearAt = now;
  const pts = L.pointsFor(res.count, combo);
  score += pts; cleared += res.count;
  sfx.clear(Math.min(combo, 6));
  // 지운 칸이 터지는 연출
  const els = board.querySelectorAll('.cell');
  res.cells.forEach((i) => { els[i].className = 'cell pop'; });
  setTimeout(() => { els.forEach((el) => el.classList.remove('pop')); renderCells(); }, 340);
  const px = rectPx(rect.r1, rect.c1, rect.r2, rect.c2);
  const f = document.createElement('div');
  f.className = 'float'; f.textContent = `+${pts}`;
  f.style.left = (px.left + px.width / 2) + 'px'; f.style.top = (px.top + px.height / 2) + 'px';
  board.appendChild(f); setTimeout(() => f.remove(), 950);
  showCombo();
  say(`${res.count}칸을 지웠어요! +${pts}점${L.multiplier(combo) > 1 ? ` (콤보 x${L.multiplier(combo)})` : ''}`);
  hideHint();
  tutorialSignal('clear');
  render();
  if (!L.hasMove(b)) { phase = 'over'; busy = true; clearInterval(timer); setTimeout(() => finish('stuck'), T.endDelay); }
}
function showCombo() {
  const el = $('combo');
  if (combo < 2) { el.style.display = 'none'; return; }
  el.textContent = `🔥 ${combo} 콤보`; el.style.display = 'block';
  clearTimeout(comboTimer); comboTimer = setTimeout(() => { el.style.display = 'none'; }, L.COMBO_MS);
}

// ---------- 힌트 ----------
function showHint() {
  if (phase !== 'play' || hintsLeft <= 0) return;
  const h = L.hint(b);
  if (!h) return;
  hintsLeft--;
  sfx.hint();
  const el = $('hintbox');
  place(el, rectPx(h.r1, h.c1, h.r2, h.c2)); el.style.display = 'block';
  clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, T.hint);
  say('점선 안의 숫자를 한 번에 잡아 보세요');
  tutorialSignal('hint');
  render();
}
function hideHint() { clearTimeout(hintTimer); $('hintbox').style.display = 'none'; }

// ---------- 흐름 ----------
function tick() {
  if (phase !== 'play') return;
  const left = (endAt - performance.now()) / 1000;
  if (left <= 0) { render(); finish('time'); return; }
  render();
}
function start() {
  hideOverlay();
  b = L.newBoard();
  score = 0; cleared = 0; combo = 0; bestCombo = 0; lastClearAt = -1e9; hintsLeft = HINTS; busy = false; drag = null;
  buildCells(); renderCells(); hideHint(); $('combo').style.display = 'none';
  phase = 'play'; endAt = performance.now() + T.round * 1000;
  clearInterval(timer); timer = setInterval(tick, 200);
  say('합이 10이 되도록 숫자를 드래그로 감싸 보세요');
  render();
}
function finish(why) {
  if (phase === 'over' && !busy) return;
  phase = 'over'; busy = false; clearInterval(timer); drag = null; $('sel').style.display = 'none'; hideHint();
  const record = score > best;
  if (record) { best = score; store.set('sum10Best', String(best)); sfx.record(); } else sfx.end();
  render();
  showOverlay(`
    <h2>${why === 'time' ? '시간 끝!' : '더 지울 곳이 없어요!'}</h2>
    <div class="big">${score}</div>
    ${record ? '<span class="tag">🎉 최고 기록!</span>' : ''}
    <dl class="stats card2"><dt>지운 숫자</dt><dd>${cleared}칸</dd><dt>최고 콤보</dt><dd>${bestCombo}</dd><dt>최고 점수</dt><dd>${best}점</dd></dl>
    <div class="col"><button data-act="again">다시 하기</button><button class="sub" data-act="view">판 보기</button></div>`);
}
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
function showTitle() {
  phase = 'title'; b = null; buildCells(); renderCells(); render(); say('');
  showOverlay(`
    <h1>합 10 지우기</h1>
    <p>숫자를 <b>직사각형으로 드래그</b>해서<br>합이 <b>딱 10</b>이 되면 지워져요!</p>
    <div class="card2" style="font-size:13px">예: <b>4+6</b> · <b>1+2+7</b> · 위아래로 <b>2×2 칸</b>도 돼요<br>지운 자리(빈칸)는 0으로 쳐서 판이 비면 더 넓게 잡을 수 있어요<br>한 번에 많이 지우면 보너스, <b>3초 안에 이어 지우면 콤보</b>!<br>제한 시간 <b>${T.round}초</b> · 💡 힌트는 ${HINTS}번</div>
    <div class="col"><button data-act="start">시작</button></div>`);
}
$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  const act = btn.dataset.act;
  if (act === 'start' || act === 'again') start();
  else if (act === 'view') hideOverlay();
});

showTitle();

/* @test-hooks:start */
window.__s10 = { get b() { return b; }, get phase() { return phase; }, get score() { return score; }, get combo() { return combo; }, T, start, tryClear, showHint, render, finish };
/* @test-hooks:end */
})();

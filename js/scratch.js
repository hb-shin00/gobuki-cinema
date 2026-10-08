// 긁기 카드: 은색 덮개를 손가락으로 문질러 지우고, 일정 비율 이상 지워지면 onReveal을 호출해요.
// 덮개 = 은색 그라데이션(시안 scratch.svg와 같은 색) + 글자 무늬(assets/scratch_pattern.svg).
// 칸이 넓어져도 무늬 글자는 커지지 않고 좌우로 더 많이 보이도록, 무늬는 칸 높이 기준으로만 크기를 맞춰요.
// 화면 크기가 바뀌면(창 크기 조절, 회전) 덮개를 새 크기로 다시 그리고, 이미 긁은 자국은 다시 지워서 유지해요.
// 티켓 위쪽 좌석 띠(.ticket-head)는 무늬만 비치고 긁히지 않아요. 긁기와 판정은 띠 아래 영역에서만 해요.
const PATTERN = new Image();
PATTERN.src = 'assets/scratch_pattern.svg';
const DESIGN_TICKET_H = 150; // 시안 393 기준 티켓 높이. 이 높이일 때 무늬가 원래 크기예요

window.ScratchCard = function (slotEl, { onReveal }) {
  const canvas = document.createElement('canvas');
  slotEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const opts = (window.LS_CONFIG && window.LS_CONFIG.scratch) || {};
  const brush = (opts.brushSize || 48) / 2; // 붓 반지름
  const textReveal = opts.textReveal || 0.8;
  const areaReveal = opts.areaReveal || 0.5;
  const revealDelay = opts.revealDelay ?? 500;
  let pending = null; // 기준을 넘고 열리기를 기다리는 중
  let done = false;
  let last = null;
  let moves = 0;
  let drawing = false;
  let cw = 0;
  let ch = 0;
  const strokes = []; // 긁은 선분 기록 [x0, y0, x1, y1]

  function paintCover() {
    if (done) return;
    const w = (cw = slotEl.clientWidth);
    const h = (ch = slotEl.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#d7d7d7');
    g.addColorStop(1, '#c4c4c4');
    ctx.fillStyle = g;
    roundRect(0, 0, w, h, 26);
    ctx.fill();
    if (PATTERN.complete && PATTERN.naturalWidth) {
      const scale = h / DESIGN_TICKET_H;
      const pw = PATTERN.naturalWidth * scale;
      const ph = PATTERN.naturalHeight * scale;
      // 무늬를 칸 가운데에 원래 비율로 놓고, 칸이 무늬보다 넓으면 옆으로 이어 붙여요.
      for (let x = (w - pw) / 2 - Math.ceil(Math.max(0, (w - pw) / 2) / pw) * pw; x < w; x += pw) {
        ctx.drawImage(PATTERN, x, (h - ph) / 2, pw, ph);
      }
    }
    strokes.forEach(([x0, y0, x1, y1]) => erase(x0, y0, x1, y1));
  }
  if (!(PATTERN.complete && PATTERN.naturalWidth)) PATTERN.addEventListener('load', paintCover, { once: true });

  // 칸 크기가 바뀌면 다시 그려요.
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (slotEl.clientWidth !== cw || slotEl.clientHeight !== ch) paintCover();
    }).observe(slotEl);
  }

  // 좌석 띠 높이(CSS px)
  const headH = () => { const h = slotEl.querySelector('.ticket-head'); return h ? h.offsetHeight : 0; };

  function erase(x0, y0, x1, y1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headH(), cw, ch - headH());
    ctx.clip();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush * 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function pos(e) {
    const b = canvas.getBoundingClientRect();
    // 그린 뒤에 칸 크기가 바뀌어도 손가락 위치가 맞도록 비율로 환산해요.
    return { x: ((e.clientX - b.left) * cw) / b.width, y: ((e.clientY - b.top) * ch) / b.height };
  }

  function scratchTo(p) {
    const seg = [(last || p).x, (last || p).y, p.x + 0.1, p.y];
    strokes.push(seg);
    erase(...seg);
    last = p;
    if (++moves % 6 === 0) checkCleared();
  }

  // 얼마나 긁었는지는 캔버스 픽셀을 읽지 않고, 기록해 둔 긁은 경로(strokes)로 계산해요.
  // (파일로 직접 열거나 브라우저 보안 설정에 따라 픽셀 읽기가 막혀도 항상 동작하도록)
  // 결과 글자(당첨/꽝) 영역이 60% 넘게 긁혔거나, 띠 아래 전체가 35% 넘게 긁히면 결과를 열어요.
  function textBox() {
    const target = slotEl.querySelector('.ticket-result');
    const node = target && target.firstChild;
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const t = range.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    if (!t.width || !b.width) return null;
    // "꽝"처럼 글자가 짧으면 한 번에 다 덮이니, 판정 영역을 최소 170×80으로 넓혀요(붓 한 줄로는 다 안 덮여요).
    const cx = (t.left + t.right) / 2 - b.left;
    const cy = (t.top + t.bottom) / 2 - b.top;
    const hw = Math.max(t.width, 170) / 2;
    const hh = Math.max(t.height, 80) / 2;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }

  // 점 (x, y)가 긁은 선분 중 하나의 붓 반경 안에 있는지
  function scratched(x, y) {
    const r2 = brush * brush;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const [x0, y0, x1, y1] = strokes[i];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2)) : 0;
      const px = x0 + t * dx - x;
      const py = y0 + t * dy - y;
      if (px * px + py * py <= r2) return true;
    }
    return false;
  }

  function checkCleared() {
    if (done || !strokes.length) return;
    const box = textBox();
    const top = headH();
    const step = 8;
    let total = 0;
    let clear = 0;
    let textTotal = 0;
    let textClear = 0;
    for (let y = top + step / 2; y < ch; y += step) {
      for (let x = step / 2; x < cw; x += step) {
        const isClear = scratched(x, y);
        total++;
        if (isClear) clear++;
        if (box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) {
          textTotal++;
          if (isClear) textClear++;
        }
      }
    }
    // 기준을 넘으면 바로 열지 않고 잠깐 기다렸다가 열어요(그동안 계속 긁을 수 있어요).
    if (clear / total > areaReveal || (textTotal && textClear / textTotal > textReveal)) {
      if (!pending) pending = setTimeout(reveal, revealDelay);
    }
  }

  function reveal() {
    clearTimeout(pending);
    if (done) return;
    done = true;
    slotEl.classList.add('revealed');
    if (navigator.vibrate) navigator.vibrate(30);
    onReveal && onReveal();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (done) return;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drawing = true;
    last = null;
    scratchTo(pos(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (done || !drawing) return;
    scratchTo(pos(e));
  });
  const end = () => { if (!drawing) return; drawing = false; last = null; if (!done) checkCleared(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  paintCover();
  return { reveal, get done() { return done; } };
};

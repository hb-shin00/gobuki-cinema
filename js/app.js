// Lucky Seat 참가자 화면 로직
(function () {
  const CFG = window.LS_CONFIG;
  const store = window.LS_STORE;
  const $ = (s) => document.querySelector(s);

  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  let state = null;
  let me = ls.get('ls-me', null); // { key, name, team, row, num }
  let watching = false; // 등록 마감 후 들어온 구경 모드
  let current = null;
  let previous = null;
  let renderedRound = 0;

  const seatLabel = (row, num) => `${row}열 ${num}번`;
  const keyLabel = (key) => { const [r, n] = key.split('-'); return seatLabel(r, n); };

  // ---------- 화면 전환 ----------
  function show(name) {
    if (current === name) return;
    previous = current;
    current = name;
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 's-' + name));
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    const to = go.dataset.go;
    show(to === 'back' ? (previous && previous !== 'list' ? previous : 'wait') : to);
  });

  // ---------- 1. 입장 ----------
  $('#btn-start').addEventListener('click', () => {
    if (me) return show('wait');
    if (state && isClosed()) return startWatching();
    show('form');
  });

  // ---------- 2. 참여 정보 입력 ----------
  const fRow = $('#f-row');
  const fNum = $('#f-num');
  fRow.addEventListener('input', () => { fRow.value = fRow.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  fNum.addEventListener('input', () => { fNum.value = fNum.value.replace(/\D/g, ''); });
  document.querySelectorAll('.input').forEach((el) => el.addEventListener('input', () => el.classList.remove('error')));

  function seatError(msg) {
    const h = $('#seat-help');
    h.hidden = !msg;
    h.textContent = msg || '';
    h.classList.toggle('error', !!msg);
  }

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#f-name').value.trim();
    const team = $('#f-team').value.trim();
    const row = fRow.value.trim();
    const num = parseInt(fNum.value, 10);
    let bad = false;
    if (!name) { $('#f-name').classList.add('error'); bad = true; }
    if (!team) { $('#f-team').classList.add('error'); bad = true; }
    const seatMsg = store.seatProblem(row, num);
    seatError(seatMsg);
    if (seatMsg) {
      (CFG.seats[row] ? fNum : fRow).classList.add('error');
      bad = true;
    }
    if (bad) return toast(seatMsg && name && team ? '좌석 정보를 확인해주세요' : '입력하지 않은 항목이 있어요');

    const btn = $('#btn-submit');
    btn.disabled = true;
    const key = `${row}-${num}`;
    try {
      const res = await store.register({ key, name, team, row, num });
      if (res.ok) {
        me = { key, name, team, row, num };
        ls.set('ls-me', me);
        ls.del('ls-rev');
        ls.del('ls-won');
        renderWait();
        show('wait');
      } else if (res.reason === 'taken') {
        fRow.classList.add('error');
        fNum.classList.add('error');
        seatError('이미 등록된 좌석이에요. 좌석 번호를 다시 확인해주세요');
      } else {
        toast('참가 등록이 마감돼서 구경 모드로 들어가요');
        startWatching();
      }
    } catch (err) {
      console.error(err);
      toast('연결이 불안정해요. 다시 시도해주세요');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- 3. 대기 · 럭키 리스트 ----------
  function renderWait() {
    $('#wait-card').hidden = !me && !watching;
    $('#wait-ok').hidden = !me;
    $('#wait-watch').hidden = !!me;
    $('#wait-title').textContent = me ? `${me.name}님 · ${seatLabel(me.row, me.num)}` : '구경 중이에요';
    $('#wait-desc').textContent = me ? '참여가 완료되었어요!' : '등록이 마감돼서 당첨 대상이 아니에요';
  }

  const isClosed = () => !state.game.regOpen || state.game.round > 0;

  function startWatching() {
    watching = true;
    onState(state);
  }

  function renderPrizeList() {
    $('#prize-grid').innerHTML = Object.keys(CFG.prizes).sort((a, b) => a - b).map((rank) => {
      const p = CFG.prizes[rank];
      return `<div class="prize-card">
        <div class="prize-img"><img src="${p.img}" alt=""></div>
        <p class="pname">${p.listName}</p>
      </div>`;
    }).join('');
  }

  // ---------- 4~5. 라운드 ----------
  // 각자 내 좌석이 적힌 티켓 1장을 긁어서 당첨/꽝을 확인해요.
  // 하단 문구: 긁기 전 "두구두구~" → 열리면 당첨·꽝·구경 모드 모두 이번 라운드 당첨 좌석.
  function renderRound(round) {
    renderedRound = round;
    const prize = store.roundPrize(round);
    const winners = state.draws[round] || [];
    const isFinal = round === CFG.rounds.length;
    const won = !!me && winners.includes(me.key);
    const revealed = (ls.get('ls-rev', {})[round] || []).length > 0;

    $('#round-badge').textContent = isFinal ? 'FINAL ROUND' : `ROUND ${round}`;
    $('#round-sub').textContent = me ? '스크래치를 긁어 당첨 여부를 확인하세요' : '이번 라운드 당첨 좌석을 확인하세요';
    $('#round-img').src = prize.img;
    $('#round-name').textContent = `${prize.name} · ${prize.count}명`;

    const winnerSeats = winners.length
      ? winners.map((k) => { const p = state.participants[k]; return p ? seatLabel(p.row, p.num) : keyLabel(k); }).join(' / ')
      : '당첨자 없음';

    // 티켓을 새로 만들어요(이전 라운드의 긁기 캔버스 제거)
    const old = $('#ticket');
    const ticket = old.cloneNode(false);
    ticket.innerHTML = '<div class="ticket-head" id="ticket-seat"></div><div class="ticket-result" id="ticket-result"></div>';
    old.replaceWith(ticket);
    ticket.className = 'ticket' + (won ? ' win' : '') + (me ? '' : ' watch');
    $('#ticket-seat').textContent = me ? seatLabel(me.row, me.num) : '구경 중';
    $('#ticket-result').textContent = me ? (won ? '당첨' : '꽝') : '당첨 대상이 아니에요';

    // 긁어서 열릴 때는 덮개가 다 사라진 뒤(0.35초 페이드)에 하단 문구를 바꿔요.
    const finish = (afterFade) => {
      ticket.classList.add('revealed');
      if (afterFade) setTimeout(updateFoot, 400);
      else updateFoot();
    };
    if (!me || revealed) {
      finish();
    } else {
      window.ScratchCard(ticket, {
        onReveal: () => {
          const rev = ls.get('ls-rev', {});
          rev[round] = [0];
          ls.set('ls-rev', rev);
          finish(true);
          if (won) confetti(ticket);
          else ticket.classList.add('shake'); // 꽝: 티켓이 좌우로 살짝 흔들려요
        },
      });
    }

    function updateFoot() {
      const foot = $('#round-foot');
      const msg = me && !ticket.classList.contains('revealed') ? '두구두구~' : `이번 당첨 좌석 : ${winnerSeats}`;
      foot.innerHTML = `<p class="round-msg">${msg}</p>`;
    }
    updateFoot();
  }

  // ---------- 당첨 축하: 티켓에서 꽃가루가 터져요 ----------
  function confetti(fromEl) {
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    cv.width = innerWidth;
    cv.height = innerHeight;
    const colors = ['#50afff', '#ffd84d', '#0fb67f', '#ff6a55', '#b48cff'];
    const r = fromEl ? fromEl.getBoundingClientRect() : { left: 0, top: cv.height / 2.4, width: cv.width, height: 0 };
    const parts = Array.from({ length: 140 }, () => ({
      x: r.left + r.width / 2, y: r.top + r.height / 2,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 5 + Math.random() * 6, r: Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t - t0 < 2600) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }

  // ---------- 종료 ----------
  function renderEnd() {
    // 당첨자에게는 하단 카드로 당첨 상품을 다시 보여줘요.
    const wins = me ? Object.entries(state.draws).filter(([, keys]) => keys.includes(me.key)) : [];
    $('#end-card').hidden = !wins.length;
    if (wins.length) {
      const prize = store.roundPrize(Number(wins[0][0]));
      $('#end-title').textContent = `${prize.name} 당첨!`;
      $('#end-desc').textContent = `${me.name}님, 경품은 사무실로 전달해 드릴게요`;
    }
  }

  // ---------- 상태 동기화 ----------
  function onState(s) {
    state = s;
    // 같은 브라우저의 다른 탭에서 등록·초기화했을 수 있으니 내 등록 정보를 매번 다시 읽어요.
    const saved = ls.get('ls-me', null);
    if ((saved && saved.key) !== (me && me.key)) {
      me = saved;
      renderedRound = 0; // 내 자리 표시를 새 정보로 다시 그려요
    }
    // 진행자가 초기화했거나 내 등록이 삭제됐으면 처음부터
    if (me && !s.participants[me.key]) {
      me = null;
      ['ls-me', 'ls-rev', 'ls-won'].forEach(ls.del);
      renderedRound = 0;
      if (current !== 'form') show('intro');
    }
    renderWait();
    $('#btn-start').textContent = !me && isClosed() ? '구경하기' : '시작하기';

    const round = s.game.round;
    if (s.game.ended) {
      renderEnd();
      show('end');
    } else if (round > 0 && s.draws[round]) {
      if (renderedRound !== round) {
        show('round');
        renderRound(round);
      } else {
        show('round');
      }
    } else if (me || watching) {
      if (current !== 'list') show('wait');
    } else if (!current || current === 'wait' || current === 'round' || current === 'end') {
      show('intro');
    }
  }

  window.addEventListener('storage', (e) => {
    // 최신 상태로 다시 확인해요(테스트 모드는 저장소에서 바로 읽고, 실제 모드는 실시간으로 받은 상태를 써요).
    if (e.key === 'ls-me' && state) onState(store.current ? store.current() : state);
  });

  // ---------- 반응형: 화면 크기 비율 ----------
  // 시안 높이(852px)보다 낮은 화면에서만 --s를 1보다 작게 넣어요. 넓은 화면은 확대하지 않고 좌우로만 늘어나요.
  // 너비가 바뀌면(회전 등) 다시 계산하고, 키보드가 올라오거나 주소창이 접히는 정도의 높이 변화는 무시해요.
  let lastW = 0;
  let lastH = 0;
  function fitScale() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (lastW === w && (Math.abs(h - lastH) < 120 || document.activeElement?.tagName === 'INPUT')) return;
    lastW = w;
    lastH = h;
    const s = Math.min(1, Math.max(0.6, h / 852));
    document.documentElement.style.setProperty('--s', s.toFixed(3));
  }
  fitScale();
  window.addEventListener('resize', fitScale);

  // ---------- 시작 ----------
  if (store.mode === 'test') {
    const tag = document.createElement('div');
    tag.className = 'mode-tag';
    tag.textContent = '테스트 모드';
    document.body.appendChild(tag);
  }
  renderPrizeList();
  // 긁기 덮개 문구를 캔버스에 그리기 전에 폰트를 먼저 불러와요.
  const fontReady = document.fonts
    ? document.fonts.load("700 31px 'Pretendard Variable'", '럭키시트 복권을 긁어보세요').catch(() => {})
    : Promise.resolve();
  fontReady.then(() => store.subscribe(onState));
})();

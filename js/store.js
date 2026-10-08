// 데이터 저장소
// Firebase 설정이 있으면 Realtime Database를, 없으면 localStorage 테스트 모드를 써요.
// 화면 코드는 LS_STORE만 쓰기 때문에 저장 방식이 바뀌어도 화면은 그대로예요.
//
// 데이터 구조
//   game:         { round: 0~6, regOpen: true|false, ended: true|false }
//   participants: { "K-4": { name, team, row, num, ts } }
//   draws:        { "1": ["K-4", "B-7", "F-11"], ... }  // 라운드 번호 → 당첨 좌석

(function () {
  const CFG = window.LS_CONFIG;
  const EMPTY = () => ({ game: { round: 0, regOpen: true, ended: false }, participants: {}, draws: {} });

  function normalize(s) {
    const base = EMPTY();
    if (!s) return base;
    return {
      game: Object.assign(base.game, s.game || {}),
      participants: s.participants || {},
      draws: s.draws || {},
    };
  }

  // 이전 라운드 당첨자를 빼고 남은 참가자 중에서 count명을 뽑아요.
  function pickWinners(state, count) {
    const won = new Set(Object.values(state.draws).flat());
    const pool = Object.keys(state.participants).filter((k) => !won.has(k));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  // 좌석 검사: 정상이면 null, 아니면 안내 문구를 돌려줘요.
  function seatProblem(row, num) {
    const rows = Object.keys(CFG.seats);
    const ranges = CFG.seats[row];
    if (!ranges) return `열은 ${rows[0]}~${rows[rows.length - 1]} 중에서 입력해주세요`;
    if (!num) return '좌석 번호를 입력해주세요';
    const max = Math.max(...ranges.map((r) => r[1]));
    if (num < 1 || num > max) return `${row}열은 1~${max}번까지 있어요`;
    if (!ranges.some(([a, b]) => num >= a && num <= b)) return `${row}열 ${num}번은 없는 좌석이에요`;
    return null;
  }

  function allSeats() {
    return Object.entries(CFG.seats).flatMap(([row, ranges]) =>
      ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => ({ row, num: a + i }))));
  }

  function roundPrize(round) {
    const rank = CFG.rounds[round - 1];
    return Object.assign({ rank }, CFG.prizes[rank]);
  }

  // ---------- 테스트 모드 (localStorage) ----------
  function mockBackend() {
    const KEY = 'luckyseat-mock';
    const listeners = [];
    const read = () => normalize(JSON.parse(localStorage.getItem(KEY) || 'null'));
    const write = (s) => {
      localStorage.setItem(KEY, JSON.stringify(s));
      listeners.forEach((cb) => cb(read()));
    };
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) listeners.forEach((cb) => cb(read()));
    });
    return {
      mode: 'test',
      subscribe(cb) { listeners.push(cb); cb(read()); },
      current: read,
      async register(p) {
        const s = read();
        if (!s.game.regOpen || s.game.round > 0) return { ok: false, reason: 'closed' };
        if (s.participants[p.key]) return { ok: false, reason: 'taken' };
        s.participants[p.key] = { name: p.name, team: p.team, row: p.row, num: p.num, ts: Date.now() };
        write(s);
        return { ok: true };
      },
      async startRound(round) {
        const s = read();
        s.draws[round] = pickWinners(s, roundPrize(round).count);
        s.game.round = round;
        s.game.regOpen = false;
        write(s);
      },
      async endGame() { const s = read(); s.game.ended = true; write(s); },
      async setRegOpen(open) { const s = read(); s.game.regOpen = open; write(s); },
      async removeParticipant(key) { const s = read(); delete s.participants[key]; write(s); },
      async reset() { write(EMPTY()); },
      async addDummies(n) {
        const s = read();
        const names = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
        const free = allSeats().filter(({ row, num }) => !s.participants[`${row}-${num}`]);
        let added = 0;
        for (let i = 0; added < n && free.length; i++) {
          const { row, num } = free.splice(Math.floor(Math.random() * free.length), 1)[0];
          const key = `${row}-${num}`;
          s.participants[key] = { name: names[i % 10] + '테스트' + (added + 1), team: '테스트팀', row, num, ts: Date.now() };
          added++;
        }
        write(s);
      },
    };
  }

  // ---------- Firebase Realtime Database ----------
  function firebaseBackend() {
    firebase.initializeApp(CFG.firebase);
    const root = firebase.database().ref('luckyseat');
    return {
      mode: 'live',
      subscribe(cb) { root.on('value', (snap) => cb(normalize(snap.val()))); },
      async register(p) {
        // 1라운드가 시작되면 등록을 받지 않아요. 늦게 온 사람은 구경만 해요.
        const game = (await root.child('game').get()).val() || {};
        if (game.regOpen === false || game.round > 0) return { ok: false, reason: 'closed' };
        // transaction으로 같은 좌석을 두 사람이 동시에 등록하는 경우를 막아요.
        const res = await root.child('participants/' + p.key).transaction((cur) => {
          if (cur) return; // 이미 있으면 중단
          return { name: p.name, team: p.team, row: p.row, num: p.num, ts: Date.now() };
        });
        return res.committed ? { ok: true } : { ok: false, reason: 'taken' };
      },
      async startRound(round) {
        const s = normalize((await root.get()).val());
        const winners = pickWinners(s, roundPrize(round).count);
        await root.update({ ['draws/' + round]: winners, 'game/round': round, 'game/regOpen': false });
      },
      async endGame() { await root.child('game/ended').set(true); },
      async setRegOpen(open) { await root.child('game/regOpen').set(open); },
      async removeParticipant(key) { await root.child('participants/' + key).remove(); },
      async reset() { await root.set(EMPTY()); },
      async addDummies() { alert('실제 모드에서는 테스트 참가자를 만들 수 없어요.'); },
    };
  }

  const backend = CFG.firebase ? firebaseBackend() : mockBackend();
  window.LS_STORE = Object.assign(backend, { roundPrize, seatProblem });
})();

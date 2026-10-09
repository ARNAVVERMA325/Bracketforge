import { describe, it, expect } from 'vitest';
import { buildBracket, applyResult, clearResult, getPodium, generateRoundRobin, getTvSections, MatchData, Player } from './bracket';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1, status: 'checked_in' }));

let counter = 0;
const build = (n: number, bronze = false) => {
  counter = 0;
  return buildBracket(players(n), 'single_elimination', bronze, () => `m${counter++}`);
};
const round = (ms: MatchData[], r: number) => ms.filter((m) => m.bracket_side === 'winners' && m.round === r);

/** plays every playable match, always letting player1 win; returns final state */
function playAll(ms: MatchData[], pick: (m: MatchData) => string = (m) => m.player1_id!) {
  let cur = ms;
  for (let guard = 0; guard < 500; guard++) {
    const next = cur.find((m) => m.status !== 'completed' && !m.is_bye && m.player1_id && m.player2_id);
    if (!next) break;
    cur = applyResult(cur, next.id as string, pick(next), '2-0').matches;
  }
  return cur;
}

describe.each([3, 8, 11, 16])('single elimination with %i players', (n) => {
  const size = 2 ** Math.ceil(Math.log2(n));
  const ms = build(n);

  it('has bracketSize-1 matches and the right number of byes', () => {
    expect(ms.length).toBe(size - 1);
    expect(ms.filter((m) => m.is_bye).length).toBe(size - n);
  });

  it('puts every player in round 1 exactly once', () => {
    const ids = round(ms, 1).flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean);
    expect(new Set(ids).size).toBe(n);
    expect(ids.length).toBe(n);
  });

  it('gives byes to the top seeds and advances bye winners into round 2', () => {
    const byes = round(ms, 1).filter((m) => m.is_bye);
    byes.forEach((b, i) => expect(Number(b.winner_id!.slice(1))).toBeLessThanOrEqual(size - n));
    const r2 = size > 2 ? round(ms, 2) : [];
    byes.forEach((b) => {
      const next = ms.find((m) => m.id === b.next_match_id)!;
      expect([next.player1_id, next.player2_id]).toContain(b.winner_id);
    });
    if (r2.length) expect(r2.every((m) => m.status === 'pending')).toBe(true);
  });

  it('can be played to a champion with n-1 real matches', () => {
    const done = playAll(ms);
    expect(done.filter((m) => m.status === 'completed' && !m.is_bye).length).toBe(n - 1);
    const podium = getPodium(done, false);
    expect(podium.champion).toBe('p1'); // player1 always wins and top seed is player1 slot
    expect(podium.runnerUp).toBeTruthy();
  });
});

describe('seeding', () => {
  it('8 players: 1v8, 4v5, 2v7, 3v6', () => {
    const pairs = round(build(8), 1).map((m) => [m.player1_id, m.player2_id]);
    expect(pairs).toEqual([['p1', 'p8'], ['p4', 'p5'], ['p2', 'p7'], ['p3', 'p6']]);
  });
  it('seeds 1 and 2 are in opposite halves (can only meet in the final)', () => {
    const ms = build(16);
    const r1 = round(ms, 1);
    const idx = (pid: string) => r1.findIndex((m) => m.player1_id === pid || m.player2_id === pid);
    expect(idx('p1')).toBeLessThan(4);
    expect(idx('p2')).toBeGreaterThanOrEqual(4);
  });
});

describe('3 players', () => {
  it('top seed gets the bye, 2 plays 3', () => {
    const r1 = round(build(3), 1);
    expect(r1.find((m) => m.is_bye)!.winner_id).toBe('p1');
    const real = r1.find((m) => !m.is_bye)!;
    expect([real.player1_id, real.player2_id].sort()).toEqual(['p2', 'p3']);
  });
  it('no bronze match is created with fewer than 4 players', () => {
    expect(build(3, true).some((m) => m.bracket_side === 'bronze')).toBe(false);
  });
});

describe('bronze match', () => {
  it('semifinal losers drop into the bronze match and third place is reported', () => {
    const done = playAll(build(8, true));
    const bronze = done.find((m) => m.bracket_side === 'bronze')!;
    expect(bronze.player1_id && bronze.player2_id).toBeTruthy();
    expect(bronze.status).toBe('completed');
    expect(getPodium(done, true).thirdPlace).toBe(bronze.winner_id);
  });
});

describe('result correction', () => {
  it('changing a winner clears everything that depended on it and the bracket can be replayed', () => {
    let ms = playAll(build(8));
    const first = round(ms, 1)[0]; // p1 beat p8
    const res = applyResult(ms, first.id as string, first.player2_id!, '2-1');
    ms = res.matches;
    expect(round(ms, 2)[0].player1_id).toBe('p8');
    expect(round(ms, 2)[0].status).toBe('pending');
    expect(ms.find((m) => m.bracket_side === 'winners' && m.round === 3)!.status).toBe('pending');
    expect(res.changed.length).toBeGreaterThan(2);
    ms = playAll(ms);
    expect(getPodium(ms, false).champion).toBeTruthy();
  });

  it('editing only the score keeps downstream results', () => {
    const ms = playAll(build(8));
    const first = round(ms, 1)[0];
    const res = applyResult(ms, first.id as string, first.winner_id!, '2-1');
    expect(res.changed).toEqual([first.id]);
    expect(res.matches.find((m) => m.id === first.id)!.score).toBe('2-1');
    expect(getPodium(res.matches, false).champion).toBe('p1');
  });

  it('clearResult undoes a result and its dependents', () => {
    const ms = playAll(build(4));
    const semi = round(ms, 1)[0];
    const res = clearResult(ms, semi.id as string);
    const final = round(res.matches, 2)[0];
    expect(final.status).toBe('pending');
    expect(final.player1_id).toBeNull();
    expect(res.matches.find((m) => m.id === semi.id)!.status).toBe('pending');
  });

  it('rejects invalid input', () => {
    const ms = build(8);
    const r2 = round(ms, 2)[0];
    expect(() => applyResult(ms, r2.id as string, 'p1')).toThrow('match_not_ready');
    const r1 = round(ms, 1)[0];
    expect(() => applyResult(ms, r1.id as string, 'p5')).toThrow('invalid_winner');
    expect(() => applyResult(ms, 'nope', 'p1')).toThrow('match_not_found');
  });

  it('does not mutate the input', () => {
    const ms = build(8);
    const snap = JSON.stringify(ms);
    applyResult(ms, round(ms, 1)[0].id as string, 'p1');
    expect(JSON.stringify(ms)).toBe(snap);
  });
});

describe('round robin', () => {
  it.each([4, 5, 6])('%i players: every pair meets exactly once', (n) => {
    const ms = generateRoundRobin(players(n));
    expect(ms.length).toBe((n * (n - 1)) / 2);
    const pairs = new Set(ms.map((m) => [m.player1_id, m.player2_id].sort().join('-')));
    expect(pairs.size).toBe(ms.length);
  });
});

describe('TV sections', () => {
  it('splits now / next / recent and ignores byes', () => {
    let ms = build(11); // 5 byes in round 1
    const ready = ms.filter((m) => !m.is_bye && m.player1_id && m.player2_id && m.round === 1);
    ms = ms.map((m) => (m.id === ready[0].id || m.id === ready[1].id ? { ...m, is_current: true, station: 'Station 1' } : m));
    const s0 = getTvSections(ms);
    expect(s0.now.length).toBe(2);
    expect(s0.now.every((m) => !m.is_bye)).toBe(true);
    expect(s0.next.length).toBeLessThanOrEqual(4);
    expect(s0.next.some((m) => m.is_current)).toBe(false);
    expect(s0.recent.length).toBe(0);
    ms = applyResult(ms, ready[0].id as string, ready[0].player1_id!, '2-0').matches;
    const s1 = getTvSections(ms);
    expect(s1.now.length).toBe(1);
    expect(s1.recent.map((m) => m.id)).toEqual([ready[0].id]);
  });
});

export interface Player {
  id: string;
  name: string;
  team_tag?: string;
  character_loadout?: string;
  seed: number | null;
  status: string;
}

export interface MatchData {
  id?: string;
  tournament_id?: string;
  round: number;
  match_index: number;
  bracket_side: string;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  loser_id: string | null;
  score: string;
  match_details: any[];
  status: string;
  next_match_id: string | null;
  next_loser_match_id: string | null;
  is_bye: boolean;
  is_current: boolean;
  scheduled_time: string | null;
  completed_at: string | null;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function seedPlayers(players: Player[], method: string): Player[] {
  const checkedIn = players.filter((p) => p.status === 'checked_in');
  if (method === 'random') {
    return shuffleArray(checkedIn);
  }
  if (method === 'registration_order') {
    return [...checkedIn].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  }
  // manual: use the seed order as-is
  return [...checkedIn].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
}

export function generateSingleElimination(players: Player[], hasBronzeMatch: boolean): MatchData[] {
  const seeded = players.map((p, i) => ({ ...p, seed: i + 1 }));
  const n = seeded.length;
  if (n < 2) return [];

  const bracketSize = nextPowerOfTwo(n);
  const numByes = bracketSize - n;
  const numRounds = Math.log2(bracketSize);

  const matches: MatchData[] = [];
  const slots: (Player | null)[] = new Array(bracketSize).fill(null);

  // Standard bracket seeding positions for proper seed placement
  const seedPositions = getSeedPositions(bracketSize);
  for (let i = 0; i < n; i++) {
    slots[seedPositions[i]] = seeded[i];
  }

  // First round matches
  const firstRoundMatches = bracketSize / 2;
  for (let i = 0; i < firstRoundMatches; i++) {
    const p1 = slots[i * 2];
    const p2 = slots[i * 2 + 1];
    const isBye = p1 && !p2;

    const match: MatchData = {
      round: 1,
      match_index: i,
      bracket_side: 'winners',
      player1_id: p1?.id ?? null,
      player2_id: p2?.id ?? null,
      winner_id: isBye ? p1!.id : null,
      loser_id: null,
      score: '',
      match_details: [],
      status: isBye ? 'completed' : 'pending',
      next_match_id: null,
      next_loser_match_id: null,
      is_bye: !!isBye,
      is_current: false,
      scheduled_time: null,
      completed_at: isBye ? new Date().toISOString() : null,
    };
    matches.push(match);
  }

  // Subsequent rounds
  for (let r = 2; r <= numRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        round: r,
        match_index: i,
        bracket_side: 'winners',
        player1_id: null,
        player2_id: null,
        winner_id: null,
        loser_id: null,
        score: '',
        match_details: [],
        status: 'pending',
        next_match_id: null,
        next_loser_match_id: null,
        is_bye: false,
        is_current: false,
        scheduled_time: null,
        completed_at: null,
      });
    }
  }

  // Link next_match_id (by index, will be resolved after DB insert)
  for (let r = 1; r < numRounds; r++) {
    const currentRoundStart = matches.filter((m) => m.round === r).length;
    const prevStart = matches.filter((m) => m.round < r).length;
    for (let i = 0; i < currentRoundStart; i++) {
      const matchIdx = prevStart + i;
      const nextRoundMatchIdx = matches.filter((m) => m.round <= r).length + Math.floor(i / 2);
      matches[matchIdx].next_match_id = `idx:${nextRoundMatchIdx}` as any;
    }
  }

  // Bronze match (3rd place) - link losers of semifinals
  if (hasBronzeMatch && numRounds >= 2) {
    const semifinalStart = matches.filter((m) => m.round < numRounds).length;
    const bronzeMatch: MatchData = {
      round: numRounds,
      match_index: 999, // special index for bronze
      bracket_side: 'bronze',
      player1_id: null,
      player2_id: null,
      winner_id: null,
      loser_id: null,
      score: '',
      match_details: [],
      status: 'pending',
      next_match_id: null,
      next_loser_match_id: null,
      is_bye: false,
      is_current: false,
      scheduled_time: null,
      completed_at: null,
    };
    matches.push(bronzeMatch);
  }

  return matches;
}

function getSeedPositions(size: number): number[] {
  // Generate standard tournament bracket seed positions
  const positions = [0, 1];
  while (positions.length < size) {
    const newPositions: number[] = [];
    const offset = positions.length * 2;
    for (const pos of positions) {
      newPositions.push(pos);
      newPositions.push(offset - 1 - pos);
    }
    positions.splice(0, positions.length, ...newPositions);
  }
  return positions;
}

export function generateRoundRobin(players: Player[]): MatchData[] {
  const n = players.length;
  if (n < 2) return [];

  const matches: MatchData[] = [];
  const playerList = [...players];

  // Odd number of players: add a "bye" as null
  if (n % 2 !== 0) {
    playerList.push(null as any);
  }

  const totalRounds = playerList.length - 1;
  const halfSize = playerList.length / 2;

  const arr = [...playerList];
  arr.splice(0, 1);
  const len = arr.length;

  for (let round = 0; round < totalRounds; round++) {
    let matchIdx = 0;
    const p0 = playerList[0];
    if (p0) {
      matches.push(createRRMatch(round + 1, matchIdx++, p0, arr[len - 1]));
    } else {
      matchIdx++;
    }

    for (let i = 1; i < halfSize; i++) {
      const p1 = arr[i - 1];
      const p2 = arr[len - 1 - i];
      if (p1 && p2) {
        matches.push(createRRMatch(round + 1, matchIdx++, p1, p2));
      } else {
        matchIdx++;
      }
    }

    // Rotate
    arr.unshift(arr.pop()!);
  }

  return matches;
}

function createRRMatch(round: number, matchIndex: number, p1: Player, p2: Player): MatchData {
  return {
    round,
    match_index: matchIndex,
    bracket_side: 'winners',
    player1_id: p1.id,
    player2_id: p2.id,
    winner_id: null,
    loser_id: null,
    score: '',
    match_details: [],
    status: 'pending',
    next_match_id: null,
    next_loser_match_id: null,
    is_bye: false,
    is_current: false,
    scheduled_time: null,
    completed_at: null,
  };
}

export function generateDoubleElimination(players: Player[]): MatchData[] {
  const winnersMatches = generateSingleElimination(players, false);
  // For double elim, we mark winners bracket and also create losers bracket
  // This is a simplified version - full double elim losers bracket is complex
  // We generate winners bracket matches, losers bracket will be created dynamically
  
  const matches: MatchData[] = winnersMatches.map((m) => ({ ...m, bracket_side: 'winners' }));
  
  const numRounds = Math.log2(nextPowerOfTwo(players.length));
  
  // Losers bracket - each round in losers bracket receives losers from winners bracket
  // Losers bracket has 2*numRounds - 1 rounds
  const losersRounds = 2 * numRounds - 1;
  for (let r = 1; r <= losersRounds; r++) {
    const matchesInRound = Math.pow(2, numRounds - Math.ceil(r / 2) - 1);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        round: r,
        match_index: i,
        bracket_side: 'losers',
        player1_id: null,
        player2_id: null,
        winner_id: null,
        loser_id: null,
        score: '',
        match_details: [],
        status: 'pending',
        next_match_id: null,
        next_loser_match_id: null,
        is_bye: false,
        is_current: false,
        scheduled_time: null,
        completed_at: null,
      });
    }
  }

  // Grand final
  matches.push({
    round: numRounds + 1,
    match_index: 0,
    bracket_side: 'grand',
    player1_id: null,
    player2_id: null,
    winner_id: null,
    loser_id: null,
    score: '',
    match_details: [],
    status: 'pending',
    next_match_id: null,
    next_loser_match_id: null,
    is_bye: false,
    is_current: false,
    scheduled_time: null,
    completed_at: null,
  });

  return matches;
}

export function generateBracket(players: Player[], format: string, hasBronzeMatch: boolean): MatchData[] {
  switch (format) {
    case 'single_elimination':
      return generateSingleElimination(players, hasBronzeMatch);
    case 'double_elimination':
      return generateDoubleElimination(players);
    case 'round_robin':
      return generateRoundRobin(players);
    default:
      return generateSingleElimination(players, hasBronzeMatch);
  }
}

export interface ResolvedMatch extends MatchData {
  id: string;
  player1_name?: string;
  player2_name?: string;
  player1_tag?: string;
  player2_tag?: string;
  winner_name?: string;
}

export function resolveNextMatches(matches: MatchData[]): MatchData[] {
  const withIds = matches.filter((m) => m.id);
  return matches.map((m, i) => {
    if (m.next_match_id && typeof m.next_match_id === 'string' && (m.next_match_id as string).startsWith('idx:')) {
      const targetIdx = parseInt((m.next_match_id as string).slice(4));
      return { ...m, next_match_id: withIds[targetIdx]?.id ?? null };
    }
    return m;
  });
}

export function advanceWinner(matches: MatchData[], matchId: string, winnerId: string): MatchData[] {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return matches;

  const updated = matches.map((m) =>
    m.id === matchId
      ? { ...m, winner_id: winnerId, status: 'completed' as const, completed_at: new Date().toISOString() }
      : m
  );

  // Find next match and place the winner
  if (match.next_match_id) {
    const nextMatch = updated.find((m) => m.id === match.next_match_id);
    if (nextMatch) {
      const isPlayer1Slot = match.match_index % 2 === 0;
      updated.forEach((m) => {
        if (m.id === nextMatch.id) {
          if (isPlayer1Slot) {
            m.player1_id = winnerId;
          } else {
            m.player2_id = winnerId;
          }
          if (m.player1_id && m.player2_id && m.status === 'pending') {
            // Both players present - match ready (but keep pending until started)
          }
        }
      });
    }
  }

  return updated;
}

export function correctResult(matches: MatchData[], matchId: string): MatchData[] {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return matches;

  const updated = matches.map((m) =>
    m.id === matchId
      ? { ...m, winner_id: null, status: 'pending' as const, score: '', completed_at: null }
      : m
  );

  // Cascade: reset all downstream matches that had the old winner
  if (match.next_match_id) {
    const downstream = updated.filter((m) => m.id === match.next_match_id);
    for (const dm of downstream) {
      if (dm.player1_id === match.winner_id) dm.player1_id = null;
      if (dm.player2_id === match.winner_id) dm.player2_id = null;
      dm.winner_id = null;
      dm.status = 'pending';
      dm.score = '';
      dm.completed_at = null;
    }
  }

  return updated;
}

export function getPodium(matches: MatchData[], hasBronze: boolean): {
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
} {
  const completed = matches.filter((m) => m.status === 'completed' && m.winner_id);
  
  // Find the final match (highest round in winners bracket)
  const winnersMatches = completed.filter((m) => m.bracket_side === 'winners' || m.bracket_side === 'grand');
  const finalMatch = winnersMatches.sort((a, b) => b.round - a.round)[0];
  
  let champion = finalMatch?.winner_id ?? null;
  let runnerUp = finalMatch?.loser_id ?? null;

  // For single elim, runner up is the loser of the final
  if (!runnerUp && finalMatch) {
    runnerUp = finalMatch.player1_id === champion ? finalMatch.player2_id : finalMatch.player1_id;
  }

  let thirdPlace: string | null = null;
  if (hasBronze) {
    const bronzeMatch = completed.find((m) => m.bracket_side === 'bronze');
    thirdPlace = bronzeMatch?.winner_id ?? null;
  }

  return { champion, runnerUp, thirdPlace };
}

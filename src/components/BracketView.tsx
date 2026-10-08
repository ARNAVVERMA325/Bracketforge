import { MatchStatus, FORMAT_SHORT } from '@/config/app';
import { Trophy, Users } from 'lucide-react';

export interface BracketMatch {
  id: string;
  round: number;
  match_index: number;
  bracket_side: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name?: string;
  player2_name?: string;
  player1_tag?: string;
  player2_tag?: string;
  winner_id: string | null;
  score: string;
  status: string;
  is_bye: boolean;
  is_current: boolean;
  next_match_id: string | null;
}

interface BracketViewProps {
  matches: BracketMatch[];
  format: string;
  onMatchClick?: (match: BracketMatch) => void;
  compact?: boolean;
}

function playerDisplayName(name?: string, tag?: string): string {
  if (!name && !tag) return 'TBD';
  if (tag && name) return tag;
  return name || 'TBD';
}

function MatchCard({ match, onClick, compact }: { match: BracketMatch; onClick?: () => void; compact?: boolean }) {
  const p1 = match.player1_name;
  const p2 = match.player2_name;
  const p1Tag = match.player1_tag;
  const p2Tag = match.player2_tag;
  const p1Winner = match.winner_id === match.player1_id;
  const p2Winner = match.winner_id === match.player2_id;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border transition-all ${
        match.is_current
          ? 'border-crimson-500 bg-crimson-600/5 shadow-lg shadow-crimson-600/10'
          : match.status === 'completed'
          ? 'border-ink-600 bg-ink-850'
          : 'border-ink-700 bg-ink-850 hover:border-ink-500'
      } ${onClick ? 'cursor-pointer' : ''} ${compact ? 'p-2' : 'p-3'}`}
    >
      {match.is_current && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-crimson-500 animate-live-dot" />
          <span className="text-[10px] font-bold text-crimson-400 uppercase tracking-wider">On Now</span>
        </div>
      )}
      <div className={`flex items-center justify-between gap-2 ${compact ? 'py-1' : 'py-1.5'}`}>
        <span className={`text-sm truncate flex-1 ${
          p1Winner ? 'text-white font-semibold' : match.is_bye ? 'text-gray-600' : 'text-gray-400'
        }`}>
          {match.is_bye && !p2 ? 'BYE' : playerDisplayName(p1, p1Tag)}
        </span>
        {p1Winner && <Trophy size={12} className="text-electric-400 shrink-0" />}
      </div>
      <div className={`flex items-center justify-between gap-2 border-t border-ink-700 ${compact ? 'pt-1 mt-1' : 'pt-1.5 mt-1.5'}`}>
        <span className={`text-sm truncate flex-1 ${
          p2Winner ? 'text-white font-semibold' : !p2 ? 'text-gray-600 italic' : 'text-gray-400'
        }`}>
          {!p2 && !match.is_bye ? 'TBD' : playerDisplayName(p2, p2Tag)}
        </span>
        {p2Winner && <Trophy size={12} className="text-electric-400 shrink-0" />}
      </div>
      {match.score && (
        <div className="text-xs text-gray-500 mt-1 text-center">{match.score}</div>
      )}
    </div>
  );
}

export default function BracketView({ matches, format, onMatchClick, compact }: BracketViewProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="text-gray-700 mb-3" />
        <p className="text-gray-500 text-sm">Bracket has not been generated yet.</p>
      </div>
    );
  }

  // Separate by bracket side
  const winnersMatches = matches.filter((m) => m.bracket_side === 'winners' || m.bracket_side === 'grand');
  const losersMatches = matches.filter((m) => m.bracket_side === 'losers');
  const bronzeMatch = matches.filter((m) => m.bracket_side === 'bronze');

  // Group winners matches by round
  const winnersByRound = new Map<number, BracketMatch[]>();
  winnersMatches.forEach((m) => {
    if (!winnersByRound.has(m.round)) winnersByRound.set(m.round, []);
    winnersByRound.get(m.round)!.push(m);
  });
  const sortedWinnerRounds = Array.from(winnersByRound.keys()).sort((a, b) => a - b);

  // Group losers matches by round
  const losersByRound = new Map<number, BracketMatch[]>();
  losersMatches.forEach((m) => {
    if (!losersByRound.has(m.round)) losersByRound.set(m.round, []);
    losersByRound.get(m.round)!.push(m);
  });
  const sortedLoserRounds = Array.from(losersByRound.keys()).sort((a, b) => a - b);

  const roundLabels: Record<number, string> = {};
  const maxRound = sortedWinnerRounds[sortedWinnerRounds.length - 1] || 0;
  if (maxRound === 1) roundLabels[1] = 'Final';
  else if (maxRound === 2) { roundLabels[2] = 'Final'; roundLabels[1] = 'Semifinals'; }
  else if (maxRound === 3) { roundLabels[3] = 'Final'; roundLabels[2] = 'Semifinals'; roundLabels[1] = 'Quarterfinals'; }
  else if (maxRound === 4) { roundLabels[4] = 'Final'; roundLabels[3] = 'Semifinals'; roundLabels[2] = 'Quarterfinals'; roundLabels[1] = 'Round of 16'; }
  else if (maxRound === 5) { roundLabels[5] = 'Final'; roundLabels[4] = 'Semifinals'; roundLabels[3] = 'Quarterfinals'; roundLabels[2] = 'Round of 16'; roundLabels[1] = 'Round of 32'; }
  else { roundLabels[maxRound] = 'Final'; roundLabels[maxRound - 1] = 'Semifinals'; roundLabels[maxRound - 2] = 'Quarterfinals'; }

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="inline-flex gap-4 sm:gap-6 p-2 min-w-full">
        {/* Winners Bracket */}
        {sortedWinnerRounds.map((round) => (
          <div key={`w-${round}`} className="flex flex-col">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center px-2">
              {roundLabels[round] || `Round ${round}`}
            </div>
            <div className="flex flex-col justify-around gap-3 flex-1 min-w-[140px]">
              {(winnersByRound.get(round) || []).map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Bronze Match */}
        {bronzeMatch.length > 0 && (
          <div className="flex flex-col">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center px-2">
              3rd Place
            </div>
            <div className="flex flex-col justify-around gap-3 flex-1 min-w-[140px]">
              {bronzeMatch.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        )}

        {/* Losers Bracket */}
        {sortedLoserRounds.length > 0 && (
          <div className="flex flex-col border-l border-ink-700 pl-4 sm:pl-6">
            <div className="text-xs font-semibold text-crimson-500/70 uppercase tracking-wider mb-3 text-center">
              Losers Bracket
            </div>
            <div className="flex gap-4 sm:gap-6">
              {sortedLoserRounds.map((round) => (
                <div key={`l-${round}`} className="flex flex-col">
                  <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mb-3 text-center">
                    L{round}
                  </div>
                  <div className="flex flex-col justify-around gap-3 flex-1 min-w-[120px]">
                    {(losersByRound.get(round) || []).map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                        compact={compact}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

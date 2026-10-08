/*
# Create matches table

1. New Tables
- `matches`: Individual matches within a tournament bracket.
  - `id` (uuid, PK)
  - `tournament_id` (uuid, FK to tournaments, ON DELETE CASCADE)
  - `round` (integer — round number, 1 = first round)
  - `match_index` (integer — position within the round)
  - `bracket_side` (text — 'winners' for winners bracket, 'losers' for losers bracket (double elim), 'grand' for grand final, 'bronze' for bronze match)
  - `player1_id` (uuid, FK to players, nullable — bye if null)
  - `player2_id` (uuid, FK to players, nullable — bye if null)
  - `winner_id` (uuid, FK to players, nullable)
  - `loser_id` (uuid, FK to players, nullable)
  - `score` (text — free text score like "2-1" or "3-0")
  - `match_details` (jsonb — optional per-game details: characters picked, per-game scores, etc.)
  - `status` (text — 'pending', 'in_progress', 'completed'; default 'pending')
  - `next_match_id` (uuid, FK to matches — the match the winner advances to)
  - `next_loser_match_id` (uuid, FK to matches — for double elim, the match the loser drops to)
  - `is_bye` (boolean — true if this is a bye match, auto-resolved)
  - `is_current` (boolean — marked by organizer/referee as "on now")
  - `scheduled_time` (timestamptz — optional scheduled match time)
  - `completed_at` (timestamptz)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `matches`.
- Public (anon) can SELECT matches for public/unlisted tournaments.
- Only the tournament organizer can UPDATE/INSERT/DELETE matches.
- A referee role is handled via a separate referees table (later migration).

3. Important Notes
- `next_match_id` and `next_loser_match_id` create the bracket tree structure.
- Byes are matches where one player is null — auto-resolved with the other player as winner.
- `match_details` stores per-game info as JSON for flexibility (characters, maps, etc.).
*/

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  match_index integer NOT NULL DEFAULT 0,
  bracket_side text NOT NULL DEFAULT 'winners' CHECK (bracket_side IN ('winners', 'losers', 'grand', 'bronze')),
  player1_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES players(id) ON DELETE SET NULL,
  winner_id uuid REFERENCES players(id) ON DELETE SET NULL,
  loser_id uuid REFERENCES players(id) ON DELETE SET NULL,
  score text DEFAULT '',
  match_details jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  next_match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  next_loser_match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  is_bye boolean NOT NULL DEFAULT false,
  is_current boolean NOT NULL DEFAULT false,
  scheduled_time timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- SELECT: public can see matches (bracket display); organizer sees their own
DROP POLICY IF EXISTS "matches_select_public_or_organizer" ON matches;
CREATE POLICY "matches_select_public_or_organizer" ON matches FOR SELECT
TO anon, authenticated USING (true);

-- INSERT: only organizer
DROP POLICY IF EXISTS "matches_insert_organizer" ON matches;
CREATE POLICY "matches_insert_organizer" ON matches FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = matches.tournament_id AND tournaments.organizer_id = auth.uid())
);

-- UPDATE: only organizer
DROP POLICY IF EXISTS "matches_update_organizer" ON matches;
CREATE POLICY "matches_update_organizer" ON matches FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = matches.tournament_id AND tournaments.organizer_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = matches.tournament_id AND tournaments.organizer_id = auth.uid())
);

-- DELETE: only organizer
DROP POLICY IF EXISTS "matches_delete_organizer" ON matches;
CREATE POLICY "matches_delete_organizer" ON matches FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = matches.tournament_id AND tournaments.organizer_id = auth.uid())
);

-- Grants
GRANT SELECT ON matches TO anon, authenticated;
GRANT INSERT ON matches TO authenticated;
GRANT UPDATE ON matches TO authenticated;
GRANT DELETE ON matches TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- updated_at trigger
DROP TRIGGER IF EXISTS matches_updated_at ON matches;
CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

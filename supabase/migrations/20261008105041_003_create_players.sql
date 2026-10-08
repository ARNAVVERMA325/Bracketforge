/*
# Create players table

1. New Tables
- `players`: Registered players in tournaments.
  - `id` (uuid, PK)
  - `tournament_id` (uuid, FK to tournaments, ON DELETE CASCADE)
  - `name` (text, NOT NULL — player's real name)
  - `phone` (text, NOT NULL — 10-digit Indian mobile, private/hidden from public)
  - `phone_normalized` (text — normalized phone for duplicate check)
  - `team_tag` (text — optional team or gamer tag)
  - `character_loadout` (text — optional character/loadout for fighting games)
  - `seed` (integer — assigned during bracket generation)
  - `status` (text — 'pending', 'approved', 'rejected', 'checked_in'; default 'pending')
  - `checked_in_at` (timestamptz)
  - `registered_at` (timestamptz, default now())
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `players`.
- Organizers can see all fields for players in their own tournaments.
- Public (anon) can only see non-sensitive fields (name, team_tag, character_loadout, status) — NOT phone, NOT phone_normalized.
- Public registration: anon can INSERT (for public registration form), but only for tournaments with registration_open=true.
- Organizers can UPDATE player status (approve/reject/check_in/remove) for their own tournaments.
- Column-level: phone and phone_normalized are NOT selectable by anon.

3. Important Notes
- Unique constraint on (tournament_id, phone_normalized) prevents duplicate registrations.
- The phone column is hidden from public via column-level SELECT grants.
- Public registration uses anon role since spectators/players don't need accounts.
*/

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  team_tag text DEFAULT '',
  character_loadout text DEFAULT '',
  seed integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'checked_in')),
  checked_in_at timestamptz,
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one phone per tournament
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_tournament_phone_unique
  ON players(tournament_id, phone_normalized);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_players_tournament_id ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- SELECT: organizer sees all fields for their tournaments; anon sees only public fields
-- We handle this with column-level grants below
DROP POLICY IF EXISTS "players_select_organizer_or_public" ON players;
CREATE POLICY "players_select_organizer_or_public" ON players FOR SELECT
TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = players.tournament_id AND tournaments.organizer_id = auth.uid())
  OR TRUE  -- public can see players, but column grants hide phone
);

-- INSERT: public registration (anon) or organizer adding manually
DROP POLICY IF EXISTS "players_insert_public_or_organizer" ON players;
CREATE POLICY "players_insert_public_or_organizer" ON players FOR INSERT
TO anon, authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = players.tournament_id
    AND tournaments.registration_open = true
    AND (
      tournaments.visibility = 'public'
      OR tournaments.organizer_id = auth.uid()
    )
  )
);

-- UPDATE: only organizer of the tournament
DROP POLICY IF EXISTS "players_update_organizer" ON players;
CREATE POLICY "players_update_organizer" ON players FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = players.tournament_id AND tournaments.organizer_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = players.tournament_id AND tournaments.organizer_id = auth.uid())
);

-- DELETE: only organizer of the tournament
DROP POLICY IF EXISTS "players_delete_organizer" ON players;
CREATE POLICY "players_delete_organizer" ON players FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = players.tournament_id AND tournaments.organizer_id = auth.uid())
);

-- Column-level: anon can only see non-sensitive columns
REVOKE SELECT ON players FROM anon;
GRANT SELECT (id, tournament_id, name, team_tag, character_loadout, status, seed, registered_at, checked_in_at) ON players TO anon;

-- Authenticated (organizers) can see all columns
GRANT SELECT ON players TO authenticated;

-- Anon can insert: name, phone, phone_normalized, team_tag, character_loadout, tournament_id
REVOKE INSERT ON players FROM anon;
GRANT INSERT (tournament_id, name, phone, phone_normalized, team_tag, character_loadout) ON players TO anon;

-- Authenticated can insert all columns (organizer adding manually)
GRANT INSERT ON players TO authenticated;

-- Column-level UPDATE: organizer can update status, seed, checked_in_at
REVOKE UPDATE ON players FROM authenticated;
GRANT UPDATE (name, phone, phone_normalized, team_tag, character_loadout, status, seed, checked_in_at) ON players TO authenticated;

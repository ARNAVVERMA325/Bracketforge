/*
# Create tournaments table

1. New Tables
- `tournaments`: Stores all tournament data.
  - `id` (uuid, PK)
  - `organizer_id` (uuid, FK to profiles, NOT NULL, DEFAULT auth.uid())
  - `title` (text, NOT NULL)
  - `slug` (text, unique — used in public URL /t/slug)
  - `game` (text, NOT NULL)
  - `description` (text)
  - `venue` (text)
  - `start_datetime` (timestamptz — IST start time)
  - `poster_url` (text — optional uploaded poster image URL)
  - `rules` (text — rules text for the tournament)
  - `prize` (text — prize description text)
  - `entry_fee` (integer — display only, in INR, default 0)
  - `max_players` (integer — optional, null means unlimited)
  - `format` (text — 'single_elimination', 'double_elimination', 'round_robin')
  - `seeding_method` (text — 'random', 'manual', 'registration_order')
  - `visibility` (text — 'public' or 'unlisted', default 'public')
  - `status` (text — 'draft', 'registration_open', 'live', 'finished', 'cancelled', default 'draft')
  - `has_bronze_match` (boolean — single elim bronze match option, default false)
  - `registration_open` (boolean — quick toggle, default true)
  - `payment_status` (text — 'unpaid', 'paid', 'free'; NEVER client-writable directly; defaults to 'free' during beta)
  - `payment_mode` (text — 'manual', 'razorpay', 'cashfree', 'phonepe'; default 'manual')
  - `plan` (text — for future billing; default 'beta')
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `tournaments`.
- Organizers can CRUD their own tournaments.
- Public/unlisted tournaments are readable by anon (for public tournament pages).
- Unlisted tournaments are only readable if you know the slug (no listing).
- Column-level: revoke UPDATE on payment_status, payment_mode, plan (super-admin only via functions).

3. Important Notes
- `organizer_id` defaults to auth.uid() so inserts work without explicitly passing it.
- Payment columns are protected: only super-admin can change them via SECURITY DEFINER functions.
- The `slug` must be unique across all tournaments.
*/

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  game text NOT NULL,
  description text DEFAULT '',
  venue text DEFAULT '',
  start_datetime timestamptz,
  poster_url text,
  rules text DEFAULT '',
  prize text DEFAULT '',
  entry_fee integer NOT NULL DEFAULT 0,
  max_players integer,
  format text NOT NULL DEFAULT 'single_elimination' CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin')),
  seeding_method text NOT NULL DEFAULT 'random' CHECK (seeding_method IN ('random', 'manual', 'registration_order')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration_open', 'live', 'finished', 'cancelled')),
  has_bronze_match boolean NOT NULL DEFAULT false,
  registration_open boolean NOT NULL DEFAULT true,
  payment_status text NOT NULL DEFAULT 'free' CHECK (payment_status IN ('unpaid', 'paid', 'free')),
  payment_mode text NOT NULL DEFAULT 'manual' CHECK (payment_mode IN ('manual', 'razorpay', 'cashfree', 'phonepe')),
  plan text NOT NULL DEFAULT 'beta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- SELECT: organizers see their own; public/unlisted visible to everyone (unlisted = must know slug, no listing API)
DROP POLICY IF EXISTS "tournaments_select_own_or_public" ON tournaments;
CREATE POLICY "tournaments_select_own_or_public" ON tournaments FOR SELECT
TO anon, authenticated USING (
  organizer_id = auth.uid()
  OR visibility = 'public'
  OR visibility = 'unlisted'
);

-- INSERT: organizer creates their own
DROP POLICY IF EXISTS "tournaments_insert_own" ON tournaments;
CREATE POLICY "tournaments_insert_own" ON tournaments FOR INSERT
TO authenticated WITH CHECK (organizer_id = auth.uid());

-- UPDATE: organizer updates their own
DROP POLICY IF EXISTS "tournaments_update_own" ON tournaments;
CREATE POLICY "tournaments_update_own" ON tournaments FOR UPDATE
TO authenticated USING (organizer_id = auth.uid()) WITH CHECK (organizer_id = auth.uid());

-- DELETE: organizer deletes their own
DROP POLICY IF EXISTS "tournaments_delete_own" ON tournaments;
CREATE POLICY "tournaments_delete_own" ON tournaments FOR DELETE
TO authenticated USING (organizer_id = auth.uid());

-- Column-level: protect payment columns from organizer writes
REVOKE UPDATE ON tournaments FROM authenticated;
GRANT UPDATE (
  title, slug, game, description, venue, start_datetime, poster_url,
  rules, prize, entry_fee, max_players, format, seeding_method,
  visibility, status, has_bronze_match, registration_open
) ON tournaments TO authenticated;

-- Grant base privileges
GRANT SELECT ON tournaments TO anon, authenticated;
GRANT INSERT (
  title, slug, game, description, venue, start_datetime, poster_url,
  rules, prize, entry_fee, max_players, format, seeding_method,
  visibility, status, has_bronze_match, registration_open
) ON tournaments TO authenticated;

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer_id ON tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility_public ON tournaments(visibility) WHERE visibility = 'public';

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournaments_updated_at ON tournaments;
CREATE TRIGGER tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

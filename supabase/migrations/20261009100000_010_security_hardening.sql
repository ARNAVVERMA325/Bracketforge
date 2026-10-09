/*
# 010 Security hardening (step 1)

Fixes from the audit:
1. players: phones were readable by ANY signed-in user (policy had `OR TRUE`). Now only the
   tournament's organizer and the super-admin can read the base table. Anon has no table access.
2. Public reads go through ONE function, public_tournament_bundle(slug): returns tournament,
   safe player fields (never phone) and matches in a single round trip. Also "unlisted" is now
   truly unlisted (no table listing; you need the slug). This is also the basis of the public JSON API.
3. Registration goes through register_player(): server-side phone/name validation, max-player
   check (row-locked, no race), duplicate check, and per-IP rate limit. Direct anon INSERT removed.
4. Disabled organizers are blocked from every write (RESTRICTIVE policies).
5. Payment gate enforced in the database: unpaid tournaments cannot go 'live' unless
   free_during_beta. payment_status on insert is derived from the beta flag, never client-chosen.
6. Super-admin can read everything (policies), organizers only their own.
7. Poster bucket: 2 MB limit and jpeg/png/webp only, enforced by storage itself.

Error codes returned by register_player (in jsonb {ok:false,error:...}):
invalid_phone, invalid_name, registration_closed, tournament_full, already_registered.
A rate-limit hit raises the exception 'rate_limited'.
*/

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION current_user_disabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_disabled FROM profiles WHERE id = auth.uid()), false);
$$;
REVOKE EXECUTE ON FUNCTION current_user_disabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_disabled() TO authenticated;

-- Simple DB-level rate limiter (portable, no extra service). Internal only.
CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_ts ON rate_limits(key, ts);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION check_rate_limit(p_key text, p_max integer, p_window interval)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF random() < 0.02 THEN
    DELETE FROM rate_limits WHERE ts < now() - interval '1 day';
  END IF;
  IF (SELECT count(*) FROM rate_limits WHERE key = p_key AND ts > now() - p_window) >= p_max THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  INSERT INTO rate_limits(key) VALUES (p_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, interval) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- tournaments
DROP POLICY IF EXISTS "tournaments_select_own_or_public" ON tournaments;
CREATE POLICY "tournaments_select_own_or_admin" ON tournaments FOR SELECT
  TO authenticated USING (organizer_id = auth.uid() OR is_super_admin());
REVOKE SELECT ON tournaments FROM anon;

-- default is now 'unpaid'; the trigger below decides the real value on insert
ALTER TABLE tournaments ALTER COLUMN payment_status SET DEFAULT 'unpaid';

CREATE OR REPLACE FUNCTION tournaments_payment_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_beta boolean;
BEGIN
  SELECT free_during_beta INTO v_beta FROM app_settings WHERE id = 1;
  v_beta := COALESCE(v_beta, false);

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status := CASE WHEN v_beta THEN 'free' ELSE 'unpaid' END;
    NEW.payment_mode := 'manual';
    NEW.plan := CASE WHEN v_beta THEN 'beta' ELSE 'standard' END;
  END IF;

  IF NEW.status = 'live'
     AND NEW.payment_status = 'unpaid'
     AND NOT v_beta
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'live') THEN
    RAISE EXCEPTION 'payment_required';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION tournaments_payment_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tournaments_payment_gate_trg ON tournaments;
CREATE TRIGGER tournaments_payment_gate_trg
  BEFORE INSERT OR UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION tournaments_payment_gate();

-- Disabled organizers cannot write
DROP POLICY IF EXISTS "tournaments_not_disabled" ON tournaments;
CREATE POLICY "tournaments_not_disabled" ON tournaments AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT current_user_disabled());
DROP POLICY IF EXISTS "tournaments_not_disabled_upd" ON tournaments;
CREATE POLICY "tournaments_not_disabled_upd" ON tournaments AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT current_user_disabled());
DROP POLICY IF EXISTS "tournaments_not_disabled_del" ON tournaments;
CREATE POLICY "tournaments_not_disabled_del" ON tournaments AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT current_user_disabled());

-- ---------------------------------------------------------------- players
DROP POLICY IF EXISTS "players_select_organizer_or_public" ON players;
DROP POLICY IF EXISTS "players_insert_public_or_organizer" ON players;
DROP POLICY IF EXISTS "players_update_organizer" ON players;
DROP POLICY IF EXISTS "players_delete_organizer" ON players;

REVOKE ALL ON players FROM anon;

CREATE POLICY "players_select_organizer_or_admin" ON players FOR SELECT
  TO authenticated USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.organizer_id = auth.uid())
  );

-- Organizer adds a player manually (public sign-ups use register_player instead)
CREATE POLICY "players_insert_organizer" ON players FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.organizer_id = auth.uid())
  );

CREATE POLICY "players_update_organizer" ON players FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.organizer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.organizer_id = auth.uid()));

CREATE POLICY "players_delete_organizer" ON players FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.organizer_id = auth.uid())
  );

DROP POLICY IF EXISTS "players_not_disabled_ins" ON players;
CREATE POLICY "players_not_disabled_ins" ON players AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT current_user_disabled());
DROP POLICY IF EXISTS "players_not_disabled_upd" ON players;
CREATE POLICY "players_not_disabled_upd" ON players AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT current_user_disabled());
DROP POLICY IF EXISTS "players_not_disabled_del" ON players;
CREATE POLICY "players_not_disabled_del" ON players AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT current_user_disabled());

-- Server-side shape checks apply to manual adds too
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_phone_format;
ALTER TABLE players ADD CONSTRAINT players_phone_format
  CHECK (phone_normalized ~ '^[6-9][0-9]{9}$') NOT VALID;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_name_len;
ALTER TABLE players ADD CONSTRAINT players_name_len
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 60) NOT VALID;

-- ---------------------------------------------------------------- matches
DROP POLICY IF EXISTS "matches_select_public_or_organizer" ON matches;
CREATE POLICY "matches_select_organizer_or_admin" ON matches FOR SELECT
  TO authenticated USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = matches.tournament_id AND t.organizer_id = auth.uid())
  );
REVOKE SELECT ON matches FROM anon;

DROP POLICY IF EXISTS "matches_not_disabled_ins" ON matches;
CREATE POLICY "matches_not_disabled_ins" ON matches AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT current_user_disabled());
DROP POLICY IF EXISTS "matches_not_disabled_upd" ON matches;
CREATE POLICY "matches_not_disabled_upd" ON matches AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT current_user_disabled());
DROP POLICY IF EXISTS "matches_not_disabled_del" ON matches;
CREATE POLICY "matches_not_disabled_del" ON matches AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT current_user_disabled());

-- ---------------------------------------------------------------- public API
CREATE OR REPLACE FUNCTION public_tournament_bundle(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t tournaments%rowtype;
  v_count integer;
  v_players jsonb;
  v_matches jsonb;
BEGIN
  SELECT * INTO t FROM tournaments WHERE slug = p_slug;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count FROM players
   WHERE tournament_id = t.id AND status IN ('pending', 'approved', 'checked_in');

  -- only players that appear in the bracket, or are confirmed; NEVER phone numbers
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'team_tag', p.team_tag,
           'character_loadout', p.character_loadout, 'status', p.status, 'seed', p.seed)
         ORDER BY p.seed NULLS LAST, p.registered_at), '[]'::jsonb)
    INTO v_players
    FROM players p
   WHERE p.tournament_id = t.id AND p.status IN ('approved', 'checked_in');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id, 'round', m.round, 'match_index', m.match_index,
           'bracket_side', m.bracket_side, 'player1_id', m.player1_id, 'player2_id', m.player2_id,
           'winner_id', m.winner_id, 'loser_id', m.loser_id, 'score', m.score,
           'match_details', m.match_details, 'status', m.status,
           'next_match_id', m.next_match_id, 'is_bye', m.is_bye, 'is_current', m.is_current,
           'scheduled_time', m.scheduled_time, 'completed_at', m.completed_at)
         ORDER BY m.round, m.match_index), '[]'::jsonb)
    INTO v_matches
    FROM matches m WHERE m.tournament_id = t.id;

  RETURN jsonb_build_object(
    'tournament', jsonb_build_object(
      'id', t.id, 'title', t.title, 'slug', t.slug, 'game', t.game,
      'description', t.description, 'venue', t.venue, 'start_datetime', t.start_datetime,
      'poster_url', t.poster_url, 'rules', t.rules, 'prize', t.prize, 'entry_fee', t.entry_fee,
      'max_players', t.max_players, 'format', t.format, 'status', t.status,
      'has_bronze_match', t.has_bronze_match, 'registration_open', t.registration_open),
    'player_count', v_count,
    'players', v_players,
    'matches', v_matches
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public_tournament_bundle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_tournament_bundle(text) TO anon, authenticated;

-- ---------------------------------------------------------------- registration
CREATE OR REPLACE FUNCTION register_player(
  p_slug text, p_name text, p_phone text,
  p_team_tag text DEFAULT '', p_character_loadout text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t tournaments%rowtype;
  v_phone text;
  v_name text;
  v_ip text;
  v_count integer;
BEGIN
  BEGIN
    v_ip := split_part(COALESCE((NULLIF(current_setting('request.headers', true), '')::json)->>'x-forwarded-for', 'unknown'), ',', 1);
  EXCEPTION WHEN OTHERS THEN
    v_ip := 'unknown';
  END;
  PERFORM check_rate_limit('reg:ip:' || btrim(v_ip), 10, interval '10 minutes');

  v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone, 2) = '91' THEN v_phone := right(v_phone, 10); END IF;
  IF length(v_phone) = 11 AND left(v_phone, 1) = '0' THEN v_phone := right(v_phone, 10); END IF;
  IF v_phone !~ '^[6-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  SELECT * INTO t FROM tournaments WHERE slug = p_slug FOR UPDATE;  -- row lock: no max-player race
  IF NOT FOUND OR NOT t.registration_open OR t.status IN ('live', 'finished', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  IF t.max_players IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM players
     WHERE tournament_id = t.id AND status IN ('pending', 'approved', 'checked_in');
    IF v_count >= t.max_players THEN
      RETURN jsonb_build_object('ok', false, 'error', 'tournament_full');
    END IF;
  END IF;

  BEGIN
    INSERT INTO players (tournament_id, name, phone, phone_normalized, team_tag, character_loadout, status)
    VALUES (t.id, v_name, v_phone, v_phone,
            left(btrim(COALESCE(p_team_tag, '')), 40),
            left(btrim(COALESCE(p_character_loadout, '')), 40),
            'pending');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION register_player(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_player(text, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------- storage limits
UPDATE storage.buckets
   SET file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'tournament-posters';

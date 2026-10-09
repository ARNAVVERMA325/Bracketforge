/*
# 011 Audit log + referee score entry

1. audit_log: every change to a match's winner or score is recorded BY THE DATABASE (trigger),
   so it cannot be skipped by the app. Records who (user id or 'referee'), when, old and new values.
   Readable by the tournament's organizer and the super-admin only. Nobody can edit or delete rows.
2. Referee access without accounts: the organizer generates a per-tournament code (shown once,
   stored only as a hash). Referees use /referee/<slug> + code. They can ONLY submit the result of
   a ready, not-yet-completed match in a LIVE tournament. They cannot correct, delete or see phones.
   Wrong-code guessing is rate limited per IP.
*/

CREATE OR REPLACE FUNCTION request_ip() RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN btrim(split_part(COALESCE((NULLIF(current_setting('request.headers', true), '')::json)->>'x-forwarded-for', 'unknown'), ',', 1));
EXCEPTION WHEN OTHERS THEN
  RETURN 'unknown';
END;
$$;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS referee_code_hash text;

-- ------------------------------------------------------------ audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id uuid NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tournament_created ON audit_log(tournament_id, created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_log FROM anon, authenticated;
GRANT SELECT ON audit_log TO authenticated;
DROP POLICY IF EXISTS "audit_select_organizer_or_admin" ON audit_log;
CREATE POLICY "audit_select_organizer_or_admin" ON audit_log FOR SELECT TO authenticated USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = audit_log.tournament_id AND t.organizer_id = auth.uid())
);

CREATE OR REPLACE FUNCTION matches_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text;
BEGIN
  IF OLD.winner_id IS DISTINCT FROM NEW.winner_id OR OLD.score IS DISTINCT FROM NEW.score THEN
    v_actor := COALESCE(NULLIF(current_setting('app.actor', true), ''),
                        CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'organizer' END);
    INSERT INTO audit_log (tournament_id, match_id, actor_id, actor_role, old_value, new_value)
    VALUES (
      NEW.tournament_id, NEW.id, auth.uid(), v_actor,
      jsonb_build_object('round', OLD.round, 'match_index', OLD.match_index, 'bracket_side', OLD.bracket_side,
        'winner_id', OLD.winner_id, 'winner_name', (SELECT name FROM players WHERE id = OLD.winner_id),
        'score', OLD.score, 'status', OLD.status),
      jsonb_build_object('round', NEW.round, 'match_index', NEW.match_index, 'bracket_side', NEW.bracket_side,
        'winner_id', NEW.winner_id, 'winner_name', (SELECT name FROM players WHERE id = NEW.winner_id),
        'score', NEW.score, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION matches_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS matches_audit_trg ON matches;
CREATE TRIGGER matches_audit_trg AFTER UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION matches_audit();

-- ------------------------------------------------------------ referee code
CREATE OR REPLACE FUNCTION set_referee_code(p_tournament_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF auth.uid() IS NULL OR current_user_disabled() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT (is_super_admin() OR EXISTS (SELECT 1 FROM tournaments WHERE id = p_tournament_id AND organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  UPDATE tournaments
     SET referee_code_hash = encode(sha256(convert_to(id::text || v_code, 'UTF8')), 'hex')
   WHERE id = p_tournament_id;
  RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_referee_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_referee_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION referee_matches(p_slug text, p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tournaments%rowtype; v_list jsonb;
BEGIN
  PERFORM check_rate_limit('ref:' || request_ip() || ':' || p_slug, 60, interval '10 minutes');
  SELECT * INTO t FROM tournaments WHERE slug = p_slug;
  IF NOT FOUND OR t.referee_code_hash IS NULL
     OR t.referee_code_hash <> encode(sha256(convert_to(t.id::text || upper(btrim(COALESCE(p_code, ''))), 'UTF8')), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'round', m.round, 'match_index', m.match_index, 'bracket_side', m.bracket_side,
      'p1_id', m.player1_id, 'p1_name', a.name, 'p2_id', m.player2_id, 'p2_name', b.name,
      'is_current', m.is_current)
    ORDER BY m.is_current DESC, m.round, m.match_index), '[]'::jsonb)
  INTO v_list
  FROM matches m
  LEFT JOIN players a ON a.id = m.player1_id
  LEFT JOIN players b ON b.id = m.player2_id
  WHERE m.tournament_id = t.id AND NOT m.is_bye AND m.status <> 'completed'
    AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL;

  RETURN jsonb_build_object('ok', true, 'title', t.title, 'status', t.status, 'matches', v_list);
END;
$$;
REVOKE EXECUTE ON FUNCTION referee_matches(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referee_matches(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION referee_submit_result(p_slug text, p_code text, p_match_id uuid, p_winner_id uuid, p_score text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tournaments%rowtype; m matches%rowtype; v_loser uuid;
BEGIN
  PERFORM check_rate_limit('ref:' || request_ip() || ':' || p_slug, 60, interval '10 minutes');
  SELECT * INTO t FROM tournaments WHERE slug = p_slug;
  IF NOT FOUND OR t.referee_code_hash IS NULL
     OR t.referee_code_hash <> encode(sha256(convert_to(t.id::text || upper(btrim(COALESCE(p_code, ''))), 'UTF8')), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF t.status <> 'live' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_live'); END IF;

  SELECT * INTO m FROM matches WHERE id = p_match_id AND tournament_id = t.id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'match_not_found'); END IF;
  IF m.is_bye OR m.status = 'completed' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_allowed'); END IF;
  IF m.player1_id IS NULL OR m.player2_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'match_not_ready'); END IF;
  IF p_winner_id IS DISTINCT FROM m.player1_id AND p_winner_id IS DISTINCT FROM m.player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_winner');
  END IF;

  v_loser := CASE WHEN p_winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END;
  PERFORM set_config('app.actor', 'referee', true);

  UPDATE matches SET winner_id = p_winner_id, loser_id = v_loser, score = left(COALESCE(p_score, ''), 40),
         status = 'completed', completed_at = now(), is_current = false
   WHERE id = m.id;

  IF m.next_match_id IS NOT NULL THEN
    IF m.match_index % 2 = 0 THEN UPDATE matches SET player1_id = p_winner_id WHERE id = m.next_match_id;
    ELSE UPDATE matches SET player2_id = p_winner_id WHERE id = m.next_match_id; END IF;
  END IF;
  IF m.next_loser_match_id IS NOT NULL THEN
    IF m.match_index % 2 = 0 THEN UPDATE matches SET player1_id = v_loser WHERE id = m.next_loser_match_id;
    ELSE UPDATE matches SET player2_id = v_loser WHERE id = m.next_loser_match_id; END IF;
  END IF;
  PERFORM set_config('app.actor', '', true);  -- never leak the 'referee' marker beyond this call
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION referee_submit_result(text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referee_submit_result(text, text, uuid, uuid, text) TO anon, authenticated;

/*
# 012 Integrations: connect a café's own website to the app

1. register logic is shared (_register_core) by the public form and the API.
2. api_keys: organizer-created keys (shown once, stored as SHA-256 hash, revocable).
   api_register_player(): a café's backend can push a registration into one of ITS OWN tournaments.
3. integrations + webhook_outbox: every new registration (and completed match) is queued and
   sent to the café's webhook URL, signed with HMAC-SHA256. A small worker (Cloudflare Pages
   Function) claims rows via webhook_claim()/webhook_report() with the service role.
   Failed deliveries are retried with backoff (max 6 attempts).
*/

-- ------------------------------------------------------------ shared registration core
CREATE OR REPLACE FUNCTION _register_core(
  t tournaments, p_name text, p_phone text, p_team_tag text, p_loadout text, p_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_name text; v_count integer;
BEGIN
  v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone, 2) = '91' THEN v_phone := right(v_phone, 10); END IF;
  IF length(v_phone) = 11 AND left(v_phone, 1) = '0' THEN v_phone := right(v_phone, 10); END IF;
  IF v_phone !~ '^[6-9][0-9]{9}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone'); END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  IF NOT t.registration_open OR t.status IN ('live', 'finished', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  IF t.max_players IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM players
     WHERE tournament_id = t.id AND status IN ('pending', 'approved', 'checked_in');
    IF v_count >= t.max_players THEN RETURN jsonb_build_object('ok', false, 'error', 'tournament_full'); END IF;
  END IF;

  BEGIN
    INSERT INTO players (tournament_id, name, phone, phone_normalized, team_tag, character_loadout, status)
    VALUES (t.id, v_name, v_phone, v_phone,
            left(btrim(COALESCE(p_team_tag, '')), 40), left(btrim(COALESCE(p_loadout, '')), 40), p_status);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION _register_core(tournaments, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION register_player(
  p_slug text, p_name text, p_phone text, p_team_tag text DEFAULT '', p_character_loadout text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tournaments%rowtype;
BEGIN
  PERFORM check_rate_limit('reg:ip:' || request_ip(), 10, interval '10 minutes');
  SELECT * INTO t FROM tournaments WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_closed'); END IF;
  RETURN _register_core(t, p_name, p_phone, p_team_tag, p_character_loadout, 'pending');
END;
$$;

-- ------------------------------------------------------------ API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_keys FROM anon, authenticated;
GRANT SELECT (id, organizer_id, label, key_prefix, created_at, last_used_at, revoked_at) ON api_keys TO authenticated;
DROP POLICY IF EXISTS "api_keys_select_own" ON api_keys;
CREATE POLICY "api_keys_select_own" ON api_keys FOR SELECT TO authenticated USING (organizer_id = auth.uid());

CREATE OR REPLACE FUNCTION create_api_key(p_label text DEFAULT '') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF auth.uid() IS NULL OR current_user_disabled() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (SELECT count(*) FROM api_keys WHERE organizer_id = auth.uid() AND revoked_at IS NULL) >= 5 THEN
    RAISE EXCEPTION 'too_many_keys';
  END IF;
  v_key := 'bf_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO api_keys (organizer_id, label, key_prefix, key_hash)
  VALUES (auth.uid(), left(btrim(COALESCE(p_label, '')), 40), left(v_key, 7),
          encode(sha256(convert_to(v_key, 'UTF8')), 'hex'));
  RETURN v_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_api_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_api_key(text) TO authenticated;

CREATE OR REPLACE FUNCTION revoke_api_key(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE api_keys SET revoked_at = now() WHERE id = p_id AND organizer_id = auth.uid() AND revoked_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION revoke_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revoke_api_key(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION api_register_player(
  p_key text, p_slug text, p_name text, p_phone text,
  p_team_tag text DEFAULT '', p_character_loadout text DEFAULT '', p_status text DEFAULT 'pending'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k api_keys%rowtype; t tournaments%rowtype; v_hash text;
BEGIN
  PERFORM check_rate_limit('api:ip:' || request_ip(), 300, interval '1 minute');
  v_hash := encode(sha256(convert_to(COALESCE(p_key, ''), 'UTF8')), 'hex');
  SELECT * INTO k FROM api_keys WHERE key_hash = v_hash AND revoked_at IS NULL;
  IF NOT FOUND OR (SELECT is_disabled FROM profiles WHERE id = k.organizer_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_key');
  END IF;
  PERFORM check_rate_limit('api:key:' || k.id::text, 120, interval '1 minute');
  IF p_status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO t FROM tournaments WHERE slug = p_slug AND organizer_id = k.organizer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'tournament_not_found'); END IF;

  UPDATE api_keys SET last_used_at = now() WHERE id = k.id;
  RETURN _register_core(t, p_name, p_phone, p_team_tag, p_character_loadout, p_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION api_register_player(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_register_player(text, text, text, text, text, text, text) TO anon, authenticated;

-- ------------------------------------------------------------ webhooks
CREATE TABLE IF NOT EXISTS integrations (
  organizer_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  webhook_url text,
  webhook_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON integrations FROM anon, authenticated;
GRANT SELECT ON integrations TO authenticated;
DROP POLICY IF EXISTS "integrations_select_own" ON integrations;
CREATE POLICY "integrations_select_own" ON integrations FOR SELECT TO authenticated USING (organizer_id = auth.uid());

CREATE OR REPLACE FUNCTION set_webhook(p_url text, p_rotate_secret boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text := NULLIF(btrim(COALESCE(p_url, '')), ''); v_secret text;
BEGIN
  IF auth.uid() IS NULL OR current_user_disabled() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_url IS NOT NULL AND (
       length(v_url) > 500
       OR v_url !~* '^https://[a-z0-9]'
       OR v_url ~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)'
       OR v_url ~ '\s') THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;
  v_secret := 'whsec_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO integrations (organizer_id, webhook_url, webhook_secret) VALUES (auth.uid(), v_url, v_secret)
  ON CONFLICT (organizer_id) DO UPDATE
    SET webhook_url = EXCLUDED.webhook_url,
        webhook_secret = CASE WHEN p_rotate_secret THEN EXCLUDED.webhook_secret ELSE integrations.webhook_secret END,
        updated_at = now();
  RETURN (SELECT jsonb_build_object('webhook_url', webhook_url, 'webhook_secret', webhook_secret)
            FROM integrations WHERE organizer_id = auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION set_webhook(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_webhook(text, boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id bigserial PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON webhook_outbox(next_attempt_at) WHERE delivered_at IS NULL;
ALTER TABLE webhook_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webhook_outbox FROM anon, authenticated;
GRANT SELECT (id, event, attempts, delivered_at, last_error, created_at) ON webhook_outbox TO authenticated;
DROP POLICY IF EXISTS "outbox_select_own" ON webhook_outbox;
CREATE POLICY "outbox_select_own" ON webhook_outbox FOR SELECT TO authenticated USING (organizer_id = auth.uid());

CREATE OR REPLACE FUNCTION queue_webhook(p_organizer uuid, p_event text, p_payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO webhook_outbox (organizer_id, event, payload)
  SELECT p_organizer, p_event, p_payload
   WHERE EXISTS (SELECT 1 FROM integrations WHERE organizer_id = p_organizer AND webhook_url IS NOT NULL);
$$;
REVOKE EXECUTE ON FUNCTION queue_webhook(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION players_webhook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tournaments%rowtype;
BEGIN
  SELECT * INTO t FROM tournaments WHERE id = NEW.tournament_id;
  PERFORM queue_webhook(t.organizer_id, 'player.registered', jsonb_build_object(
    'tournament', jsonb_build_object('id', t.id, 'slug', t.slug, 'title', t.title),
    'player', jsonb_build_object('id', NEW.id, 'name', NEW.name, 'phone', NEW.phone,
      'team_tag', NEW.team_tag, 'character_loadout', NEW.character_loadout,
      'status', NEW.status, 'registered_at', NEW.registered_at)));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION players_webhook() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS players_webhook_trg ON players;
CREATE TRIGGER players_webhook_trg AFTER INSERT ON players FOR EACH ROW EXECUTE FUNCTION players_webhook();

CREATE OR REPLACE FUNCTION matches_webhook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tournaments%rowtype;
BEGIN
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id IS DISTINCT FROM OLD.winner_id AND NOT NEW.is_bye THEN
    SELECT * INTO t FROM tournaments WHERE id = NEW.tournament_id;
    PERFORM queue_webhook(t.organizer_id, 'match.completed', jsonb_build_object(
      'tournament', jsonb_build_object('id', t.id, 'slug', t.slug, 'title', t.title),
      'match', jsonb_build_object('id', NEW.id, 'round', NEW.round, 'match_index', NEW.match_index,
        'bracket_side', NEW.bracket_side, 'score', NEW.score,
        'winner', (SELECT jsonb_build_object('id', id, 'name', name) FROM players WHERE id = NEW.winner_id),
        'loser', (SELECT jsonb_build_object('id', id, 'name', name) FROM players WHERE id = NEW.loser_id))));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION matches_webhook() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS matches_webhook_trg ON matches;
CREATE TRIGGER matches_webhook_trg AFTER UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION matches_webhook();

CREATE OR REPLACE FUNCTION send_test_webhook() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_user_disabled() THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM queue_webhook(auth.uid(), 'webhook.test', jsonb_build_object('message', 'Test event from your tournament app'));
END;
$$;
REVOKE EXECUTE ON FUNCTION send_test_webhook() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_test_webhook() TO authenticated;

-- worker-only functions (service role). Claiming pushes next_attempt_at forward so parallel workers don't double-send.
CREATE OR REPLACE FUNCTION webhook_claim(p_limit integer DEFAULT 20) RETURNS TABLE (
  id bigint, event text, payload jsonb, attempts integer, webhook_url text, webhook_secret text, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF random() < 0.05 THEN DELETE FROM webhook_outbox o WHERE o.delivered_at < now() - interval '7 days'; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT o.id FROM webhook_outbox o
     WHERE o.delivered_at IS NULL AND o.attempts < 6 AND o.next_attempt_at <= now()
     ORDER BY o.id LIMIT LEAST(GREATEST(p_limit, 1), 50) FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE webhook_outbox o SET attempts = o.attempts + 1, next_attempt_at = now() + interval '2 minutes'
      FROM due WHERE o.id = due.id
    RETURNING o.id, o.event, o.payload, o.attempts, o.organizer_id, o.created_at
  )
  SELECT u.id, u.event, u.payload, u.attempts, i.webhook_url, i.webhook_secret, u.created_at
    FROM upd u JOIN integrations i ON i.organizer_id = u.organizer_id AND i.webhook_url IS NOT NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION webhook_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION webhook_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION webhook_report(p_id bigint, p_ok boolean, p_error text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE webhook_outbox SET
    delivered_at = CASE WHEN p_ok THEN now() ELSE NULL END,
    last_error = CASE WHEN p_ok THEN NULL ELSE left(COALESCE(p_error, 'failed'), 200) END,
    next_attempt_at = CASE WHEN p_ok THEN next_attempt_at
      ELSE now() + (CASE attempts WHEN 1 THEN interval '5 minutes' WHEN 2 THEN interval '30 minutes'
                    WHEN 3 THEN interval '2 hours' ELSE interval '12 hours' END) END
  WHERE id = p_id;
$$;
REVOKE EXECUTE ON FUNCTION webhook_report(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION webhook_report(bigint, boolean, text) TO service_role;

-- !!! DEVELOPER ONLY: creates fake users/tournaments. Never run on your real Supabase project. !!!
-- Permission / privacy tests. Each failed check raises an exception and stops the run.
CREATE SCHEMA IF NOT EXISTS test;
GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION test.ok(cond boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', name; END IF;
  RAISE NOTICE 'PASS: %', name;
END $$;

-- true when the statement raises an error (e.g. permission denied / policy violation)
CREATE OR REPLACE FUNCTION test.fails(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE stmt; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

-- number of rows an UPDATE/DELETE statement touched (0 when RLS filters them out)
CREATE OR REPLACE FUNCTION test.affected(stmt text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE stmt; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated;

-- ---------------------------------------------------------------- fixtures (superuser)
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@example.com');
UPDATE profiles SET role = 'super_admin' WHERE id = 'cccccccc-0000-0000-0000-000000000003';
UPDATE app_settings SET free_during_beta = true WHERE id = 1;

INSERT INTO tournaments (id, organizer_id, title, slug, game, status, registration_open, max_players) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A Cup', 'a-cup', 'Tekken', 'registration_open', true, 3),
  ('b1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Cup', 'b-cup', 'FIFA', 'registration_open', true, NULL);

-- ---------------------------------------------------------------- registration (anon)
DO $$
DECLARE r jsonb; i int;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"1.1.1.1"}', true);

  r := register_player('a-cup', 'Ravi', '98765 43210');
  PERFORM test.ok((r->>'ok')::boolean, 'anon can register with a valid phone (spaces tolerated)');
  r := register_player('a-cup', 'Ravi Again', '+91 9876543210');
  PERFORM test.ok(r->>'error' = 'already_registered', 'same phone (+91 form) cannot register twice');
  r := register_player('a-cup', 'Bad', '1234567890');
  PERFORM test.ok(r->>'error' = 'invalid_phone', 'phone not starting 6-9 is rejected');
  r := register_player('a-cup', 'X', '9876543211');
  PERFORM test.ok(r->>'error' = 'invalid_name', 'one-character name rejected');
  r := register_player('a-cup', 'Two', '9876543212');
  r := register_player('a-cup', 'Three', '9876543213');
  r := register_player('a-cup', 'Four', '9876543214');
  PERFORM test.ok(r->>'error' = 'tournament_full', 'max_players is enforced');
  r := register_player('b-cup', 'Same Phone Other Tournament', '9876543210');
  PERFORM test.ok((r->>'ok')::boolean, 'same phone may register in a different tournament');
  RESET ROLE;
END $$;

-- rate limit: 10 attempts / 10 min / IP
DO $$
DECLARE i int; limited boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"9.9.9.9"}', true);
  FOR i IN 1..12 LOOP
    BEGIN PERFORM register_player('b-cup', 'Spam ' || i, '98000000' || lpad(i::text, 2, '0'));
    EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'rate_limited' THEN limited := true; END IF; END;
  END LOOP;
  RESET ROLE;
  PERFORM test.ok(limited, 'registration is rate limited per IP');
END $$;

-- ---------------------------------------------------------------- anon cannot read tables
DO $$
BEGIN
  SET LOCAL ROLE anon;
  PERFORM test.ok(test.fails('SELECT * FROM players'), 'anon cannot read players table');
  PERFORM test.ok(test.fails('SELECT * FROM matches'), 'anon cannot read matches table');
  PERFORM test.ok(test.fails('SELECT * FROM tournaments'), 'anon cannot list tournaments table');
  PERFORM test.ok(test.fails('SELECT * FROM audit_log'), 'anon cannot read audit log');
  PERFORM test.ok(test.fails('SELECT * FROM rate_limits'), 'anon cannot read rate_limits');
  PERFORM test.ok(test.fails($q$INSERT INTO players (tournament_id,name,phone,phone_normalized,status) VALUES ('a1000000-0000-0000-0000-000000000001','Hack','9000000001','9000000001','approved')$q$), 'anon cannot insert players directly');
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- public bundle never leaks phones
DO $$
DECLARE b jsonb;
BEGIN
  SET LOCAL ROLE anon;
  b := public_tournament_bundle('a-cup');
  PERFORM test.ok(b IS NOT NULL AND b->'tournament'->>'title' = 'A Cup', 'public bundle returns the tournament');
  PERFORM test.ok(position('"phone' in b::text) = 0 AND position('9876543210' in b::text) = 0, 'public bundle contains no phone numbers');
  PERFORM test.ok(position('referee_code_hash' in b::text) = 0 AND position('organizer_id' in b::text) = 0, 'public bundle contains no private columns');
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- organizer isolation
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM test.ok((SELECT count(*) FROM tournaments) = 1, 'organizer A sees only own tournaments');
  PERFORM test.ok((SELECT count(*) FROM players WHERE phone = '9876543210') = 1, 'organizer A sees own players incl. phone (and not B''s)');
  PERFORM test.ok((SELECT count(*) FROM players WHERE tournament_id = 'b1000000-0000-0000-0000-000000000002') = 0, 'organizer A cannot read B players');
  PERFORM test.ok(test.affected($q$UPDATE tournaments SET title = 'hacked' WHERE id = 'b1000000-0000-0000-0000-000000000002'$q$) = 0, 'organizer A cannot update B tournament');
  PERFORM test.ok(test.affected($q$UPDATE players SET status = 'approved' WHERE tournament_id = 'b1000000-0000-0000-0000-000000000002'$q$) = 0, 'organizer A cannot update B players');
  PERFORM test.ok(test.fails($q$INSERT INTO players (tournament_id,name,phone,phone_normalized,status) VALUES ('b1000000-0000-0000-0000-000000000002','Injected','9000000002','9000000002','approved')$q$), 'organizer A cannot insert players into B tournament');
  PERFORM test.ok(test.fails($q$UPDATE profiles SET role = 'super_admin' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$)
                  OR (SELECT role FROM profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'organizer', 'organizer cannot promote self to super_admin');
  PERFORM test.ok(test.fails($q$UPDATE profiles SET is_disabled = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$), 'organizer cannot edit is_disabled');
  PERFORM test.ok(test.fails($q$UPDATE tournaments SET payment_status = 'paid' WHERE id = 'a1000000-0000-0000-0000-000000000001'$q$), 'organizer cannot mark own tournament paid');
  PERFORM test.ok(test.fails('SELECT * FROM admin_list_organizers()'), 'organizer cannot call admin functions');
  RESET ROLE;
END $$;

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
  PERFORM test.ok((SELECT count(*) FROM tournaments) = 2, 'super admin sees all tournaments');
  PERFORM test.ok((SELECT count(*) FROM players) >= 4, 'super admin sees all players');
  PERFORM test.ok((SELECT count(*) FROM admin_list_organizers()) >= 2, 'super admin can list organizers');
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- disabled organizer
UPDATE profiles SET is_disabled = true WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok(test.fails($q$INSERT INTO tournaments (organizer_id,title,slug,game) VALUES ('bbbbbbbb-0000-0000-0000-000000000002','New','b-new','x')$q$), 'disabled organizer cannot create tournaments');
  PERFORM test.ok(test.affected($q$UPDATE tournaments SET title = 'still editing' WHERE id = 'b1000000-0000-0000-0000-000000000002'$q$) = 0, 'disabled organizer cannot edit tournaments');
  RESET ROLE;
END $$;
UPDATE profiles SET is_disabled = false WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------- payment gate
DO $$
BEGIN
  UPDATE app_settings SET free_during_beta = false WHERE id = 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  INSERT INTO tournaments (id, organizer_id, title, slug, game) VALUES ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Paid Cup', 'paid-cup', 'x');
  PERFORM test.ok((SELECT payment_status FROM tournaments WHERE slug = 'paid-cup') = 'unpaid', 'new tournament is unpaid when beta is off');
  PERFORM test.ok(test.fails($q$UPDATE tournaments SET status = 'live' WHERE slug = 'paid-cup'$q$), 'unpaid tournament cannot go live');
  PERFORM test.ok(test.affected($q$UPDATE tournaments SET registration_open = true WHERE slug = 'paid-cup'$q$) = 1, 'unpaid tournament can still be edited as a draft');
  RESET ROLE;
END $$;

UPDATE tournaments SET payment_status = 'paid' WHERE slug = 'paid-cup';  -- what the super-admin "mark paid" does
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM test.ok(test.affected($q$UPDATE tournaments SET status = 'live' WHERE slug = 'paid-cup'$q$) = 1, 'paid tournament can go live');
  RESET ROLE;
END $$;
UPDATE app_settings SET free_during_beta = true WHERE id = 1;

-- ---------------------------------------------------------------- referee + audit
INSERT INTO players (id, tournament_id, name, phone, phone_normalized, status) VALUES
  ('a0000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-000000000001', 'Ref P1', '9111111111', '9111111111', 'checked_in'),
  ('a0000000-0000-0000-0000-0000000000f2', 'a1000000-0000-0000-0000-000000000001', 'Ref P2', '9222222222', '9222222222', 'checked_in');
INSERT INTO matches (id, tournament_id, round, match_index, bracket_side) VALUES
  ('a0000000-0000-0000-0000-0000000000e2', 'a1000000-0000-0000-0000-000000000001', 2, 0, 'winners');
INSERT INTO matches (id, tournament_id, round, match_index, bracket_side, player1_id, player2_id, next_match_id) VALUES
  ('a0000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-000000000001', 1, 0, 'winners',
   'a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-0000000000e2');

DO $$
DECLARE code text; r jsonb;
BEGIN
  -- organizer B (other owner) cannot create a code for A's tournament
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok(test.fails($q$SELECT set_referee_code('a1000000-0000-0000-0000-000000000001')$q$), 'other organizer cannot create referee code');
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  code := set_referee_code('a1000000-0000-0000-0000-000000000001');
  PERFORM test.ok(length(code) = 8, 'owner gets an 8 character referee code');
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"2.2.2.2"}', true);
  r := referee_matches('a-cup', 'WRONGCODE');
  PERFORM test.ok(r->>'error' = 'invalid_code', 'wrong referee code is rejected');
  r := referee_submit_result('a-cup', code, 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000f1', '2-0');
  PERFORM test.ok(r->>'error' = 'not_live', 'referee cannot enter scores before the tournament is live');
  RESET ROLE;

  UPDATE tournaments SET status = 'live' WHERE id = 'a1000000-0000-0000-0000-000000000001';

  SET LOCAL ROLE anon;
  r := referee_matches('a-cup', lower(code));
  PERFORM test.ok((r->>'ok')::boolean AND jsonb_array_length(r->'matches') = 1, 'referee sees ready matches (code is case-insensitive)');
  PERFORM test.ok(position('phone' in r::text) = 0, 'referee view has no phone numbers');
  r := referee_submit_result('a-cup', code, 'a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-0000000000f1', '');
  PERFORM test.ok(r->>'error' = 'match_not_ready', 'referee cannot score a match that is not ready');
  r := referee_submit_result('a-cup', code, 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000ff', '');
  PERFORM test.ok(r->>'error' = 'invalid_winner', 'referee cannot pick a player outside the match');
  r := referee_submit_result('a-cup', code, 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000f1', '2-0');
  PERFORM test.ok((r->>'ok')::boolean, 'referee can enter a result');
  r := referee_submit_result('a-cup', code, 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000f2', '0-2');
  PERFORM test.ok(r->>'error' = 'not_allowed', 'referee cannot overwrite a completed result');
  PERFORM test.ok(test.fails($q$UPDATE matches SET winner_id = 'a0000000-0000-0000-0000-0000000000f2'$q$), 'referee (anon) cannot write matches directly');
  RESET ROLE;

  PERFORM test.ok((SELECT player1_id FROM matches WHERE id = 'a0000000-0000-0000-0000-0000000000e2') = 'a0000000-0000-0000-0000-0000000000f1', 'winner advanced to the next match');
  PERFORM test.ok((SELECT actor_role FROM audit_log WHERE match_id = 'a0000000-0000-0000-0000-0000000000e1' ORDER BY id DESC LIMIT 1) = 'referee', 'audit log records the referee as actor');

  -- organizer corrects the result: audit shows organizer
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM test.ok(test.affected($q$UPDATE matches SET winner_id = 'a0000000-0000-0000-0000-0000000000f2', score = '1-2' WHERE id = 'a0000000-0000-0000-0000-0000000000e1'$q$) = 1, 'organizer can correct a result');
  PERFORM test.ok((SELECT count(*) FROM audit_log WHERE match_id = 'a0000000-0000-0000-0000-0000000000e1') = 2, 'organizer can read own audit log');
  PERFORM test.ok(test.fails($q$DELETE FROM audit_log$q$) AND test.fails($q$UPDATE audit_log SET actor_role = 'x'$q$), 'audit log cannot be edited or deleted by organizers');
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok((SELECT count(*) FROM audit_log) = 0, 'other organizer cannot read A''s audit log');
  RESET ROLE;
  PERFORM test.ok((SELECT actor_role FROM audit_log WHERE match_id = 'a0000000-0000-0000-0000-0000000000e1' ORDER BY id DESC LIMIT 1) = 'organizer', 'audit log records the organizer as actor');
END $$;

-- ---------------------------------------------------------------- referee brute force limit
DO $$
DECLARE i int; limited boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"3.3.3.3"}', true);
  FOR i IN 1..70 LOOP
    BEGIN PERFORM referee_matches('a-cup', 'GUESS' || i);
    EXCEPTION WHEN OTHERS THEN IF SQLERRM = 'rate_limited' THEN limited := true; END IF; END;
  END LOOP;
  RESET ROLE;
  PERFORM test.ok(limited, 'referee code guessing is rate limited');
END $$;

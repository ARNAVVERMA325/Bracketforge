-- !!! DEVELOPER ONLY: creates fake users/tournaments. Never run on your real Supabase project. !!!
-- Integration tests (run after 10_permissions.sql; reuses its fixtures: A owns 'a-cup', B owns 'b-cup')
DO $$
DECLARE keyA text; keyB text; r jsonb; claimed int; kid uuid;
BEGIN
  UPDATE tournaments SET status = 'registration_open', registration_open = true, max_players = NULL
   WHERE slug IN ('a-cup', 'b-cup');
  DELETE FROM rate_limits;

  -- key management
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  keyA := create_api_key('Café site');
  PERFORM test.ok(keyA LIKE 'bf_%' AND length(keyA) = 67, 'organizer can create an API key');
  PERFORM test.ok(test.fails('SELECT key_hash FROM api_keys'), 'key hash is not readable by the organizer');
  SELECT id INTO kid FROM api_keys LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  keyB := create_api_key('B site');
  PERFORM test.ok((SELECT count(*) FROM api_keys) = 1, 'organizer only sees own API keys');
  PERFORM revoke_api_key(kid);
  RESET ROLE;
  PERFORM test.ok((SELECT revoked_at FROM api_keys WHERE id = kid) IS NULL, 'other organizer cannot revoke my key');

  -- registration through the API
  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"5.5.5.5"}', true);
  r := api_register_player('bf_wrongkey', 'a-cup', 'Zed', '9333333333');
  PERFORM test.ok(r->>'error' = 'invalid_key', 'wrong API key rejected');
  r := api_register_player(keyA, 'b-cup', 'Zed', '9333333333');
  PERFORM test.ok(r->>'error' = 'tournament_not_found', 'key cannot register into another organizer''s tournament');
  r := api_register_player(keyA, 'a-cup', 'Zed', '9333333333', 'ZT', 'Kazuya', 'approved');
  PERFORM test.ok((r->>'ok')::boolean, 'API registration works');
  r := api_register_player(keyA, 'a-cup', 'Zed 2', '+91 93333 33333');
  PERFORM test.ok(r->>'error' = 'already_registered', 'API respects duplicate phone rule');
  r := api_register_player(keyA, 'a-cup', 'Bad', '12345');
  PERFORM test.ok(r->>'error' = 'invalid_phone', 'API validates phone');
  r := api_register_player(keyA, 'a-cup', 'Bad', '9444444444', '', '', 'checked_in');
  PERFORM test.ok(r->>'error' = 'invalid_status', 'API cannot set arbitrary status');
  RESET ROLE;
  PERFORM test.ok((SELECT status FROM players WHERE phone = '9333333333') = 'approved', 'API-registered player stored with requested status');

  -- revoked and disabled
  UPDATE api_keys SET revoked_at = now() WHERE id = (SELECT id FROM api_keys WHERE organizer_id = 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE anon;
  r := api_register_player(keyA, 'a-cup', 'Late', '9555555555');
  PERFORM test.ok(r->>'error' = 'invalid_key', 'revoked key is rejected');
  RESET ROLE;

  -- webhook config + outbox
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  PERFORM test.ok(test.fails($q$SELECT set_webhook('http://insecure.example.com/hook')$q$), 'webhook must be https');
  PERFORM test.ok(test.fails($q$SELECT set_webhook('https://127.0.0.1/hook')$q$) AND test.fails($q$SELECT set_webhook('https://localhost/hook')$q$), 'webhook cannot target loopback');
  r := set_webhook('https://cafe.example.com/hooks/bf');
  PERFORM test.ok(r->>'webhook_secret' LIKE 'whsec_%', 'webhook configured and secret generated');
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"6.6.6.6"}', true);
  r := register_player('a-cup', 'Hook Player', '9666666666');
  RESET ROLE;
  PERFORM test.ok((SELECT count(*) FROM webhook_outbox WHERE event = 'player.registered' AND payload->'player'->>'name' = 'Hook Player') = 1, 'registration queues a webhook event');
  PERFORM test.ok((SELECT count(*) FROM webhook_outbox o JOIN players p ON p.name = 'Ravi' WHERE o.organizer_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'organizer without webhook gets no events');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok((SELECT count(*) FROM webhook_outbox) = 0 AND (SELECT count(*) FROM integrations) = 0, 'other organizer cannot see my webhook data');
  PERFORM test.ok(test.fails($q$SELECT * FROM webhook_claim(5)$q$), 'organizer cannot call worker claim');
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM test.ok(test.fails($q$SELECT * FROM webhook_claim(5)$q$) AND test.fails($q$SELECT webhook_report(1, true)$q$), 'anon cannot call worker functions');
  RESET ROLE;

  -- worker flow (service role)
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO claimed FROM webhook_claim(10);
  PERFORM test.ok(claimed >= 1, 'worker can claim due events');
  PERFORM test.ok((SELECT count(*) FROM webhook_claim(10)) = 0, 'claimed events are not handed out twice');
  PERFORM webhook_report((SELECT min(id) FROM webhook_outbox), false, 'HTTP 500');
  RESET ROLE;
  PERFORM test.ok((SELECT last_error FROM webhook_outbox ORDER BY id LIMIT 1) = 'HTTP 500' AND (SELECT next_attempt_at FROM webhook_outbox ORDER BY id LIMIT 1) > now() + interval '1 minute', 'failed delivery is scheduled for retry');
  SET LOCAL ROLE service_role;
  PERFORM webhook_report((SELECT min(id) FROM webhook_outbox), true);
  RESET ROLE;
  PERFORM test.ok((SELECT delivered_at FROM webhook_outbox ORDER BY id LIMIT 1) IS NOT NULL, 'successful delivery is recorded');
END $$;

-- ---------------------------------------------------------------- super-admin revenue (migration 013)
DO $$
DECLARE s record;
BEGIN
  UPDATE tournaments SET payment_status = 'unpaid', paid_amount_inr = NULL, paid_at = NULL WHERE slug = 'b-cup';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok(test.fails($q$SELECT admin_set_plan_fee(1)$q$) AND test.fails($q$SELECT * FROM admin_get_stats()$q$), 'organizer cannot change price or read admin stats');
  PERFORM test.ok(test.fails($q$SELECT admin_set_tournament_payment('b1000000-0000-0000-0000-000000000002','paid')$q$), 'organizer cannot mark a tournament paid via admin function');

  PERFORM set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
  PERFORM admin_set_plan_fee(300);
  PERFORM admin_set_tournament_payment('b1000000-0000-0000-0000-000000000002', 'paid', 'manual', 'UPI ref 123');
  PERFORM admin_set_plan_fee(500);   -- price change must not rewrite past revenue
  SELECT * INTO s FROM admin_get_stats();
  PERFORM test.ok(s.revenue_inr >= 300 AND s.plan_fee_inr = 500, 'revenue keeps the price recorded at payment time');
  PERFORM test.ok((SELECT paid_amount_inr FROM tournaments WHERE slug = 'b-cup') = 300, 'paid amount is stored per tournament');
  PERFORM admin_set_tournament_payment('b1000000-0000-0000-0000-000000000002', 'paid');
  PERFORM test.ok((SELECT paid_amount_inr FROM tournaments WHERE slug = 'b-cup') = 300, 're-marking paid does not change recorded amount');
  PERFORM test.ok(test.fails($q$SELECT admin_set_plan_fee(-5)$q$), 'invalid price rejected');
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------- stations (migration 014)
DO $$
DECLARE b jsonb; r jsonb; code text;
BEGIN
  UPDATE matches SET station = 'Station 3' WHERE id = 'a0000000-0000-0000-0000-0000000000e1';
  SET LOCAL ROLE anon;
  b := public_tournament_bundle('a-cup');
  PERFORM test.ok((SELECT bool_or(m->>'station' = 'Station 3') FROM jsonb_array_elements(b->'matches') m), 'station appears in the public bundle');
  PERFORM test.ok(position('"phone' in b::text) = 0, 'bundle still has no phone numbers after adding stations');
  RESET ROLE;
  PERFORM test.ok(test.fails($q$UPDATE matches SET station = repeat('x', 21)$q$), 'station longer than 20 characters is rejected');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  PERFORM test.ok(test.affected($q$UPDATE matches SET station = 'hack' WHERE tournament_id = 'a1000000-0000-0000-0000-000000000001'$q$) = 0, 'other organizer cannot set stations on my matches');
  RESET ROLE;
END $$;

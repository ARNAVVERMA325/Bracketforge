/*
# 014 Stations (rig / table number per match)

matches.station: free text up to 20 chars (e.g. "Station 3", "PS5-2"). Shown on the public page,
the café TV screen, the OBS overlay and the referee screen. Several matches can be "on now" at
the same time (one per station).
*/
ALTER TABLE matches ADD COLUMN IF NOT EXISTS station text;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_station_len;
ALTER TABLE matches ADD CONSTRAINT matches_station_len CHECK (station IS NULL OR char_length(station) <= 20);

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
           'bracket_side', m.bracket_side, 'station', m.station, 'player1_id', m.player1_id, 'player2_id', m.player2_id,
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
      'id', m.id, 'round', m.round, 'match_index', m.match_index, 'bracket_side', m.bracket_side, 'station', m.station,
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

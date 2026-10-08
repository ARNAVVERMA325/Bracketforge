/*
# Create referees and app_settings tables, plus super-admin functions

1. New Tables
- `referees`: Tournament referees with score-only role.
- `app_settings`: Global platform settings (single row, id=1).

2. Security
- `referees`: organizer can CRUD referees for their tournaments.
- `app_settings`: readable by all, writable ONLY by super-admin via SECURITY DEFINER function.

3. Functions
- `is_super_admin()`: Returns true if the current user has role='super_admin'.
- `admin_list_organizers()`: Lists all organizers with tournament counts.
- `admin_toggle_organizer(p_user_id, p_disabled)`: Enable/disable an organizer.
- `admin_set_tournament_payment(p_tournament_id, p_status, p_mode)`: Mark tournament paid/unpaid.
- `admin_list_tournaments()`: Lists all tournaments with organizer info.
- `admin_get_stats()`: Platform-wide statistics.
- `admin_update_beta_setting(p_free)`: Toggle free-during-beta.

4. Important Notes
- The super-admin role is set manually: UPDATE profiles SET role='super_admin' WHERE email='your-email'.
*/

-- Referees table
CREATE TABLE IF NOT EXISTS referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referees_select_organizer" ON referees;
CREATE POLICY "referees_select_organizer" ON referees FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = referees.tournament_id AND tournaments.organizer_id = auth.uid())
);

DROP POLICY IF EXISTS "referees_insert_organizer" ON referees;
CREATE POLICY "referees_insert_organizer" ON referees FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = referees.tournament_id AND tournaments.organizer_id = auth.uid())
);

DROP POLICY IF EXISTS "referees_delete_organizer" ON referees;
CREATE POLICY "referees_delete_organizer" ON referees FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = referees.tournament_id AND tournaments.organizer_id = auth.uid())
);

GRANT SELECT ON referees TO authenticated;
GRANT INSERT ON referees TO authenticated;
GRANT DELETE ON referees TO authenticated;

CREATE INDEX IF NOT EXISTS idx_referees_tournament_id ON referees(tournament_id);

-- App settings table (singleton)
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  free_during_beta boolean NOT NULL DEFAULT true,
  plan_fee_inr integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_all" ON app_settings;
CREATE POLICY "app_settings_select_all" ON app_settings FOR SELECT
TO anon, authenticated USING (true);

GRANT SELECT ON app_settings TO anon, authenticated;

INSERT INTO app_settings (id, free_during_beta, plan_fee_inr) VALUES (1, true, 300)
ON CONFLICT (id) DO NOTHING;

-- Helper function: is the current user a super admin?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin' FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

-- Super-admin: list all organizers with tournament counts
CREATE OR REPLACE FUNCTION admin_list_organizers()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  organization text,
  city text,
  logo_url text,
  is_disabled boolean,
  created_at timestamptz,
  tournament_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.email, p.display_name, p.organization, p.city, p.logo_url,
    p.is_disabled, p.created_at,
    COALESCE(t.cnt, 0) as tournament_count
  FROM profiles p
  LEFT JOIN (SELECT organizer_id, count(*) as cnt FROM tournaments GROUP BY organizer_id) t
    ON t.organizer_id = p.id
  WHERE p.role = 'organizer'
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_list_organizers() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_list_organizers() TO authenticated;

-- Super-admin: enable/disable an organizer
CREATE OR REPLACE FUNCTION admin_toggle_organizer(p_user_id uuid, p_disabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles SET is_disabled = p_disabled WHERE id = p_user_id AND role = 'organizer';
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_toggle_organizer(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_organizer(uuid, boolean) TO authenticated;

-- Super-admin: mark tournament payment status
CREATE OR REPLACE FUNCTION admin_set_tournament_payment(
  p_tournament_id uuid,
  p_payment_status text,
  p_payment_mode text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_payment_status NOT IN ('unpaid', 'paid', 'free') THEN
    RAISE EXCEPTION 'Invalid payment status';
  END IF;

  UPDATE tournaments
  SET payment_status = p_payment_status, payment_mode = p_payment_mode
  WHERE id = p_tournament_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text) TO authenticated;

-- Super-admin: list all tournaments
CREATE OR REPLACE FUNCTION admin_list_tournaments()
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  game text,
  organizer_name text,
  organizer_email text,
  status text,
  payment_status text,
  plan text,
  player_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.title, t.slug, t.game,
    p.display_name as organizer_name,
    p.email as organizer_email,
    t.status, t.payment_status, t.plan,
    COALESCE(pl.cnt, 0) as player_count,
    t.created_at
  FROM tournaments t
  JOIN profiles p ON p.id = t.organizer_id
  LEFT JOIN (SELECT tournament_id, count(*) as cnt FROM players GROUP BY tournament_id) pl
    ON pl.tournament_id = t.id
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_list_tournaments() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_list_tournaments() TO authenticated;

-- Super-admin: get platform stats
CREATE OR REPLACE FUNCTION admin_get_stats()
RETURNS TABLE (
  total_organizers bigint,
  active_organizers bigint,
  total_tournaments bigint,
  live_tournaments bigint,
  total_players bigint,
  paid_tournaments bigint,
  free_during_beta boolean,
  plan_fee_inr integer
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM profiles WHERE role = 'organizer') as total_organizers,
    (SELECT count(*) FROM profiles WHERE role = 'organizer' AND is_disabled = false) as active_organizers,
    (SELECT count(*) FROM tournaments) as total_tournaments,
    (SELECT count(*) FROM tournaments WHERE status = 'live') as live_tournaments,
    (SELECT count(*) FROM players) as total_players,
    (SELECT count(*) FROM tournaments WHERE payment_status = 'paid') as paid_tournaments,
    (SELECT free_during_beta FROM app_settings WHERE id = 1) as free_during_beta,
    (SELECT plan_fee_inr FROM app_settings WHERE id = 1) as plan_fee_inr;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_get_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_get_stats() TO authenticated;

-- Super-admin: update beta setting
CREATE OR REPLACE FUNCTION admin_update_beta_setting(p_free boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE app_settings SET free_during_beta = p_free WHERE id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_update_beta_setting(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_update_beta_setting(boolean) TO authenticated;

/*
# 013 Super-admin: recorded revenue and configurable price

- Each paid tournament records the amount (price at the time) and date, so changing the price
  later never rewrites past revenue. Optional note for the UPI reference.
- admin_set_plan_fee(): super-admin changes the per-tournament price (default Rs 300).
- admin_get_stats() now also returns revenue_inr (sum of recorded amounts).
*/
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS paid_amount_inr integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS payment_note text;

-- backfill: tournaments already marked paid get the current price
UPDATE tournaments SET paid_amount_inr = (SELECT plan_fee_inr FROM app_settings WHERE id = 1), paid_at = COALESCE(updated_at, now())
 WHERE payment_status = 'paid' AND paid_amount_inr IS NULL;

DROP FUNCTION IF EXISTS admin_set_tournament_payment(uuid, text, text);
CREATE OR REPLACE FUNCTION admin_set_tournament_payment(
  p_tournament_id uuid, p_payment_status text, p_payment_mode text DEFAULT 'manual', p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_payment_status NOT IN ('unpaid', 'paid', 'free') THEN RAISE EXCEPTION 'Invalid payment status'; END IF;

  UPDATE tournaments SET
    payment_status = p_payment_status,
    payment_mode = p_payment_mode,
    payment_note = left(p_note, 120),
    paid_amount_inr = CASE WHEN p_payment_status <> 'paid' THEN NULL
                           WHEN payment_status = 'paid' THEN paid_amount_inr
                           ELSE (SELECT plan_fee_inr FROM app_settings WHERE id = 1) END,
    paid_at = CASE WHEN p_payment_status <> 'paid' THEN NULL
                   WHEN payment_status = 'paid' THEN paid_at
                   ELSE now() END
  WHERE id = p_tournament_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_plan_fee(p_fee integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_fee IS NULL OR p_fee < 0 OR p_fee > 100000 THEN RAISE EXCEPTION 'Invalid fee'; END IF;
  UPDATE app_settings SET plan_fee_inr = p_fee, updated_at = now() WHERE id = 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_plan_fee(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_plan_fee(integer) TO authenticated;

DROP FUNCTION IF EXISTS admin_get_stats();
CREATE OR REPLACE FUNCTION admin_get_stats() RETURNS TABLE (
  total_organizers bigint, active_organizers bigint, total_tournaments bigint, live_tournaments bigint,
  total_players bigint, paid_tournaments bigint, free_during_beta boolean, plan_fee_inr integer, revenue_inr bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM profiles WHERE role = 'organizer'),
    (SELECT count(*) FROM profiles WHERE role = 'organizer' AND is_disabled = false),
    (SELECT count(*) FROM tournaments),
    (SELECT count(*) FROM tournaments WHERE status = 'live'),
    (SELECT count(*) FROM players),
    (SELECT count(*) FROM tournaments WHERE payment_status = 'paid'),
    (SELECT s.free_during_beta FROM app_settings s WHERE s.id = 1),
    (SELECT s.plan_fee_inr FROM app_settings s WHERE s.id = 1),
    (SELECT COALESCE(sum(t.paid_amount_inr), 0) FROM tournaments t WHERE t.payment_status = 'paid');
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_get_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_get_stats() TO authenticated;

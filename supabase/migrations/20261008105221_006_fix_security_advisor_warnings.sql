/*
# Fix security advisor warnings

1. Revoke EXECUTE from anon on all admin functions (they check is_super_admin internally, but defense in depth)
2. Fix search_path on update_updated_at trigger function
3. Note: handle_new_user and is_super_admin need to be callable by authenticated (not anon)
*/

-- Fix search_path on update_updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke anon execute on all admin functions
REVOKE EXECUTE ON FUNCTION admin_get_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION admin_list_organizers() FROM anon;
REVOKE EXECUTE ON FUNCTION admin_list_tournaments() FROM anon;
REVOKE EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_toggle_organizer(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_update_beta_setting(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;

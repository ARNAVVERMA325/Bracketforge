/*
# Harden public database privileges

1. Security changes
- Remove default table write privileges from anon and authenticated where policies are not intended to allow them.
- Keep public tournament and bracket reads available.
- Keep anonymous player registration insert available, while blocking anonymous player edits and deletes.
- Revoke SECURITY DEFINER function execution from PUBLIC and anon; only signed-in authenticated users can call admin functions.

2. Important notes
- Row-level policies remain the final authorization layer.
- Public spectators can still read public tournament data, player display fields, and matches.
- Organizer writes remain available only through their existing ownership policies.
*/

REVOKE ALL ON profiles FROM anon;
REVOKE DELETE ON profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON tournaments FROM anon;
REVOKE UPDATE, DELETE ON players FROM anon;
REVOKE INSERT, UPDATE, DELETE ON matches FROM anon;
REVOKE ALL ON referees FROM anon;
REVOKE INSERT, UPDATE, DELETE ON app_settings FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_list_organizers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_toggle_organizer(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_list_tournaments() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_get_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_update_beta_setting(boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_organizers() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_organizer(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_tournament_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_beta_setting(boolean) TO authenticated;

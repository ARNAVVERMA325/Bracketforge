/*
# Restore safe public bracket reads

1. Public access
- Allow anonymous spectators to read only player display fields needed by brackets.
- Keep phone numbers and normalized phone numbers private.
- Keep anonymous registration inserts available.

2. Function security
- Remove direct RPC execution of internal trigger functions.
*/

GRANT SELECT (id, tournament_id, name, team_tag, character_loadout, status, seed, registered_at, checked_in_at) ON players TO anon;
GRANT INSERT (tournament_id, name, phone, phone_normalized, team_tag, character_loadout) ON players TO anon;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_updated_at() FROM PUBLIC, anon, authenticated;

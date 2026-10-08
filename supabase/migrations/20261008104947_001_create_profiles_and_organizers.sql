/*
# Create profiles table with role system

1. New Tables
- `profiles`: Extends Supabase auth.users with organizer-specific data.
  - `id` (uuid, PK, references auth.users)
  - `email` (text, unique — copied from auth.users for convenience)
  - `display_name` (text — the organizer's personal name)
  - `organization` (text — café/club/esports group name)
  - `city` (text — Indian city for the organizer)
  - `logo_url` (text — optional URL to uploaded logo)
  - `role` (text — 'organizer' or 'super_admin'; defaults to 'organizer'; NEVER client-writable)
  - `is_disabled` (boolean — super-admin can disable an organizer; defaults false; NEVER client-writable)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `profiles`.
- Users can read their own profile.
- Users can update only display_name, organization, city, logo_url (NOT role, NOT is_disabled).
- Column-level privileges revoke UPDATE on role and is_disabled from authenticated.
- Super-admin reads are handled via a SECURITY DEFINER function (added in a later migration).

3. Important Notes
- The `role` column is set to 'organizer' by default. The super-admin account is manually set in the database.
- Column-level grants ensure users cannot change their role or disable status even via direct API calls.
- A trigger copies new auth.users into profiles automatically.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  logo_url text,
  role text NOT NULL DEFAULT 'organizer' CHECK (role IN ('organizer', 'super_admin')),
  is_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

-- INSERT: only on signup, must be own row
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

-- UPDATE: users can update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Column-level: revoke UPDATE on sensitive columns
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (display_name, organization, city, logo_url) ON profiles TO authenticated;

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant necessary permissions
GRANT SELECT ON profiles TO authenticated;
GRANT INSERT (id, email, display_name, organization, city, logo_url) ON profiles TO authenticated;

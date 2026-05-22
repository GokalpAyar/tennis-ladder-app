# delete-account-permanently

Secure Edge Function for admin-only account deletion.

Required Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not add the service role key to any frontend `.env` file. The React app calls this
function with the logged-in admin session, and the function verifies `profiles.role = 'admin'`
before deleting anything.

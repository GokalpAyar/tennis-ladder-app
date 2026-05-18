# Tennis Ladder App

React + TypeScript + Vite + Tailwind CSS starter for a tennis ladder web application.

## Scripts

```bash
npm install
npm run dev
```

## Environment Variables

Create `.env` from `.env.example` and add your Supabase project values:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Only variables prefixed with `VITE_` are exposed to the browser by Vite.

## Project Structure

```text
src/
  app/            App shell and shared application layout
  assets/         Static assets imported by React
  components/     Reusable UI components
  features/       Domain feature modules
    challenges/   Challenge eligibility and match agreement workflow
    ladder/       Ladder standings and rankings
    matches/      Match scheduling and results
    players/      Player profile UI modules
  lib/            Shared utilities and service helpers, including Supabase
  pages/          Route-level pages for auth and dashboard
  styles/         Global styles
  types/          Shared TypeScript types
```

Tailwind CSS is configured through the Vite plugin and imported from `src/styles/index.css`.
Supabase email/password auth is configured with `/login`, `/signup`, and protected `/dashboard` routes.
The challenge workflow uses `profiles`, `ladder_rankings`, `matches`, and `courts`; see `supabase/challenge-schema.sql` for the needed match columns and policies.
Admin role support and dashboard policies are in `supabase/admin-schema.sql`.
The current scaffold is intentionally minimal. Ladder features, routing, state management, and API integration can be added next.

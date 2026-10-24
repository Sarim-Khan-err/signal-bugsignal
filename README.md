# Signal

Signal gives B2B SaaS support teams one place to record customer-reported bugs, track investigation status, and send clear progress updates. Reports are isolated by workspace. The Integrations screen embeds Fastn's customer connection hub and requests short-lived tokens from Signal's server.

## Run the local preview

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. Set `SIGNAL_SESSION_SECRET` to a random value of at least 32 characters. Set distinct, strong values for `SIGNAL_NORTHSTAR_PASSWORD` and `SIGNAL_ORBIT_PASSWORD`.
4. Run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

Without Supabase configuration, sign-in uses local preview passwords and reports are saved to `data/signal.json`. This mode is for development only. Do not deploy it or use it with customer information. The checked-in data file is empty and ignored by Git.

## Turn on individual accounts and hosted report storage

The app uses Supabase Auth for individual email/password accounts and Supabase Postgres for reports. It uses the signed-in user's access token for every database request, and Postgres row-level security restricts reports to workspace members. It does not use a service-role key.

1. Create a Supabase project and apply `supabase/migrations/20261024000000_signal_core.sql` in the Supabase SQL Editor (or with the Supabase CLI).
2. In Supabase Authentication, create each person's user account. Keep public sign-ups disabled unless you intentionally want open registration.
3. Give each user access by inserting a membership row, replacing the email and workspace ID:

   ```sql
   insert into public.workspace_memberships (workspace_id, user_id, role)
   select 'northstar', id, 'owner'
   from auth.users
   where email = 'admin@yourcompany.com'
   on conflict (workspace_id, user_id) do nothing;
   ```

   Use `orbit` for the other seeded workspace. A user may have a membership in both.
4. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the Supabase project in `.env.local` locally, or in the deployment host's encrypted environment settings. Never use a `service_role` key in this app.
5. Restart the app. It will use individual account sign-in and read/write reports in Supabase. If Supabase is configured but the migration or membership is missing, it fails with a setup error rather than falling back to local data.

The starter migration seeds two workspaces to match the current prototype. A production onboarding flow should create customer workspaces and memberships through an admin-only invite process; it should not expose a public workspace selector or membership creation to normal users.

## Turn on real customer email

The report detail and row actions call a server endpoint that builds an update from the saved report, sends it through Resend, and uses an idempotency key to suppress repeated clicks for the same status update. The browser never receives the Resend API key.

1. Create a Resend account and verify a sending domain.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `SIGNAL_FROM_EMAIL` to a sender address on that verified domain, such as `Signal Support <updates@example.com>`.
4. Restart or redeploy, then send a test report update to an address you control.

Until configured, the app reports that email is unavailable and does not pretend a draft was delivered. Provider-side delivery still depends on domain verification, DNS, and recipient mail filtering.

## Deploy the Next.js app

The current application uses Next.js server routes and Node APIs. Deploy it on a host that supports the Next.js Node.js runtime (Vercel is the straightforward option); the Fastn Sites runtime is a separate platform and is not a drop-in host for this app.

1. Create a private GitHub repository and push this folder. `.env.local`, local reports, and build output are ignored.
2. Import the repository into Vercel and keep the default Next.js build settings.
3. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `SIGNAL_FROM_EMAIL`, and (when Fastn is configured) `FASTN_API_KEY` and `FASTN_BASE_URL` as encrypted production environment variables.
4. Do not add the local preview passwords to production. Production sign-in fails closed unless Supabase is configured.
5. Deploy a preview first, verify login, cross-workspace isolation, report create/update, and email delivery, then promote the production deployment.
6. Set the production site URL in Supabase Auth URL configuration and use HTTPS. Review recovery, backup, access, and retention settings before onboarding customers.

A private GitHub repository contains the reviewed source at `Sarim-Khan-err/signal-bugsignal`. Supabase is connected and the core migration is applied to a clean hosted project. Reports and memberships are empty. Workspace names remain private to the Data API. The local `.env.local` points to this Supabase project and is ignored by Git. Resend and Fastn credentials are not configured, and Vercel access to the account team must be granted before creating a deployment. The app is not yet publicly deployed.

## Fastn setup

The Integrations screen uses Fastn's official `@fastn-ai/embed` React hub. The server token route derives the customer scope from a verified Signal workspace session. Set `FASTN_API_KEY` and `FASTN_BASE_URL` privately. The partner key needs connector-read and customer-provisioning permissions. Publish connectors and workflows in a dedicated Fastn organization for Signal; do not reuse or edit another project's live integrations.

## Hackathon disclosure

The interface and local report flow were prepared before the hackathon. Clearly identify the Fastn connections, workflows, and features added during the event and do not describe an unconfigured connector as working.

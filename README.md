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
2. In Supabase Authentication, invite each person's account. Public sign-ups should stay disabled unless you intentionally want open registration.
3. Give each invited user access by inserting a membership row, replacing the email and workspace ID:

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

The migration seeds the two current workspaces, `northstar` and `orbit`. The app has no self-service organization or member onboarding yet. Workspace creation and membership changes are managed by an owner in Supabase; do not expose membership creation to normal users. Workspace names stay private to the Data API by design, while signed-in members can read only their own memberships and workspace reports.

## Turn on real customer email

The report detail and row actions call a server endpoint that builds an update from the saved report, sends it through Resend, and uses an idempotency key to suppress repeated clicks for the same status update. The browser never receives the Resend API key.

1. Create a Resend account and verify a sending domain.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `SIGNAL_FROM_EMAIL` to a sender address on that verified domain, such as `Signal Support <updates@example.com>`.
4. Restart or redeploy, then send a test report update to an address you control.

Until configured, the app reports that email is unavailable and does not pretend a draft was delivered. Provider-side delivery still depends on domain verification, DNS, and recipient mail filtering. Password reset and invite emails use Supabase Auth; Supabase's built-in email provider is limited to 2 emails per hour across the project, so configure custom SMTP before inviting multiple users or using this for customer accounts.

## Deploy the Next.js app

The current application uses Next.js server routes and Node APIs. Deploy it on a host that supports the Next.js Node.js runtime (Vercel is the straightforward option); the Fastn Sites runtime is a separate platform and is not a drop-in host for this app.

The app is deployed publicly at [signal-bugsignal.vercel.app](https://signal-bugsignal.vercel.app/) from the private repository `Sarim-Khan-err/signal-bugsignal`. Vercel production has `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; Supabase Auth URL configuration points to the production HTTPS URL. The `sarimniaziii@gmail.com` account is an owner of both seeded workspaces. Reports are stored in Supabase, and the current reports table is empty. Preview deployments remain protected.

Customer update emails are not active in production yet because `RESEND_API_KEY` and `SIGNAL_FROM_EMAIL` have not been configured. Fastn is configured for production report triage through the Signal Hackathon environment, with a scoped API key and the active trigger URL. Deploy the latest source before verifying the report flow; verify workspace isolation and customer email delivery before inviting customer teams. Do not add local preview passwords to production. Review recovery, backup, access, and retention settings before onboarding customers.

## Fastn setup

The Integrations screen uses Fastn's official `@fastn-ai/embed` React hub. The server token route derives the customer scope from a verified Signal workspace session. Set `FASTN_API_KEY` and `FASTN_BASE_URL` privately. To route new reports into Fastn, also set `FASTN_REPORT_CREATED_WEBHOOK_URL` to the active report-triage trigger URL. The server sends an idempotent `report.created` event using the same-workspace Fastn API key in the `x-api-key` header. For test keys, it also sends `X-fastn-Test-Mode: true`. Reporter name and email are excluded. Signal still saves the report if Fastn is unavailable and shows the delivery state. Keep the key and webhook URL server-side. The partner key needs connector-read and customer-provisioning permissions. Publish the workflow to the trigger's selected environment before testing. Keep Fastn usage to setup and verification while on the free credit allowance.

## Beta testing tasks

The Beta testing area lets authenticated workspace members create focused test tasks, join an open task, and track task status and participant counts. Tasks and participants are workspace-scoped and protected by Supabase row-level security. The migration `supabase/migrations/20261024010000_beta_testing.sql` has been applied to the connected Supabase project. Workspace owners/admins can update task status; any workspace member can create and join tasks. Invite beta testers to the workspace through the existing Supabase membership process. Bug reports can still be filed from Reports but are not automatically associated with a beta task yet.

## Hackathon disclosure

The interface and local report flow were prepared before the hackathon. Clearly identify the Fastn connections, workflows, and features added during the event and do not describe an unconfigured connector as working.

-- Signal workspaces and reports. Apply this migration before enabling hosted auth.
create table if not exists public.workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.workspaces (id, name) values
  ('northstar', 'Northstar Cloud'),
  ('orbit', 'Orbit Analytics')
on conflict (id) do update set name = excluded.name;

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_id_idx on public.workspace_memberships (user_id);

create table if not exists public.reports (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  customer text not null check (char_length(customer) between 1 and 180),
  email text not null check (char_length(email) between 3 and 180),
  product text not null check (char_length(product) between 1 and 180),
  description text not null check (char_length(description) between 1 and 5000),
  status text not null default 'Investigating' check (status in ('Investigating', 'In progress', 'Fixed')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  issue text not null default 'Not linked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_workspace_created_idx on public.reports (workspace_id, created_at desc);

alter table public.workspace_memberships enable row level security;
alter table public.reports enable row level security;

revoke all on public.workspaces, public.workspace_memberships, public.reports from anon, authenticated;
grant select on public.workspace_memberships to authenticated;
grant select, insert, update on public.reports to authenticated;

create policy "Members can read their own membership"
  on public.workspace_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Workspace members can read reports"
  on public.reports for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = reports.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create policy "Workspace members can create reports"
  on public.reports for insert to authenticated
  with check (exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = reports.workspace_id
      and membership.user_id = (select auth.uid())
  ));

create policy "Workspace members can update reports"
  on public.reports for update to authenticated
  using (exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = reports.workspace_id
      and membership.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = reports.workspace_id
      and membership.user_id = (select auth.uid())
  ));

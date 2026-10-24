-- Lightweight workspace-scoped beta testing tasks and participation.
create table if not exists public.beta_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  description text not null check (char_length(description) between 1 and 3000),
  product text not null check (char_length(product) between 1 and 100),
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beta_task_participants (
  task_id uuid not null references public.beta_tasks(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (task_id, user_id),
  constraint beta_task_participants_workspace_pair unique (task_id, workspace_id, user_id)
);

create index if not exists beta_tasks_workspace_created_idx on public.beta_tasks (workspace_id, created_at desc);
create index if not exists beta_task_participants_workspace_task_idx on public.beta_task_participants (workspace_id, task_id);

alter table public.beta_tasks enable row level security;
alter table public.beta_task_participants enable row level security;
revoke all on public.beta_tasks, public.beta_task_participants from anon, authenticated;
grant select, insert, update on public.beta_tasks to authenticated;
grant select, insert, delete on public.beta_task_participants to authenticated;

create policy "Workspace members can read beta tasks" on public.beta_tasks for select to authenticated
  using (exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_tasks.workspace_id and m.user_id = (select auth.uid())));
create policy "Workspace members can create beta tasks" on public.beta_tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_tasks.workspace_id and m.user_id = (select auth.uid())));
create policy "Workspace admins can update beta tasks" on public.beta_tasks for update to authenticated
  using (exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_tasks.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_tasks.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy "Workspace members can read task participants" on public.beta_task_participants for select to authenticated
  using (exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_task_participants.workspace_id and m.user_id = (select auth.uid())));
create policy "Members can join tasks in their workspace" on public.beta_task_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.workspace_memberships m where m.workspace_id = beta_task_participants.workspace_id and m.user_id = (select auth.uid())) and exists (select 1 from public.beta_tasks t where t.id = beta_task_participants.task_id and t.workspace_id = beta_task_participants.workspace_id and t.status <> 'Completed'));
create policy "Members can leave their own tasks" on public.beta_task_participants for delete to authenticated
  using (user_id = (select auth.uid()));

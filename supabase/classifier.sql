-- Classifier Logs Table
create table if not exists public.classifier_logs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  user_input text,
  classification_json jsonb,
  created_at timestamp with time zone default now()
);

alter table public.classifier_logs enable row level security;

create policy "Users can view own classifier logs"
on public.classifier_logs for select
using ( auth.uid() in (select user_id from public.sessions where id = session_id) );

create policy "Users can insert own classifier logs"
on public.classifier_logs for insert
with check ( auth.uid() in (select user_id from public.sessions where id = session_id) );

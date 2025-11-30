-- Enable Row Level Security on messages table
alter table public.messages enable row level security;

-- Allow users to view messages for sessions they own
create policy "Users can view own session messages"
  on public.messages for select
  using (
    auth.uid() in (
      select user_id from public.sessions where id = session_id
    )
  );

-- Allow users to insert messages for sessions they own
create policy "Users can insert own session messages"
  on public.messages for insert
  with check (
    auth.uid() in (
      select user_id from public.sessions where id = session_id
    )
  );

-- Allow users to update messages for sessions they own
create policy "Users can update own session messages"
  on public.messages for update
  using (
    auth.uid() in (
      select user_id from public.sessions where id = session_id
    )
  );

-- Allow users to delete messages for sessions they own
create policy "Users can delete own session messages"
  on public.messages for delete
  using (
    auth.uid() in (
      select user_id from public.sessions where id = session_id
    )
  );

-- Folders Table
create table if not exists public.folders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  description text,
  created_at timestamp with time zone default now()
);

-- Folder Items Table
create table if not exists public.folder_items (
  id uuid primary key default uuid_generate_v4(),
  folder_id uuid references public.folders(id) on delete cascade not null,
  image_url text not null,
  title text,
  description text,
  created_at timestamp with time zone default now(),
  added_by uuid references auth.users(id)
);

-- RLS Policies (Optional but recommended)
alter table public.folders enable row level security;
alter table public.folder_items enable row level security;

create policy "Users can view their own folders"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Users can create their own folders"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Users can view items in their folders"
  on public.folder_items for select
  using (
    exists (
      select 1 from public.folders
      where folders.id = folder_items.folder_id
      and folders.user_id = auth.uid()
    )
  );

create policy "Users can insert items into their folders"
  on public.folder_items for insert
  with check (
    exists (
      select 1 from public.folders
      where folders.id = folder_items.folder_id
      and folders.user_id = auth.uid()
    )
  );

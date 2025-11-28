-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- sessions table
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamp with time zone default now(),
  brand_name text,
  product_name text,
  initial_mood_board_vibe text,
  user_id uuid references auth.users(id)
);

-- mood_board_items table
create table if not exists public.mood_board_items (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  image_url text not null,
  description text,
  order_index integer not null,
  added_by uuid references auth.users(id),
  created_at timestamp with time zone default now(),
  is_curated boolean default true
);

-- generations table
create table if not exists public.generations (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  prompt_proposed text not null,
  prompt_edited text,
  user_feedback_on_prompt boolean,
  image_a_url text,
  image_b_url text,
  selected_image_url text,
  user_explanation text,
  created_at timestamp with time zone default now()
);

-- feedback table
create table if not exists public.mood_board_feedback (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  initial_image_url text not null,
  is_kept boolean not null,
  created_at timestamp with time zone default now()
);

-- messages table (New)
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  role text not null, -- 'user' or 'assistant'
  content text not null,
  type text not null default 'text', -- 'text', 'proposal'
  proposal_status text, -- 'pending', 'accepted', 'rejected'
  proposal_prompt text,
  created_at timestamp with time zone default now()
);
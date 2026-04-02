-- Run this in your Supabase SQL Editor

create table if not exists issues (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  area text not null,
  unit text,
  category text default 'Other',
  priority text default 'Normal',
  description text not null,
  status text default 'Open',
  photos text[] default '{}',
  ai_insight text,
  logged_by text
);

-- Enable real-time updates
alter publication supabase_realtime add table issues;

-- Allow public read/write (for your 2-person team, no auth needed)
alter table issues enable row level security;
create policy "Allow all" on issues for all using (true) with check (true);

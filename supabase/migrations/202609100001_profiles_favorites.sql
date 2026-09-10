begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '' check (char_length(username) <= 80),
  created_at timestamptz not null default now()
);

-- product_id is the stable string ID from products.json; no online catalog table.
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (char_length(product_id) between 1 and 512),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
revoke all on public.profiles, public.favorites from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy favorites_select_own on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy favorites_insert_own on public.favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy favorites_update_own on public.favorites for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy favorites_delete_own on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;

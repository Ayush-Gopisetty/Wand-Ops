create table if not exists public.player_lifetime_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kills bigint not null default 0,
  deaths bigint not null default 0,
  assists bigint not null default 0,
  damage_dealt bigint not null default 0,
  damage_taken bigint not null default 0,
  spells_cast bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

alter table public.player_lifetime_stats enable row level security;

drop policy if exists "Users can read own lifetime stats" on public.player_lifetime_stats;
create policy "Users can read own lifetime stats"
on public.player_lifetime_stats
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own lifetime stats" on public.player_lifetime_stats;
create policy "Users can insert own lifetime stats"
on public.player_lifetime_stats
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own lifetime stats" on public.player_lifetime_stats;
create policy "Users can update own lifetime stats"
on public.player_lifetime_stats
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.increment_player_lifetime_stats(
  p_kills integer default 0,
  p_deaths integer default 0,
  p_assists integer default 0,
  p_damage_dealt integer default 0,
  p_damage_taken integer default 0,
  p_spells_cast integer default 0
)
returns public.player_lifetime_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.player_lifetime_stats;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.player_lifetime_stats as stats (
    user_id,
    kills,
    deaths,
    assists,
    damage_dealt,
    damage_taken,
    spells_cast
  )
  values (
    v_user_id,
    greatest(p_kills, 0),
    greatest(p_deaths, 0),
    greatest(p_assists, 0),
    greatest(p_damage_dealt, 0),
    greatest(p_damage_taken, 0),
    greatest(p_spells_cast, 0)
  )
  on conflict (user_id) do update
  set
    kills = stats.kills + greatest(p_kills, 0),
    deaths = stats.deaths + greatest(p_deaths, 0),
    assists = stats.assists + greatest(p_assists, 0),
    damage_dealt = stats.damage_dealt + greatest(p_damage_dealt, 0),
    damage_taken = stats.damage_taken + greatest(p_damage_taken, 0),
    spells_cast = stats.spells_cast + greatest(p_spells_cast, 0),
    updated_at = timezone('utc', now()),
    last_seen_at = timezone('utc', now())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.increment_player_lifetime_stats(integer, integer, integer, integer, integer, integer) to authenticated;

-- =====================================================================
-- FASE 1 — correções urgentes de segurança (Copa Influence / ChurchEvent)
-- Não muda regra de torneio. Tudo numa transação: se algo falhar, nada é aplicado.
-- =====================================================================
begin;

-- 1) is_admin() sem recursão (SECURITY DEFINER lê admins ignorando RLS)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- 2) reset_sport (usado pelo painel ao remover time) passa a exigir admin
create or replace function public.reset_sport(p_sport_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.match_events where match_id in (select id from public.matches where sport_id=p_sport_id);
  delete from public.matches where sport_id=p_sport_id;
  delete from public.standings where sport_id=p_sport_id;
  update public.teams set group_name=null where sport_id=p_sport_id;
end $$;

-- 3) fifa_preserve_order_and_reset_played (usado pelo painel) passa a exigir admin
CREATE OR REPLACE FUNCTION public.fifa_preserve_order_and_reset_played(p_reset_played boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid  uuid;
  v_lock bigint := hashtext('fifa-freeze-order');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id into v_sid from public.sports where name='FIFA' limit 1;
  if v_sid is null then
    raise exception 'Esporte FIFA não encontrado';
  end if;

  perform pg_advisory_lock(v_lock);

  -- 1) Garante a existência do esqueleto (NÃO toca no que já existe)
  with want(stage, rmin, rmax) as (
    values ('r32',1,16), ('oitavas',1,8), ('quartas',1,4), ('semi',1,2), ('final',1,1), ('3lugar',1,1)
  )
  insert into public.matches (sport_id, stage, round, status, order_idx)
  select v_sid, w.stage, gs.n, public.safe_match_status('scheduled'),
         case w.stage
           when 'r32'     then gs.n
           when 'oitavas' then 16 + gs.n
           when 'quartas' then 24 + gs.n
           when 'semi'    then 28 + gs.n
           when 'final'   then 31
           when '3lugar'  then 32
         end
  from want w
  join generate_series(w.rmin, w.rmax) as gs(n) on true
  where not exists (
    select 1 from public.matches m
    where m.sport_id=v_sid and m.stage=w.stage and m.round=gs.n
  );

  -- 2) (Opcional) resetar apenas partidas jogadas, SEM mexer na R32
  if p_reset_played then
    -- apaga eventos só do que terminou
    delete from public.match_events me
    using public.matches m
    where me.match_id = m.id
      and m.sport_id  = v_sid
      and m.status    = 'finished'::match_status;

    -- volta status e zera placar (NOT NULL)
    update public.matches
       set status     = public.safe_match_status('scheduled'),
           home_score = 0,
           away_score = 0,
           updated_at = now()
     where sport_id = v_sid
       and status   = 'finished'::match_status;
  end if;

  -- 3) Propaga vencedores pra frente SEM tocar na R32
  perform public.fifa_backfill_knockout_chain(v_sid);
  perform public.ensure_final_and_third_from_semis(v_sid);

  perform pg_advisory_unlock(v_lock);
exception when others then
  perform pg_advisory_unlock(v_lock);
  raise;
end;
$function$;

-- 4) Ninguém anônimo executa função nenhuma, exceto is_admin (usada nas policies)
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
grant  execute on function public.is_admin() to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 5) Funções SECURITY DEFINER sem checagem de admin e que o app não usa:
--    nem usuário logado comum pode chamar (as chamadas internas rodam como owner e continuam ok)
revoke execute on function
  public.admin_set_match_status(uuid, text),
  public.admin_regenerate_fifa_fixed(),
  public.regenerate_fifa_wrapper(),
  public.seed_knockout_wrapper(text),
  public.admin_seed_knockout_now(text),
  public.fifa_generate_bracket_fixed(),
  public.fifa_generate_or_repair_bracket_fixed(boolean),
  public.seed_semis_from_groups(text, text, text, integer, integer),
  public.admin_autoset_order(uuid),
  public.is_admin_for(uuid),
  public.handle_match_update()
from authenticated;
alter function public.admin_set_match_status(uuid, text) set search_path = public, pg_temp;
alter function public.admin_seed_knockout_now(text)      set search_path = public, pg_temp;
alter function public.regenerate_fifa_wrapper()           set search_path = public, pg_temp;
alter function public.seed_knockout_wrapper(text)         set search_path = public, pg_temp;
alter function public.handle_match_update()               set search_path = public, pg_temp;

-- 6) Cadastro não pode mais escolher o próprio "role"
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, email, role) values (new.id, new.email, 'viewer')
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;
create or replace function public.handle_new_invited_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, email, role) values (new.id, new.email, 'viewer')
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;

-- 7) profiles: remove a policy recursiva e impede que o usuário mude o próprio role/is_admin
drop policy if exists "profiles admin read all" on public.profiles;
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'viewer'; new.is_admin := false;
    elsif new.role is distinct from old.role or new.is_admin is distinct from old.is_admin then
      raise exception 'role change not allowed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- 8) Views passam a respeitar o RLS de quem consulta e deixam de aceitar escrita
alter view public.standings_points_v   set (security_invoker = on);
alter view public.standings_view       set (security_invoker = on);
alter view public.standings_volei_view set (security_invoker = on);
alter view public.standings_seed_view  set (security_invoker = on);
alter view public.match_scores         set (security_invoker = on);
alter view public.match_detail_view    set (security_invoker = on);
alter view public.v_queue_slots        set (security_invoker = on);
alter view public.v_queue_slots_v2     set (security_invoker = on);
alter view public.v_queue_slots_v3     set (security_invoker = on);
revoke insert, update, delete on
  public.standings_points_v, public.standings_view, public.standings_volei_view, public.standings_seed_view,
  public.match_scores, public.match_detail_view, public.v_queue_slots, public.v_queue_slots_v2, public.v_queue_slots_v3
from anon, authenticated;

-- 9) Visitante anônimo só lê
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

commit;

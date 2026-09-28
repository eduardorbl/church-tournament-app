-- =====================================================================
-- Placar atômico (usado pelo painel admin a partir desta versão do app)
-- Rode ANTES de publicar o frontend novo, senão os botões de placar falham.
-- =====================================================================
begin;

-- +1 / -1 / zerar um campo de placar, calculado no banco (não a partir da tela).
create or replace function public.admin_score_delta(
  p_id uuid,
  p_field text,
  p_delta integer default 0,
  p_reset boolean default false
)
returns table (id uuid, home_score integer, away_score integer, meta jsonb)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_field not in ('home_score','away_score','home_points_set','away_points_set','home_sets','away_sets') then
    raise exception 'campo inválido: %', p_field;
  end if;

  if p_field in ('home_score','away_score') then
    update public.matches m set
      home_score = case when p_field = 'home_score'
                        then case when p_reset then 0 else greatest(0, m.home_score + coalesce(p_delta,0)) end
                        else m.home_score end,
      away_score = case when p_field = 'away_score'
                        then case when p_reset then 0 else greatest(0, m.away_score + coalesce(p_delta,0)) end
                        else m.away_score end,
      updated_at = now()
    where m.id = p_id;
  else
    update public.matches m set
      meta = jsonb_set(
               coalesce(m.meta, '{}'::jsonb),
               array[p_field],
               to_jsonb(case when p_reset then 0
                             else greatest(0, coalesce((m.meta->>p_field)::int, 0) + coalesce(p_delta,0)) end)
             ),
      updated_at = now()
    where m.id = p_id;
  end if;

  if not found then
    raise exception 'partida não encontrada ou sem permissão';
  end if;

  return query select m.id, m.home_score, m.away_score, m.meta from public.matches m where m.id = p_id;
end $$;

-- Vôlei: fecha o set em andamento lendo os pontos direto do banco.
-- p_record_set = true  -> registra o set (meta.sets, home_sets/away_sets) e soma os pontos ao placar
-- p_record_set = false -> só soma os pontos do set em andamento ao placar e zera (ao encerrar a partida)
create or replace function public.admin_volei_close_set(p_id uuid, p_record_set boolean default true)
returns table (id uuid, home_score integer, away_score integer, meta jsonb)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_meta jsonb;
  v_hs int;
  v_as int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select coalesce(m.meta, '{}'::jsonb) into v_meta
    from public.matches m where m.id = p_id
    for update;
  if not found then
    raise exception 'partida não encontrada ou sem permissão';
  end if;

  v_hs := greatest(0, coalesce((v_meta->>'home_points_set')::int, 0));
  v_as := greatest(0, coalesce((v_meta->>'away_points_set')::int, 0));

  if p_record_set then
    v_meta := v_meta
      || jsonb_build_object(
           'sets', coalesce(v_meta->'sets', '[]'::jsonb)
                   || jsonb_build_array(jsonb_build_object('h', v_hs, 'a', v_as, 'at', now())),
           'home_sets', coalesce((v_meta->>'home_sets')::int, 0) + case when v_hs > v_as then 1 else 0 end,
           'away_sets', coalesce((v_meta->>'away_sets')::int, 0) + case when v_as > v_hs then 1 else 0 end
         );
  end if;

  v_meta := v_meta || jsonb_build_object('home_points_set', 0, 'away_points_set', 0);

  update public.matches m set
    meta       = v_meta,
    home_score = m.home_score + v_hs,
    away_score = m.away_score + v_as,
    updated_at = now()
  where m.id = p_id;

  return query select m.id, m.home_score, m.away_score, m.meta from public.matches m where m.id = p_id;
end $$;

revoke execute on function public.admin_score_delta(uuid, text, integer, boolean) from public, anon;
revoke execute on function public.admin_volei_close_set(uuid, boolean)            from public, anon;
grant  execute on function public.admin_score_delta(uuid, text, integer, boolean) to authenticated;
grant  execute on function public.admin_volei_close_set(uuid, boolean)            to authenticated;

commit;

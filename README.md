# Copa Influence (church-tournament-app)

Placar ao vivo, classificação e chaveamento de um campeonato de igreja com três modalidades: Futsal, Vôlei e FIFA. O público acompanha pelo celular e os admins conduzem as partidas pelo painel `/admin`.

**Stack:** Vite 7, React 18, React Router 6, Tailwind 3 e Supabase (Postgres, Auth, Realtime e Storage). O deploy é na Vercel.

## Rodar localmente

Requer Node 20.19 ou mais recente.

```bash
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm ci
npm run dev            # http://localhost:3000
```

O `.env` fica fora do git. Na Vercel, as mesmas duas variáveis ficam em *Project → Settings → Environment Variables*.

## Banco de dados (Supabase)

A lógica do torneio fica no banco: funções RPC, triggers e views. As migrations desta pasta são aplicadas **em ordem**, pelo SQL Editor do Supabase.

| Arquivo | O que faz | Quando |
|---|---|---|
| `supabase/migrations/20260928_01_seguranca.sql` | Fecha as funções perigosas para o anônimo, corrige `is_admin()`, `profiles` e views graváveis | Já |
| `supabase/migrations/20260928_02_placar_atomico.sql` | Cria `admin_score_delta` e `admin_volei_close_set`, usadas pelo painel para marcar pontos | **Antes** de publicar esta versão do front |

> O schema completo (tabelas, as ~120 funções e os triggers) ainda **não** está versionado aqui. Para gerar esse snapshot, rode `supabase db dump --schema public > supabase/schema.sql` com a Supabase CLI e a senha do banco.

## Segurança

- A chave `anon` é pública por design. Quem protege os dados são o RLS e as permissões das funções, nunca a interface.
- Só é admin quem tem o `user_id` na tabela `public.admins`, conferido por `public.is_admin()`.
- O `vercel.json` define os headers de segurança. A CSP libera apenas o domínio do projeto Supabase: se o projeto mudar, atualize o `vercel.json`.

## Estrutura

- `src/pages`: páginas públicas (Home, Futsal, Volei, FIFA, MatchPage, TeamPage)
- `src/pages/admin`: painel admin, carregado sob demanda
- `src/hooks/useLiveRefetch.js`: sincronização com o Realtime (reconexão, aba em segundo plano, respostas fora de ordem)
- `src/lib`: helpers (`must` para checar erro do supabase-js, `safeRedirect`)

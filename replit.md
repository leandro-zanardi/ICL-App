# Aplicativo do Combustível Legal

Protótipo demo (Fase 1) para o Instituto Combustível Legal: app de confiança que mostra postos verificados na ANP com o "Selo Combustível Legal" na região-piloto SP capital + corredor Anhanguera/Bandeirantes até Campinas. 100% em pt-BR, sem emojis. Não é comparador de preços.

## Run & Operate

- Workflows: `artifacts/api-server: API Server` (Express, porta via `PORT`) e `artifacts/combustivel-legal: web` (Vite)
- `pnpm run typecheck` — typecheck completo; `pnpm -w run typecheck:libs` — rebuilda dist das libs (necessário após mudar schema/spec)
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks React Query + Zod do OpenAPI
- `pnpm --filter @workspace/db run push-force` — aplica schema no Postgres sem prompt TTY
- Env: `DATABASE_URL` (Postgres), `SESSION_SECRET` (hash de sessão em analytics)
- Seed automático no boot da API (`seedIfEmpty`): ~73 postos determinísticos (seed mulberry32 fixo), 5 flagships com selo nos pontos de teleporte da demo. `POST /api/demo/reset` re-seeda tudo.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 · DB: PostgreSQL + Drizzle ORM (pgSchemas `app` e `analytics`)
- Frontend: React + Vite + Tailwind v4, react-leaflet@5 (divIcon SVG), qrcode.react, @fontsource (Archivo/Inter)
- Validação: Zod (`zod/v4`) · Codegen: Orval · SSE nativo (EventSource)

## Where things live

- `lib/api-spec/openapi.yaml` — contrato da API (fonte da verdade); hooks gerados em `lib/api-client-react`
- `lib/db/src/schema/index.ts` — schema Drizzle (postos, classificacoes, usuarios, carteiras, transacoes_pontos, checkins, recompensas, resgates, denuncias, rotas_cache + analytics.eventos sem PII)
- `artifacts/api-server/src/lib/` — seed, score, osrm (com fallback), geocode (Nominatim + gazetteer), sse, auth, anp-csv
- `artifacts/api-server/src/routes/` — um arquivo por recurso; `index.ts` monta tudo com `sessionMiddleware` primeiro
- `artifacts/combustivel-legal/src/` — telas: `/` mapa, `/rota`, `/beneficios`, `/denunciar`, `/apresentacao` (split-screen B2B), `/admin/importar`
- Logo ICL: `attached_assets/0_logo_ICL_book-300x123_1787594171904.png`

## Architecture decisions

- Score de verificação: ANP ativa (40) + zero autuações 24m (25) + qualidade (25) + bandeira (10); tier `selo` exige os 4 critérios; não-selo é neutro ("sem verificação ativa"), nunca vermelho/negativo
- Auth leve de demo: OTP simulado (código `1234`), token = uuid do usuário em localStorage `cl_token`; sessão anônima `cl_session`; custom-fetch anexa ambos
- Rotas: OSRM público com timeout 4,5s → cache em DB → fallback estático SP→Campinas; corredor = desvio ≤3km, máx 24 postos
- Painel B2B usa associada fictícia "Distribuidora Horizonte" (bandeira `Horizonte`); eventos analytics são agregados/anônimos (geohash5, session_hash)
- Reflexo em tempo real: SSE `/api/apresentacao/stream` (fora do OpenAPI), meta <2s

## Product

- Mapa com filtro "Só verificados", raio 5/10/25km, busca de endereço, ficha do posto com critérios do selo
- Rota com postos verificados no caminho (SP→Campinas na demo)
- Benefícios: check-in em posto selo (+50 pts, cooldown 6h), bônus boas-vindas 120 pts, resgate com QR code
- Denúncia anônima com protocolo `ICL-ano-seq`
- `/apresentacao`: split-screen desktop com celular simulado + painel da associada ao vivo
- `/admin/importar`: importação de CSV da ANP (upsert por CNPJ)
- Barra de demo (tecla D): teleporte Av. Paulista / Anhanguera km 40 / Campinas Centro

## User preferences

- Todo o produto e a comunicação em pt-BR; sem emojis na UI
- Gradiente chama (#FFC20E→#F58220→#E63329) SÓ no selo e CTA primário; navy #0E2A47; Archivo + Inter
- Mobile-first 390px com moldura de celular em telas largas (exceto `/apresentacao` e `/admin/importar`)

## Gotchas

- O boot da API NUNCA deve bloquear o `listen` esperando o banco: na primeira publicação, o banco de produção só é criado depois que o healthcheck passa. O seed roda em segundo plano com novas tentativas (`aplicarSeedComRetentativas` em `artifacts/api-server/src/index.ts`); manter esse padrão
- Healthcheck de produção é `GET /api/healthz` (configurado no artifact.toml da API) e não pode depender do banco

- Após editar `openapi.yaml` ou o schema do DB: rodar codegen e/ou `typecheck:libs` para atualizar os dist das libs, senão o typecheck do api-server acusa exports inexistentes
- O codegen do Orval emite `from 'zod'` mas o projeto usa `zod/v4` — o script `codegen` já corrige via sed; não remover
- `drizzle.config.ts` precisa de `schemaFilter: ["public", "app", "analytics"]` — sem isso o push diz "No changes detected" e não cria as tabelas
- Usar `push-force` (não `push`) em ambiente não interativo

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

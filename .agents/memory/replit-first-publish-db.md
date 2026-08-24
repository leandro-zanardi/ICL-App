---
name: Primeira publicação e banco de produção no Replit
description: O banco de produção só existe após a primeira publicação bem-sucedida; boot que bloqueia no banco cria impasse circular
---

Regra: em deployments Replit (autoscale), o servidor deve chamar `listen` imediatamente e fazer qualquer trabalho de banco (seed, aquecimento) em segundo plano com novas tentativas. A rota de healthcheck não pode tocar o banco.

**Why:** o banco de produção é provisionado/sincronizado pelo fluxo de Publish somente quando a publicação completa. Se o boot faz `await` de uma query antes do `listen`, na primeira publicação a conexão pende (pool `pg` sem timeout por padrão), a porta nunca abre, o probe falha em ~60s e a publicação aborta — logo o banco nunca é criado (impasse circular). Sintoma típico: build OK, promote falha com "required port was never opened" e zero linhas de log da aplicação; `executeSql({environment:"production"})` retorna PRODUCTION_DATABASE_ERROR e explainSchemaDiff diz "does not have a production database".

**How to apply:** listen primeiro; seed/warm-up em loop de retry não-fatal; `connectionTimeoutMillis` no Pool para transformar travamento em erro visível. Schema de produção vem SÓ do fluxo de Publish (diff dev→prod) — nunca rodar DDL no boot nem scripts de migração contra produção.

Lições adicionais da mesma investigação:

- Deploy bem-sucedido ≠ banco de produção criado. Um "republicar/redeploy" direto pode pular a etapa de banco; no Helium o banco de prod é criado "durante o fluxo de publicação" completo. Sintoma de deployment usando o banco de DEV: `getaddrinfo EAI_AGAIN helium` nos logs de produção (o host `helium` só resolve dentro do workspace). Verificação: `explainSchemaDiff()` acusa "does not have a production database" e `executeSql({environment:"production"})` retorna PRODUCTION_DATABASE_ERROR.
- Seed no boot em autoscale precisa de `pg_advisory_xact_lock` (check-then-insert é corrida real com N instâncias subindo juntas; duplicaria os dados).
- Script de pós-merge: usar a variante force do drizzle push (stdin fechado, push interativo trava) e timeout generoso (default 20s é pouco para install+push; medido ~4-25s).

---
name: Drizzle push com pgSchema não-public
description: drizzle-kit push só gerencia o schema public por padrão; tabelas em pgSchema custom são ignoradas em silêncio
---

Regra: ao usar `pgSchema("nome")` no schema Drizzle, o `drizzle.config.ts` precisa listar todos os schemas em `schemaFilter` (ex.: `schemaFilter: ["public", "app", "analytics"]`).

**Why:** sem o filtro, `drizzle-kit push` reporta "No changes detected" e termina com sucesso sem criar nada — o erro só aparece em runtime como `relation "app.tabela" does not exist`, o que despista para o lado errado (parece problema de conexão/seed, não de config).

**How to apply:** sempre que adicionar um novo `pgSchema` ao projeto, atualizar o `schemaFilter` na config do drizzle-kit antes do push. Se um push disser "No changes detected" logo após criar tabelas novas, suspeitar disso primeiro.

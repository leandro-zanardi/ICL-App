---
name: Booleanos de query do OpenAPI
description: Precaução para parâmetros booleanos de URL nos validadores Zod gerados.
---

Não use `z.coerce.boolean()` diretamente para interpretar parâmetros booleanos vindos da query string. Normalize explicitamente `"true"` e `"false"` para booleanos — e rejeite outros valores — antes de validar o contrato gerado.

**Why:** A coerção padrão segue a regra JavaScript de `Boolean(valor)`; como qualquer string não vazia é verdadeira, `"false"` acaba ativando filtros que deveriam estar desligados.

**How to apply:** Em rotas que recebem booleanos por URL, converta os valores de texto na borda HTTP antes de chamar o schema Zod gerado. Inclua a combinação `false` em testes de filtro.
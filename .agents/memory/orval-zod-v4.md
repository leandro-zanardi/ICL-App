---
name: Orval + zod/v4
description: Codegen do Orval emite imports de zod v3; projetos em zod/v4 precisam de pós-processamento
---

Regra: quando o projeto usa `zod/v4` (subpath do pacote zod 3.25+), o código gerado pelo Orval importa `from 'zod'` e produz tipos incompatíveis com os schemas v4 do resto do projeto.

**Why:** o Orval não tem opção nativa para o subpath `zod/v4`; misturar tipos v3 e v4 causa erros de inferência (ex.: `safeParse` retornando `{}`) e falhas de typecheck difíceis de rastrear.

**How to apply:** no script `codegen` do pacote da spec, após rodar o Orval, reescrever os imports no arquivo gerado (ex.: `sed -i "s|from 'zod'|from 'zod/v4'|g"`). Ao depurar inferência quebrada de schemas gerados, checar primeiro se os imports apontam para a versão certa. Para helpers genéricos de validação, tipar como `<S extends ZodType>(schema: S) => output<S>` em vez de `ZodType<T>` — a inferência via parâmetro de classe falha no v4.

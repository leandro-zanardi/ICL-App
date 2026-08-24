---
name: Seleção municipal no APEX da ANP
description: Limites observados ao automatizar o mapa oficial ANP Com Vc – Postos.
---

A seleção municipal do APEX não pode ser tratada como simples alteração do `<select>` nativo: o mapa só recebe o município quando o estado de sessão da aplicação oficial é efetivamente persistido pelo fluxo visual.

**Why:** definir o valor do campo cliente pelo rótulo tornou os botões visíveis, mas a navegação seguinte ainda chegou ao mapa com município vazio e, por consequência, sem pinos. Após algumas sessões de diagnóstico, a origem também passou a apresentar verificação anti-bot.

**How to apply:** ao retomar a ingestão, aguarde a recuperação da origem, reproduza uma única seleção municipal pelo fluxo visível completo e valide o parâmetro/retorno do mapa antes de processar lotes. Não deduza URLs, valores internos ou coordenadas; mantenha falhas e snapshots no log da execução.
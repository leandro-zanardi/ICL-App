---
name: Dados oficiais em produção
description: Regra para impedir que a base publicada exiba postos demonstrativos no lugar de dados oficiais.
---

Produção deve iniciar sem postos quando ainda não houver uma importação oficial disponível; nunca deve criar ou restaurar postos demonstrativos automaticamente.

**Why:** O mapa do ICL precisa manter a rastreabilidade ao cadastro oficial da ANP e não pode apresentar cadastros, coordenadas ou classificações inventadas como se fossem dados reais.

**How to apply:** Ao alterar rotinas de inicialização, seed, reset ou importação, mantenha dados demonstrativos restritos ao desenvolvimento e preencha produção somente por arquivos ou sincronizações oficiais auditáveis.
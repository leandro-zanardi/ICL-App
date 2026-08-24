---
name: Pausa operacional da ANP
description: Política para impedir consumo automático da fonte ANP enquanto ela aplica verificação anti-bot.
---

A sincronização automática da ANP deve permanecer desativada por padrão. A coleta só deve ser retomada por uma ação administrativa explícita, após confirmar que a fonte oficial aceita uma sessão novamente.

**Why:** a ANP permitiu a leitura real do mapa de Campinas, mas bloqueou as consultas detalhadas com verificação anti-bot. Repetir ciclos sem supervisão não conclui a carga e gera tráfego desnecessário contra a fonte.

**How to apply:** não habilite o agendamento recorrente como forma de “esperar” a ANP. Para uma nova tentativa, use uma execução manual, limitada e acompanhada; se houver verificação, encerre-a sem retry em lote.
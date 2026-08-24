---
name: Recuperação de rede no mapa PWA
description: Regra de resiliência para carregamento do mapa quando a rede ou a API ficam indisponíveis.
---

Consultas interceptadas pelo service worker devem ter prazo de rede e fallback; a consulta que abastece o mapa deve tentar mesmo offline e evitar novas tentativas automáticas ocultas, para que a pessoa veja um erro claro com ação de recuperação.

**Why:** uma rede indisponível podia manter o mapa em “carregando” por dezenas de segundos (ou indefinidamente), sem expor ao usuário a opção de tentar novamente. O worker também aguardava buscas de rede sem limite.

**How to apply:** ao modificar cache/offline ou o carregamento de postos, preserve um prazo finito no worker e um estado de erro explícito no mapa.
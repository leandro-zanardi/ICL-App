---
name: Playwright no ambiente Replit
description: Dependências de sistema necessárias para executar Chromium em testes E2E neste workspace.
---

O Playwright deve ser acompanhado das bibliotecas de sistema do Chromium no ambiente Nix, incluindo GLib, GBM, XKB common, ALSA e bibliotecas X11.

**Why:** O navegador instalado pelo Playwright não inicia em um ambiente mínimo quando essas bibliotecas não estão declaradas; a falha ocorre antes de qualquer teste ou acesso à aplicação.

**How to apply:** Ao criar ou mover testes Playwright neste workspace, preserve as dependências Nix existentes em `.replit` e instale o browser com `pnpm exec playwright install chromium`.
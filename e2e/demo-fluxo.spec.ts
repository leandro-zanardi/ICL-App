import { expect, test } from '@playwright/test';

test.describe('fluxo completo da demonstração em pt-BR', () => {
  test('mapa, rota, check-in, pontos, QR, denúncia e painel ao vivo', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(60_000);

    const reset = await request.post('/api/demo/reset');
    expect(reset.ok()).toBeTruthy();

    const postosResponse = await request.get(
      '/api/postos?lat=-23.5505&lng=-46.6333&raio_km=25',
    );
    expect(postosResponse.ok()).toBeTruthy();
    const postos = (await postosResponse.json()) as Array<{
      id: string;
      tier: string;
    }>;
    const postoSelo = postos.find((posto) => posto.tier === 'selo');
    expect(postoSelo).toBeDefined();

    // Remove onboarding only for the test; the demo flow itself remains unchanged.
    await page.addInitScript(() => localStorage.setItem('cl_onboarded', 'true'));

    const painel = await context.newPage();
    await painel.goto('/apresentacao');
    await expect(
      painel.getByRole('heading', { name: /Modo Apresentação/i }),
    ).toBeVisible();
    await expect(painel.getByText('Feed de Atividade')).toBeVisible();

    // Mapa → filtro → ficha do posto.
    await page.goto('/');
    await expect(page.getByPlaceholder('Buscar endereço ou posto')).toBeVisible();
    await page.getByRole('button', { name: 'Só verificados' }).click();
    const primeiroPostoVerificado = page.locator('.leaflet-marker-icon').nth(1);
    await expect(primeiroPostoVerificado).toBeVisible();
    await primeiroPostoVerificado.click();
    await expect(page.getByText('Informações rastreáveis ao registro oficial da ANP')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Traçar Rota' })).toBeVisible();

    // A rota abre o destino em uma nova aba, sem perder o fluxo da demo.
    const [rotaExterna] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Traçar Rota' }).click(),
    ]);
    await expect(rotaExterna).toHaveURL(/google\.com\/maps\/dir/);
    await rotaExterna.close();
    await page.locator('[role="dialog"]').last().locator('button').first().click();

    // Rota → destino → postos no caminho.
    await page.getByRole('link', { name: 'Rota' }).click();
    await page.getByPlaceholder('Para onde você vai?').fill('Campinas');
    await expect(page.getByRole('button', { name: /Campinas/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /Campinas/i }).first().click();
    await page.getByRole('button', { name: 'Ver postos no caminho' }).click();
    await expect(page.getByText('Postos no trajeto')).toBeVisible();
    await expect(page.getByText(/verificados/).last()).toBeVisible();

    // Check-in com OTP demo e segunda tentativa bloqueada pelo cooldown 409.
    await page.getByRole('link', { name: 'Mapa' }).click();
    await page.locator('.leaflet-marker-icon').nth(1).click();
    await page.getByRole('button', { name: 'Check-in' }).click();
    await page.locator('input[placeholder="(11) 99999-9999"]').fill(`1199999${Date.now().toString().slice(-4)}`);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText(/use o código 1234/i)).toBeVisible();
    await page.locator('input[placeholder="1234"]').fill('1234');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Check-in Confirmado!')).toBeVisible();
    await expect(painel.getByText(/Check-in confirmado no/i)).toBeVisible({ timeout: 2_000 });

    await page.getByRole('button', { name: 'Ver Detalhes do Posto' }).click();
    await page.getByRole('button', { name: 'Check-in' }).click();
    await expect(page.getByText(/últimas 6 horas/i).first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="dialog"]').last().locator('button').first().click();

    // Pontos → resgate → QR.
    await page.getByRole('link', { name: 'Benefícios' }).click();
    await expect(page.getByText('Seus Pontos')).toBeVisible();
    const resgatar = page
      .locator('button:not([disabled])')
      .filter({ hasText: 'Resgatar' })
      .first();
    await expect(resgatar).toBeVisible();
    await resgatar.click();
    await expect(page.getByText('Apresente este código ou QR Code')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();

    // Denúncia → protocolo → reflexo no painel ao vivo.
    await page.getByRole('link', { name: 'Denunciar' }).click();
    await page.getByPlaceholder('Descreva o que você observou...').fill(
      'Combustível com qualidade diferente da informada na bomba.',
    );
    await page.getByRole('button', { name: 'Enviar Denúncia' }).click();
    await expect(page.getByText('Denúncia Registrada')).toBeVisible();
    await expect(page.getByText(/ICL-\d{4}-\d{6}/)).toBeVisible();
    await expect(painel.getByText(/Denúncia recebida/i)).toBeVisible({ timeout: 2_000 });

    await painel.close();
  });
});
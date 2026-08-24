import { chromium, type Page } from "@playwright/test";
import {
  amostrasPmqc,
  anpRawSnapshots,
  anpSincronizacoes,
  db,
  ensaiosNaoConformes,
  fiscalizacoes,
  irregularidades,
  origemCombustivel,
  postos,
  produtosPosto,
} from "@workspace/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { calcularNotaAnp } from "./score";
import { logger } from "./logger";
import { extrairPinosAnp, type PinAnp } from "./anp-map";

export const MUNICIPIOS_ANP = ["CAMPINAS - SP", "SAO PAULO - SP"] as const;
export type MunicipioAnp = (typeof MUNICIPIOS_ANP)[number];

const HOME_ANP = "https://anpcomvcpostos.anp.gov.br/ordsdw/r/sfi_apex/anpcomvcpostos/home";
const USER_AGENT = "ICL-AppPrototipo/1.0 (+contato)";
const UM_SEGUNDO_MS = 1_000;
const DETALHE_FRESCO_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FALHAS_SEGUIDAS = 5;
const prioridadesCnpj = new Set<string>();
let proximaPaginaEm = 0;
let filaDeRede: Promise<void> = Promise.resolve();
let scheduler: NodeJS.Timeout | undefined;

type Contadores = {
  postosLidos: number;
  postosAtualizados: number;
  paginasColetadas: number;
  divergenciasNota: number;
};

type LinhaTabela = { cabecalhos: string[]; valores: string[] };

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respeitarRitmo(): Promise<void> {
  let liberar!: () => void;
  const vezAnterior = filaDeRede;
  filaDeRede = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await vezAnterior;
  try {
    const espera = Math.max(0, proximaPaginaEm - Date.now());
    if (espera > 0) await aguardar(espera);
    proximaPaginaEm = Date.now() + UM_SEGUNDO_MS;
  } finally {
    liberar();
  }
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function municipioDoRotulo(rotulo: MunicipioAnp): string {
  return rotulo === "CAMPINAS - SP" ? "Campinas" : "São Paulo";
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/\./g, "").replace(",", ".");
  const resultado = Number(texto);
  return Number.isFinite(resultado) ? resultado : null;
}

function jsonSeguro(conteudo: string): unknown {
  try {
    return JSON.parse(conteudo);
  } catch {
    return { conteudo };
  }
}

async function registrarSnapshot(
  postoId: string | null,
  pagina: string,
  url: string,
  conteudo: unknown,
): Promise<void> {
  await db.insert(anpRawSnapshots).values({
    postoId,
    pagina,
    urlSemSessao: url.split("?")[0],
    conteudo,
  });
}

function erroLegivel(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

async function atualizarExecucao(
  id: string,
  dados: Partial<{
    status: "queued" | "running" | "completed" | "failed" | "partial";
    postosLidos: number;
    postosAtualizados: number;
    paginasColetadas: number;
    divergenciasNota: number;
    erros: string[];
    iniciadoEm: Date;
    concluidoEm: Date;
  }>,
): Promise<void> {
  await db
    .update(anpSincronizacoes)
    .set({ ...dados, atualizadoEm: new Date() })
    .where(eq(anpSincronizacoes.id, id));
}

async function upsertPin(pino: PinAnp, municipio: string): Promise<{ id: string; novo: boolean }> {
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: postos.id, nomeFantasia: postos.nomeFantasia })
      .from(postos)
      .where(sql`regexp_replace(${postos.cnpj}, '\\D', '', 'g') = ${pino.cnpj}`)
      .limit(1);

    if (!pino.razaoSocial || !pino.bandeira || !pino.endereco) {
      throw new Error(`${pino.cnpj}: o mapa ANP não forneceu todos os campos cadastrais obrigatórios.`);
    }
    // A ficha pública do app ANP expõe razão social, mas não necessariamente
    // nome fantasia. A razão social é oficial e vira apenas o nome de
    // exibição enquanto a fonte não fornecer uma fantasia distinta.
    const nomeExibicao = pino.nomeFantasia ?? existente?.nomeFantasia ?? pino.razaoSocial;
    const dados = {
      cnpj: pino.cnpj,
      razaoSocial: pino.razaoSocial,
      nomeFantasia: nomeExibicao,
      bandeira: pino.bandeira,
      endereco: pino.endereco,
      municipio,
      uf: "SP",
      lat: pino.lat,
      lng: pino.lng,
      notaAnpColetada: pino.notaAnp == null ? null : Math.round(pino.notaAnp),
      atualizadoEm: new Date(),
    };

    if (existente) {
      await tx.update(postos).set(dados).where(eq(postos.id, existente.id));
      return { id: existente.id, novo: false };
    }

    const [criado] = await tx
      .insert(postos)
      .values({
        ...dados,
        statusRecebimento: "PINO ANP",
        situacaoAnp: "NÃO INFORMADA PELA ANP",
        sincronizadoEm: new Date(),
      })
      .returning({ id: postos.id });
    return { id: criado.id, novo: true };
  });
}

async function coletarPinosDoMunicipio(page: Page, municipio: MunicipioAnp): Promise<{
  pinos: PinAnp[];
  paginas: number;
}> {
  const payloads: Array<{ url: string; conteudo: unknown }> = [];
  const aoResponder = async (response: Awaited<ReturnType<Page["waitForResponse"]>>): Promise<void> => {
    const url = response.url();
    if (!/wwv_flow\.ajax|postos-mapa|mapa/i.test(url)) return;
    try {
      const corpo = await response.text();
      const conteudo = jsonSeguro(corpo);
      if (extrairPinosAnp(conteudo).length > 0) payloads.push({ url, conteudo });
    } catch {
      // Uma resposta binária ou bloqueada não impede a página de continuar.
    }
  };

  page.on("response", aoResponder);
  try {
    await respeitarRitmo();
    await page.goto(HOME_ANP, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (/security verification|just a moment/i.test(await page.title())) {
      throw new Error("A ANP solicitou verificação de segurança; a sincronização será tentada novamente no próximo ciclo.");
    }

    await page.getByText("Visualizar Postos da Cidade", { exact: true }).click({ timeout: 20_000 });
    await page.locator("#P1_CIDADE").waitFor({ state: "attached", timeout: 20_000 });
    // O APEX mantém estado próprio para o campo visual. O valor interno é
    // obtido dinamicamente a partir do rótulo oficial, sem ser codificado.
    // A mudança aciona uma ação AJAX que preenche município e UF no servidor;
    // o submit para o mapa só pode acontecer depois dessa resposta.
    const respostaDaCidade = page.waitForResponse(
      (response) =>
        response.url().includes("wwv_flow.ajax") &&
        (response.request().postData() ?? "").includes("P1_CIDADE"),
      { timeout: 20_000 },
    );
    await page.locator("#P1_CIDADE").evaluate((elemento, rotulo) => {
      const select = elemento as any;
      const opcao = Array.from(select.options as any[]).find((item: any) => item.text.trim() === rotulo);
      if (!opcao) throw new Error(`Município ANP não localizado: ${rotulo}`);
      const apex = (globalThis as any).apex;
      if (!apex?.item) throw new Error("Componente APEX não disponível para seleção do município.");
      apex.item(select.id).setValue(opcao.value, opcao.text, false);
    }, municipio);
    const respostaCidade = await respostaDaCidade;
    if (!respostaCidade.ok()) {
      throw new Error(`A ANP não confirmou o município ${municipio} antes da abertura do mapa.`);
    }
    let municipioConfirmado = false;
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const [municipioSelecionado, ufSelecionada] = await Promise.all([
        page.locator("#P1_MUNICIPIO").inputValue(),
        page.locator("#P1_UF").inputValue(),
      ]);
      if (municipioSelecionado && ufSelecionada) {
        municipioConfirmado = true;
        break;
      }
      await aguardar(500);
    }
    if (!municipioConfirmado) {
      throw new Error(`A ANP não preencheu município e UF para ${municipio}.`);
    }
    await page.getByRole("button", { name: "Mostrar no Mapa os Postos da cidade" }).waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("button", { name: "Mostrar no Mapa os Postos da cidade" }).click();
    await page.waitForURL(/postos-mapa/, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);

    for (const payload of payloads) {
      await registrarSnapshot(null, "postos-mapa", payload.url, payload.conteudo);
    }
    const pinos = payloads.flatMap((payload) => extrairPinosAnp(payload.conteudo));
    const unicos = new Map(pinos.map((pino) => [pino.cnpj, pino]));
    if (unicos.size === 0) {
      throw new Error(`A resposta do mapa de ${municipio} não trouxe pinos reconhecíveis.`);
    }
    return { pinos: [...unicos.values()], paginas: payloads.length };
  } finally {
    page.off("response", aoResponder);
  }
}

async function extrairTabelas(page: Page): Promise<LinhaTabela[]> {
  return page.locator("table").evaluateAll((tabelas) =>
    tabelas.flatMap((tabela) => {
      const elementoTabela = tabela as any;
      const cabecalhos = Array.from(elementoTabela.querySelectorAll("thead th") as any[]).map((celula: any) =>
        (celula.textContent ?? "").trim(),
      );
      return Array.from(elementoTabela.querySelectorAll("tbody tr") as any[]).map((linha: any) => ({
        cabecalhos,
        valores: Array.from(linha.querySelectorAll("td") as any[]).map((celula: any) => (celula.textContent ?? "").trim()),
      }));
    }),
  );
}

function campo(linha: LinhaTabela, termos: string[]): string | undefined {
  const indice = linha.cabecalhos.findIndex((cabecalho) =>
    termos.some((termo) => normalizar(cabecalho).includes(normalizar(termo))),
  );
  return indice >= 0 ? linha.valores[indice] : undefined;
}

function dataAnp(valor: string | undefined): string | null {
  if (!valor) return null;
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const br = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function valorAposRotulo(textoCompleto: string, rotulo: string): string | undefined {
  const linhas = textoCompleto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  const indice = linhas.findIndex((linha) => normalizar(linha) === normalizar(rotulo));
  return indice >= 0 ? linhas[indice + 1] : undefined;
}

async function normalizarDetalhe(
  postoId: string,
  pagina: string,
  linhas: LinhaTabela[],
): Promise<void> {
  if (pagina === "fiscalizacoes") {
    const itens = linhas
      .map((linha) => ({
        numeroDf: campo(linha, ["número df", "numero df"]),
        dataFiscalizacao: dataAnp(campo(linha, ["data da fiscalização", "data fiscalizacao"])),
        tipoConvenio: campo(linha, ["convênio", "convenio"]),
        fiscalizacaoDeCampo: campo(linha, ["campo"]),
      }))
      .filter((item) => item.dataFiscalizacao);
    if (itens.length > 0) {
      await db.transaction(async (tx) => {
        await tx.delete(fiscalizacoes).where(eq(fiscalizacoes.postoId, postoId));
        await tx.insert(fiscalizacoes).values(itens.map((item) => ({ ...item, postoId, dataFiscalizacao: item.dataFiscalizacao! })));
      });
    }
  }

  if (pagina === "amostras") {
    const itens = linhas
      .map((linha) => {
        const conforme = normalizar(campo(linha, ["conforme"]) ?? "");
        return {
          dataColeta: dataAnp(campo(linha, ["data da coleta", "data coleta"])),
          produto: campo(linha, ["produto"]) ?? "Não informado",
          conforme: conforme.includes("sim") || conforme.includes("conforme"),
        };
      })
      .filter((item) => item.dataColeta);
    if (itens.length > 0) {
      await db.transaction(async (tx) => {
        await tx.delete(amostrasPmqc).where(eq(amostrasPmqc.postoId, postoId));
        await tx.insert(amostrasPmqc).values(itens.map((item) => ({ ...item, postoId, dataColeta: item.dataColeta! })));
      });
    }
  }

  if (pagina === "origem-combustivel") {
    const itens = linhas
      .map((linha) => ({
        distribuidoraPosto: campo(linha, ["distribuidora do posto", "distribuidora posto"]),
        distribuidoraOrigem: campo(linha, ["distribuidora de origem", "origem"]) ?? "",
        volumePct: numero(campo(linha, ["%", "percentual", "volume"])) ?? -1,
      }))
      .filter((item) => item.distribuidoraOrigem && item.volumePct >= 0);
    if (itens.length > 0) {
      await db.transaction(async (tx) => {
        await tx.delete(origemCombustivel).where(eq(origemCombustivel.postoId, postoId));
        await tx.insert(origemCombustivel).values(itens.map((item) => ({ ...item, postoId })));
      });
    }
  }

  // As tabelas com o mesmo formato também são registradas para a ficha futura.
  if (pagina === "posto-detalhe") {
    const itens = linhas
      .map((linha) => ({
        produto: campo(linha, ["produto"]) ?? "",
        bicosAbastecimento: numero(campo(linha, ["bicos"])) ?? null,
        volumeTancagemM3: numero(campo(linha, ["tancagem", "volume"])) ?? null,
      }))
      .filter((item) => item.produto);
    if (itens.length > 0) {
      await db.transaction(async (tx) => {
        await tx.delete(produtosPosto).where(eq(produtosPosto.postoId, postoId));
        await tx.insert(produtosPosto).values(itens.map((item) => ({ ...item, postoId })));
      });
    }
  }
}

async function abrirPaginaPorRotulo(page: Page, rotulo: RegExp): Promise<boolean> {
  const link = page.getByRole("link", { name: rotulo }).first();
  if (await link.count()) {
    await respeitarRitmo();
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    return true;
  }
  const botao = page.getByRole("button", { name: rotulo }).first();
  if (await botao.count()) {
    await respeitarRitmo();
    await botao.click();
    await page.waitForLoadState("domcontentloaded");
    return true;
  }
  return false;
}

async function detalharPosto(
  page: Page,
  posto: { id: string; cnpj: string; notaAnpColetada: number | null; situacaoAnp: string },
): Promise<{ paginas: number; notaCalculada: number | null }> {
  // A busca e as navegações são feitas por controles visíveis do APEX. Não são
  // montadas URLs com parâmetros de sessão, CNPJ ou checksums.
  await respeitarRitmo();
  await page.goto(HOME_ANP, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (/security verification|just a moment/i.test(await page.title())) {
    throw new Error("A ANP solicitou verificação de segurança durante o detalhamento.");
  }
  await page.getByText("Buscar pelo CNPJ", { exact: true }).click({ timeout: 20_000 });
    const entrada = page.locator("#P1_CNPJ");
    await entrada.waitFor({ state: "visible", timeout: 20_000 });
  await entrada.fill(posto.cnpj);
    // O APEX exibe o botão de busca em um handler de `keyup`, não apenas com
    // a alteração programática do valor do campo.
    await entrada.press("End");
    const visualizarPosto = page.getByRole("button", { name: "Visualizar Posto" });
    await visualizarPosto.waitFor({ state: "visible", timeout: 20_000 });
    await visualizarPosto.click({ noWaitAfter: true });
    await page.waitForURL(/posto-geral/, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // A busca já abre a página "Dados do Posto". Ela não é um botão de
  // navegação, portanto precisa ser registrada antes de seguir pelos controles
  // visíveis para as demais seções.
  let paginas = 1;
  const textoGeral = await page.locator("body").innerText();
  const tabelasGerais = await extrairTabelas(page);
  const situacaoOficial = valorAposRotulo(textoGeral, "Situação");
  await registrarSnapshot(posto.id, "posto-geral", page.url(), {
    texto: textoGeral.slice(0, 120_000),
    tabelas: tabelasGerais,
  });
  if (situacaoOficial) {
    await db
      .update(postos)
      .set({ situacaoAnp: situacaoOficial, atualizadoEm: new Date() })
      .where(eq(postos.id, posto.id));
  }

  for (const item of [
    { alias: "posto-detalhe", rotulo: /detalhe|cadastro/i },
    { alias: "fiscalizacoes", rotulo: /fiscaliza/i },
    { alias: "amostras", rotulo: /amostra|qualidade/i },
    { alias: "origem-combustivel", rotulo: /origem/i },
  ]) {
    if (!(await abrirPaginaPorRotulo(page, item.rotulo))) continue;
    await respeitarRitmo();
    const tabelas = await extrairTabelas(page);
    await registrarSnapshot(posto.id, item.alias, page.url(), {
      texto: (await page.locator("body").innerText()).slice(0, 120_000),
      tabelas,
    });
    await normalizarDetalhe(posto.id, item.alias, tabelas);
    paginas++;
  }

  const [amostras, infracoes] = await Promise.all([
    db.select().from(amostrasPmqc).where(eq(amostrasPmqc.postoId, posto.id)),
    db.select().from(irregularidades).where(eq(irregularidades.postoId, posto.id)),
  ]);
  const nota =
    (situacaoOficial ?? posto.situacaoAnp) === "NÃO INFORMADA PELA ANP"
      ? null
      : calcularNotaAnp({
          situacao: situacaoOficial ?? posto.situacaoAnp,
          amostras: amostras.map((amostra) => ({ dataColeta: amostra.dataColeta, conforme: amostra.conforme })),
          irregularidades: infracoes.map((infracao) => ({
            dataFiscalizacao: infracao.dataFiscalizacao,
            classificacao: infracao.classificacao,
          })),
        }).nota;
  await db
    .update(postos)
    .set({
      notaAnpCalculada: nota,
      statusRecebimento: "DETALHADO",
      sincronizadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .where(eq(postos.id, posto.id));
  return { paginas, notaCalculada: nota };
}

export function priorizarDetalhamentoAnp(cnpj: string): void {
  prioridadesCnpj.add(cnpj.replace(/\D/g, ""));
}

async function executarSincronizacao(id: string, municipios: MunicipioAnp[]): Promise<void> {
  const contadores: Contadores = { postosLidos: 0, postosAtualizados: 0, paginasColetadas: 0, divergenciasNota: 0 };
  const erros: string[] = [];
  let falhasSeguidas = 0;
  await atualizarExecucao(id, { status: "running", iniciadoEm: new Date() });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: USER_AGENT });
    const pinosPorMunicipio = new Map<MunicipioAnp, PinAnp[]>();

    // Primeiro captura todos os pinos, mantendo São Paulo responsivo enquanto
    // Campinas recebe o detalhamento completo.
    for (const municipio of municipios) {
      try {
        let mapa: Awaited<ReturnType<typeof coletarPinosDoMunicipio>> | undefined;
        for (let tentativa = 1; tentativa <= MAX_FALHAS_SEGUIDAS; tentativa++) {
          try {
            mapa = await coletarPinosDoMunicipio(page, municipio);
            break;
          } catch (erro) {
            falhasSeguidas++;
            const mensagem = erroLegivel(erro);
            erros.push(`${municipio} (tentativa ${tentativa}): ${mensagem}`);
            if (/verificação de segurança|just a moment/i.test(mensagem)) throw erro;
            if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) throw new Error("Circuit breaker aberto após 5 falhas consecutivas.");
            await aguardar(2 ** tentativa * UM_SEGUNDO_MS);
          }
        }
        if (!mapa) throw new Error(`${municipio}: não foi possível recuperar o mapa após novas tentativas.`);
        pinosPorMunicipio.set(municipio, mapa.pinos);
        contadores.paginasColetadas += mapa.paginas;
        contadores.postosLidos += mapa.pinos.length;
        for (const pino of mapa.pinos) {
          await upsertPin(pino, municipioDoRotulo(municipio));
          contadores.postosAtualizados++;
        }
        falhasSeguidas = 0;
        await atualizarExecucao(id, { ...contadores, erros });
      } catch (erro) {
        erros.push(`${municipio}: ${erroLegivel(erro)}`);
        await atualizarExecucao(id, { ...contadores, erros });
        if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) throw erro;
      }
    }

    const detalhes = [...pinosPorMunicipio.entries()]
      .flatMap(([municipio, pinos]) => pinos.map((pino) => ({ municipio, pino })))
      .sort((a, b) => {
        const prioridade = Number(prioridadesCnpj.has(b.pino.cnpj)) - Number(prioridadesCnpj.has(a.pino.cnpj));
        if (prioridade !== 0) return prioridade;
        return Number(a.municipio !== "CAMPINAS - SP") - Number(b.municipio !== "CAMPINAS - SP");
      });

    for (const { pino } of detalhes) {
      const [posto] = await db.select().from(postos).where(eq(postos.cnpj, pino.cnpj)).limit(1);
      if (
        !posto ||
        (posto.statusRecebimento === "DETALHADO" &&
          posto.sincronizadoEm &&
          Date.now() - posto.sincronizadoEm.getTime() < DETALHE_FRESCO_MS)
      ) {
        continue;
      }
      try {
        const detalhe = await detalharPosto(page, posto);
        contadores.paginasColetadas += detalhe.paginas;
        if (
          posto.notaAnpColetada != null &&
          detalhe.notaCalculada != null &&
          posto.notaAnpColetada !== detalhe.notaCalculada
        ) {
          contadores.divergenciasNota++;
          erros.push(`${posto.cnpj}: nota ANP ${posto.notaAnpColetada} difere da nota calculada ${detalhe.notaCalculada}.`);
        }
        prioridadesCnpj.delete(posto.cnpj);
        falhasSeguidas = 0;
      } catch (erro) {
        falhasSeguidas++;
        const mensagem = erroLegivel(erro);
        erros.push(`${pino.cnpj}: ${mensagem}`);
        if (/verificação de segurança|just a moment/i.test(mensagem)) throw erro;
        if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) throw new Error("Circuit breaker aberto após 5 falhas consecutivas.");
        await aguardar(2 ** falhasSeguidas * UM_SEGUNDO_MS);
      }
      await atualizarExecucao(id, { ...contadores, erros });
    }
  } catch (erro) {
    erros.push(erroLegivel(erro));
  } finally {
    await browser?.close();
    const status = contadores.postosLidos > 0 ? (erros.length ? "partial" : "completed") : "failed";
    await atualizarExecucao(id, { ...contadores, erros, status, concluidoEm: new Date() });
    logger.info({ sincronizacaoId: id, ...contadores, erros: erros.length, status }, "Sincronização ANP finalizada");
  }
}

export async function iniciarSincronizacaoAnp(municipios: MunicipioAnp[]): Promise<typeof anpSincronizacoes.$inferSelect> {
  const execucao = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(727002)`);
    const [ativa] = await tx
      .select()
      .from(anpSincronizacoes)
      .where(inArray(anpSincronizacoes.status, ["queued", "running"]))
      .orderBy(desc(anpSincronizacoes.criadoEm))
      .limit(1);
    if (ativa) return ativa;

    const [criada] = await tx
      .insert(anpSincronizacoes)
      .values({ municipios, status: "queued" })
      .returning();
    return criada;
  });
  if (execucao.status !== "queued") return execucao;
  void executarSincronizacao(execucao.id, municipios);
  return execucao;
}

export async function listarSincronizacoesAnp(): Promise<Array<typeof anpSincronizacoes.$inferSelect>> {
  return db.select().from(anpSincronizacoes).orderBy(desc(anpSincronizacoes.criadoEm)).limit(20);
}

export function agendarSincronizacaoAnp(): void {
  if (scheduler) return;
  scheduler = setInterval(() => {
    iniciarSincronizacaoAnp([...MUNICIPIOS_ANP]).catch((erro: unknown) =>
      logger.error({ err: erro }, "Não foi possível iniciar a sincronização diária da ANP"),
    );
  }, 24 * 60 * 60 * 1_000);
  scheduler.unref();
}
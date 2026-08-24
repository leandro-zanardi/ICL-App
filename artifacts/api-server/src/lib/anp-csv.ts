/**
 * Leitura tolerante do CSV oficial da ANP (anpcomvcpostos.anp.gov.br).
 * Aceita ; ou , como separador, cabeçalhos com acentos/caixa variada e
 * decimais com vírgula.
 */
export interface LinhaAnp {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  bandeira: string;
  endereco: string;
  municipio: string;
  uf: string;
  lat: number | null;
  lng: number | null;
  situacaoAnp: string;
  dataAutorizacao: string | null;
}

export interface ResultadoParse {
  linhasLidas: number;
  linhas: LinhaAnp[];
  erros: string[];
}

function normalizarHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        aspas = !aspas;
      }
    } else if (c === sep && !aspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

function parseNumero(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const valor = raw.trim();
  const normalizado = valor.includes(",")
    ? valor.replace(/\./g, "").replace(",", ".")
    : valor;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function acharColuna(headers: string[], candidatos: string[]): number {
  for (const cand of candidatos) {
    const idx = headers.findIndex((h) => h.includes(cand));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseCsvAnp(csv: string): ResultadoParse {
  const erros: string[] = [];
  const linhasBrutas = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (linhasBrutas.length < 2) {
    return { linhasLidas: 0, linhas: [], erros: ["CSV vazio ou sem linhas de dados."] };
  }

  const cabecalho = linhasBrutas[0];
  const sep = (cabecalho.match(/;/g)?.length ?? 0) >= (cabecalho.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = dividirLinha(cabecalho, sep).map(normalizarHeader);

  const col = {
    cnpj: acharColuna(headers, ["cnpj"]),
    razao: acharColuna(headers, ["razaosocial", "razao"]),
    fantasia: acharColuna(headers, ["nomefantasia", "fantasia"]),
    bandeira: acharColuna(headers, ["bandeira", "distribuidora"]),
    endereco: acharColuna(headers, ["endereco", "logradouro"]),
    complemento: acharColuna(headers, ["complemento"]),
    bairro: acharColuna(headers, ["bairro"]),
    cep: acharColuna(headers, ["cep"]),
    municipio: acharColuna(headers, ["municipio", "cidade"]),
    uf: acharColuna(headers, ["uf", "estado"]),
    lat: acharColuna(headers, ["latitude", "lat"]),
    lng: acharColuna(headers, ["longitude", "long", "lng"]),
    situacao: acharColuna(headers, ["situacao", "status"]),
    // No arquivo oficial atual, DATAPUBLICACAO é a data da publicação da
    // autorização. Os aliases mantêm compatibilidade com extratos antigos.
    dataAut: acharColuna(headers, [
      "datapublicacao",
      "dataautorizacao",
      "datavinculacao",
      "datadespacho",
    ]),
  };

  if (col.cnpj < 0 && col.fantasia < 0) {
    return {
      linhasLidas: linhasBrutas.length - 1,
      linhas: [],
      erros: [
        "Não foi possível reconhecer as colunas do CSV. São esperadas colunas como CNPJ, Razão Social, Nome Fantasia, Bandeira, Endereço, Município e UF.",
      ],
    };
  }

  const pegar = (campos: string[], idx: number): string => (idx >= 0 ? (campos[idx] ?? "") : "");

  const linhas: LinhaAnp[] = [];
  for (let i = 1; i < linhasBrutas.length; i++) {
    const campos = dividirLinha(linhasBrutas[i], sep);
    const cnpj = pegar(campos, col.cnpj).replace(/\D/g, "");
    const nomeFantasia = pegar(campos, col.fantasia) || pegar(campos, col.razao);
    const endereco = [
      pegar(campos, col.endereco),
      pegar(campos, col.complemento),
      pegar(campos, col.bairro),
      pegar(campos, col.cep) ? `CEP ${pegar(campos, col.cep)}` : "",
    ]
      .filter(Boolean)
      .join(" — ");

    if (!/^\d{14}$/.test(cnpj)) {
      if (erros.length < 15) {
        erros.push(`Linha ${i + 1}: CNPJ ausente ou inválido — ignorada.`);
      }
      continue;
    }

    const razaoSocial = pegar(campos, col.razao);
    const bandeira = pegar(campos, col.bandeira);
    const municipio = pegar(campos, col.municipio);
    const uf = pegar(campos, col.uf).toUpperCase().slice(0, 2);
    const situacaoAnp = pegar(campos, col.situacao);
    if (!razaoSocial || !nomeFantasia || !bandeira || !endereco || !municipio || !uf || !situacaoAnp) {
      if (erros.length < 15) {
        erros.push(`Linha ${i + 1}: campos cadastrais oficiais incompletos — ignorada.`);
      }
      continue;
    }

    linhas.push({
      cnpj,
      razaoSocial,
      nomeFantasia,
      bandeira,
      endereco,
      municipio,
      uf,
      lat: parseNumero(pegar(campos, col.lat)),
      lng: parseNumero(pegar(campos, col.lng)),
      situacaoAnp,
      dataAutorizacao: pegar(campos, col.dataAut) || null,
    });
  }

  return { linhasLidas: linhasBrutas.length - 1, linhas, erros };
}

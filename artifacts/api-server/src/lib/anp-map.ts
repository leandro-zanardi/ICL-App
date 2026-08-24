export type PinAnp = {
  cnpj: string;
  lat: number;
  lng: number;
  linkOficial?: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  bandeira?: string;
  endereco?: string;
  notaAnp?: number;
};

function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const resultado = Number(valor.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(resultado) ? resultado : null;
}

function texto(objeto: Record<string, unknown>, chaves: string[]): string | undefined {
  for (const chave of chaves) {
    const valor = objeto[chave] ?? objeto[chave.toUpperCase()] ?? objeto[chave.toLowerCase()];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number") return String(valor);
  }
  return undefined;
}

function valorNumero(objeto: Record<string, unknown>, chaves: string[]): number | null {
  for (const chave of chaves) {
    const valor = objeto[chave] ?? objeto[chave.toUpperCase()] ?? objeto[chave.toLowerCase()];
    const resultado = numero(valor);
    if (resultado != null) return resultado;
  }
  return null;
}

export function extrairPinosAnp(payload: unknown): PinAnp[] {
  const encontrados = new Map<string, PinAnp>();
  const visitar = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      valor.forEach(visitar);
      return;
    }
    if (!valor || typeof valor !== "object") return;

    const objeto = valor as Record<string, unknown>;
    const colunas =
      objeto.columns && typeof objeto.columns === "object"
        ? (objeto.columns as Record<string, unknown>)
        : {};
    const geometria =
      objeto.geometry && typeof objeto.geometry === "object"
        ? (objeto.geometry as Record<string, unknown>)
        : {};
    const coordenadas = Array.isArray(geometria.coordinates) ? geometria.coordinates : [];
    const obterTexto = (chaves: string[]): string | undefined => texto(objeto, chaves) ?? texto(colunas, chaves);
    const obterNumero = (chaves: string[]): number | null =>
      valorNumero(objeto, chaves) ?? valorNumero(colunas, chaves);
    const cnpj = (obterTexto(["cnpj", "p_cnpj", "cnpj_filtro"]) ?? "").replace(/\D/g, "");
    const lat = obterNumero(["lat", "latitude", "latitute"]) ?? numero(coordenadas[1]);
    const lng = obterNumero(["lng", "longitude", "long"]) ?? numero(coordenadas[0]);

    if (cnpj.length === 14 && lat != null && lng != null) {
      const nomeFantasia = obterTexto(["nome_fantasia", "nomefantasia", "fantasia", "nome"]);
      const razaoSocial = obterTexto(["razao_social", "razaosocial"]);
      const bandeira = obterTexto(["bandeira", "distribuidora"]);
      const endereco = obterTexto(["endereco", "logradouro"]);
      const notaAnp = obterNumero(["nota", "nota_anp"]);
      encontrados.set(cnpj, {
        cnpj,
        lat,
        lng,
        ...(texto(objeto, ["link"]) ? { linkOficial: texto(objeto, ["link"]) } : {}),
        ...(nomeFantasia ? { nomeFantasia } : {}),
        ...(razaoSocial ? { razaoSocial } : {}),
        ...(bandeira ? { bandeira } : {}),
        ...(endereco ? { endereco } : {}),
        ...(notaAnp != null ? { notaAnp } : {}),
      });
    }
    Object.values(objeto).forEach(visitar);
  };

  visitar(payload);
  return [...encontrados.values()];
}
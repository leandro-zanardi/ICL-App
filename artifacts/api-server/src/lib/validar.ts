import type { Response } from "express";
import type { output, ZodType } from "zod/v4";

/**
 * Valida a entrada com o schema gerado do OpenAPI.
 * Em caso de erro, responde 400 no formato Erro { erro } e retorna null.
 */
export function validar<S extends ZodType>(
  schema: S,
  dados: unknown,
  res: Response,
): output<S> | null {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const primeiro = resultado.error.issues[0];
    const campo = primeiro?.path?.join(".") ?? "";
    res.status(400).json({
      erro: campo
        ? `Dados inválidos no campo "${campo}".`
        : "Dados inválidos na requisição.",
    });
    return null;
  }
  return resultado.data as output<S>;
}

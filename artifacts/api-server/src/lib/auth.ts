import type { NextFunction, Request, Response } from "express";
import { db, usuarios } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string | null;
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anexa o id de sessão anônima (header x-session-id) a todas as requisições. */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header("x-session-id");
  req.sessionId = raw && raw.length <= 64 ? raw : null;
  next();
}

/**
 * Autenticação leve do protótipo: o token Bearer é o próprio id do usuário
 * criado no fluxo de OTP simulado.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token || !UUID_RE.test(token)) {
    res.status(401).json({ erro: "Entre com seu celular para continuar." });
    return;
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, token)).limit(1);

  if (!usuario) {
    res.status(401).json({ erro: "Sessão expirada. Entre novamente." });
    return;
  }

  req.userId = usuario.id;
  next();
}

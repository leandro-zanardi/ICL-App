import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { db, eventos } from "@workspace/db";

/**
 * Hub de eventos ao vivo do modo apresentação.
 * Cada evento é gravado em analytics.eventos (sem PII) e retransmitido via SSE.
 */
export const hub = new EventEmitter();
hub.setMaxListeners(100);

export interface EventoFeedPayload {
  id: string;
  event_type:
    | "busca"
    | "visualizou_posto"
    | "rota_tracada"
    | "checkin"
    | "resgate"
    | "denuncia"
    | "reset";
  descricao: string;
  municipio: string | null;
  rede_associada: boolean;
  criado_em: string;
}

export interface PublicarEventoInput {
  eventType: EventoFeedPayload["event_type"];
  descricao: string;
  municipio?: string | null;
  redeAssociada?: boolean;
  postoId?: string | null;
  lat?: number;
  lng?: number;
  sessionId?: string | null;
  geohash?: string | null;
}

export function sessionHash(sessionId: string): string {
  const salt = process.env["SESSION_SECRET"] ?? "cl-demo";
  return createHash("sha256").update(`${salt}:${sessionId}`).digest("hex").slice(0, 32);
}

export async function publicarEvento(input: PublicarEventoInput): Promise<EventoFeedPayload> {
  const [row] = await db
    .insert(eventos)
    .values({
      eventType: input.eventType,
      descricao: input.descricao,
      postoId: input.postoId ?? null,
      municipio: input.municipio ?? null,
      redeAssociada: input.redeAssociada ?? false,
      geohash5: input.geohash ?? null,
      sessionHash: input.sessionId ? sessionHash(input.sessionId) : null,
    })
    .returning();

  const payload: EventoFeedPayload = {
    id: row.id,
    event_type: row.eventType as EventoFeedPayload["event_type"],
    descricao: row.descricao,
    municipio: row.municipio,
    rede_associada: row.redeAssociada,
    criado_em: row.criadoEm.toISOString(),
  };

  hub.emit("evento", payload);
  return payload;
}

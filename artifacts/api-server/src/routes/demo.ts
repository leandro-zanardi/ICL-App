import { Router, type IRouter } from "express";
import { GerarEventosDemoBody } from "@workspace/api-zod";
import { db, postos, recompensas } from "@workspace/db";
import { geohash5 } from "../lib/geo";
import { isRedeAssociada } from "../lib/score";
import { seedIfEmpty, resetDemo } from "../lib/seed";
import { publicarEvento, type PublicarEventoInput } from "../lib/sse";
import { validar } from "../lib/validar";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/demo/reset", async (_req, res) => {
  await resetDemo();
  await publicarEvento({
    eventType: "reset",
    descricao: "Demonstração reiniciada com o cenário padrão",
  });
  res.json({ ok: true, mensagem: "Dados da demonstração reiniciados." });
});

const MUNICIPIOS = [
  "São Paulo", "Osasco", "Barueri", "Cajamar", "Jundiaí",
  "Louveira", "Vinhedo", "Valinhos", "Campinas",
];

const DESTINOS = ["Campinas", "Jundiaí", "Vinhedo", "Valinhos", "Louveira"];

router.post("/demo/eventos", async (req, res) => {
  const body = validar(GerarEventosDemoBody, req.body ?? {}, res);
  if (!body) return;

  const quantidade = Math.max(1, Math.min(30, body.quantidade ?? 6));

  let [todosPostos, todasRecompensas] = await Promise.all([
    db.select().from(postos),
    db.select().from(recompensas),
  ]);

  if (todosPostos.length === 0) {
    // Passa pela trava consultiva (pode correr com o seed de boot) e
    // recarrega as listas — as consultas acima vieram do banco vazio.
    await seedIfEmpty();
    [todosPostos, todasRecompensas] = await Promise.all([
      db.select().from(postos),
      db.select().from(recompensas),
    ]);
  }

  const rede = todosPostos.filter((p) => isRedeAssociada(p.bandeira));
  const comSelo = todosPostos.filter((p) => p.tier === "selo");
  const aleatorio = <T>(lista: T[]): T => lista[Math.floor(Math.random() * lista.length)];

  const escolherPosto = () => {
    if (rede.length > 0 && Math.random() < 0.55) return aleatorio(rede);
    return aleatorio(todosPostos);
  };

  const montarEvento = (): PublicarEventoInput => {
    const sorte = Math.random();

    if (sorte < 0.3) {
      const p = escolherPosto();
      return {
        eventType: "visualizou_posto",
        descricao: `Motorista visualizou ${p.nomeFantasia} (${p.municipio})`,
        municipio: p.municipio,
        redeAssociada: isRedeAssociada(p.bandeira),
        postoId: p.id,
        geohash: geohash5(p.lat, p.lng),
      };
    }
    if (sorte < 0.55) {
      const p = comSelo.length > 0 ? aleatorio(comSelo) : escolherPosto();
      return {
        eventType: "checkin",
        descricao: `Check-in confirmado no ${p.nomeFantasia} (${p.municipio})`,
        municipio: p.municipio,
        redeAssociada: isRedeAssociada(p.bandeira),
        postoId: p.id,
        geohash: geohash5(p.lat, p.lng),
      };
    }
    if (sorte < 0.7) {
      const m = aleatorio(MUNICIPIOS);
      return {
        eventType: "busca",
        descricao: `Nova busca por postos verificados em ${m}`,
        municipio: m,
      };
    }
    if (sorte < 0.8) {
      return {
        eventType: "rota_tracada",
        descricao: `Rota traçada de São Paulo para ${aleatorio(DESTINOS)}`,
      };
    }
    if (sorte < 0.92 && todasRecompensas.length > 0) {
      return {
        eventType: "resgate",
        descricao: `Cupom resgatado: ${aleatorio(todasRecompensas).nome}`,
      };
    }
    const m = aleatorio(MUNICIPIOS);
    return {
      eventType: "denuncia",
      descricao: `Denúncia recebida em ${m}`,
      municipio: m,
    };
  };

  // Espaça os eventos (~0,9s) para o painel "pulsar" durante a apresentação.
  for (let i = 0; i < quantidade; i++) {
    const evento = montarEvento();
    setTimeout(() => {
      publicarEvento(evento).catch((err: Error) =>
        logger.warn({ err: err.message }, "Falha ao publicar evento de demonstração"),
      );
    }, i * 900);
  }

  res.json({ gerados: quantidade });
});

export default router;

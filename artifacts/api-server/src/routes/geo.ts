import { Router, type IRouter } from "express";
import { BuscarEnderecoQueryParams } from "@workspace/api-zod";
import { buscarEnderecos } from "../lib/geocode";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

router.get("/geo/buscar", async (req, res) => {
  const query = validar(BuscarEnderecoQueryParams, req.query, res);
  if (!query) return;

  const resultados = await buscarEnderecos(query.q);

  publicarEvento({
    eventType: "busca",
    descricao: `Nova busca no mapa: "${query.q}"`,
    municipio: null,
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.json(resultados);
});

export default router;

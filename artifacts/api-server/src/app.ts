import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Limite ampliado para permitir o upload do CSV da ANP como JSON ({ csv })
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

const apiErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const candidateStatus =
    typeof error?.statusCode === "number"
      ? error.statusCode
      : typeof error?.status === "number"
        ? error.status
        : 500;
  const status = candidateStatus >= 400 && candidateStatus < 600 ? candidateStatus : 500;

  req.log.error({ err: error, status }, "Erro não tratado na API");

  res.status(status).json({
    erro:
      status >= 500
        ? "Nosso sistema está instável, tente em instantes."
        : "Confira os dados informados e tente novamente.",
  });
};

app.use(apiErrorHandler);

export default app;

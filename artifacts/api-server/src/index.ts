import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const SEED_INTERVALO_MS = 15_000;
const SEED_MAX_TENTATIVAS = 40;

/**
 * Aplica o seed em segundo plano, com novas tentativas.
 * O servidor NUNCA bloqueia o listen esperando o banco: na primeira
 * publicação, o banco de produção só é provisionado depois que o
 * healthcheck passa — bloquear aqui criaria um impasse circular.
 */
async function aplicarSeedComRetentativas(): Promise<void> {
  for (let tentativa = 1; tentativa <= SEED_MAX_TENTATIVAS; tentativa++) {
    try {
      await seedIfEmpty();
      logger.info({ tentativa }, "Seed inicial verificado");
      return;
    } catch (err) {
      logger.warn(
        { err, tentativa, proximaEmMs: SEED_INTERVALO_MS },
        "Banco indisponível para o seed; tentando novamente",
      );
      await new Promise((resolve) => setTimeout(resolve, SEED_INTERVALO_MS));
    }
  }
  logger.error(
    "Seed inicial não aplicado após todas as tentativas; o servidor segue no ar sem dados de demonstração",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void aplicarSeedComRetentativas();
});

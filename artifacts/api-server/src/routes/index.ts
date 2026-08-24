import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/auth";
import adminRouter from "./admin";
import apresentacaoRouter from "./apresentacao";
import checkinsRouter from "./checkins";
import contaRouter from "./conta";
import demoRouter from "./demo";
import denunciasRouter from "./denuncias";
import geoRouter from "./geo";
import healthRouter from "./health";
import postosRouter from "./postos";
import recompensasRouter from "./recompensas";
import resgatesRouter from "./resgates";
import rotasRouter from "./rotas";

const router: IRouter = Router();

router.use(sessionMiddleware);
router.use(healthRouter);
router.use(postosRouter);
router.use(rotasRouter);
router.use(geoRouter);
router.use(contaRouter);
router.use(checkinsRouter);
router.use(recompensasRouter);
router.use(resgatesRouter);
router.use(denunciasRouter);
router.use(apresentacaoRouter);
router.use(demoRouter);
router.use(adminRouter);

export default router;

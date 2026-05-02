import { Router } from "express";
import { runRealDiscovery } from "./discoveryService.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await runRealDiscovery();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido na descoberta"
    });
  }
});

export default router;

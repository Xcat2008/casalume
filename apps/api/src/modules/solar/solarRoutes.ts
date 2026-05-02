import { Router } from "express";
import { getSolarFlow, getSolarState } from "./solarService.js";

const router = Router();

// Estado completo com fluxos calculados
router.get("/state", (_req, res) => {
  res.json(getSolarFlow());
});

// Estado raw
router.get("/raw", (_req, res) => {
  res.json(getSolarState());
});

export default router;

import { Router } from "express";
import {
  getZigbeeDevices,
  getZigbeeStatus,
  setPermitJoin
} from "./zigbeeService.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getZigbeeStatus());
});

router.get("/devices", (_req, res) => {
  res.json(getZigbeeDevices());
});

router.post("/permit-join", (req, res) => {
  const enabled = Boolean(req.body?.enabled);

  const ok = setPermitJoin(enabled);

  res.json({
    ok,
    permitJoin: enabled
  });
});

export default router;

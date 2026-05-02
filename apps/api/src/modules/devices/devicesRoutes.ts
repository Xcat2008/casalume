import { Router } from "express";
import { controlDevice, refreshDevice } from "./deviceControlService.js";
import {
  addManualState,
  assignDeviceToRoom,
  createManualDevice,
  getAllDevices,
  hideDeviceCard,
  renameDevice,
  restoreHiddenCards,
  updateDevicePosition
} from "./devicesService.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getAllDevices());
});

router.post("/manual", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const type = String(req.body?.type ?? "switch").trim() || "switch";
  const rawRoomId = req.body?.roomId;
  const roomId = rawRoomId === null || rawRoomId === "" || rawRoomId === undefined ? null : Number(rawRoomId);

  if (!name) {
    return res.status(400).json({ ok: false, error: "Nome obrigatório" });
  }

  if (roomId !== null && (!Number.isInteger(roomId) || roomId < 1)) {
    return res.status(400).json({ ok: false, error: "roomId inválido" });
  }

  const device = createManualDevice({ name, type, roomId });
  return res.json({ ok: true, device });
});

router.patch("/:deviceId/room", (req, res) => {
  const rawRoomId = req.body?.roomId;

  if (rawRoomId === null || rawRoomId === "" || rawRoomId === undefined) {
    const result = assignDeviceToRoom(req.params.deviceId, null);
    return res.json({ ok: true, changed: result.changes });
  }

  const roomId = Number(rawRoomId);

  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ ok: false, error: "roomId inválido" });
  }

  const result = assignDeviceToRoom(req.params.deviceId, roomId);
  return res.json({ ok: true, changed: result.changes });
});

router.patch("/:deviceId/name", (req, res) => {
  const name = String(req.body?.name ?? "").trim();

  if (!name) {
    return res.status(400).json({ ok: false, error: "Nome obrigatório" });
  }

  const result = renameDevice(req.params.deviceId, name);
  return res.json({ ok: true, changed: result.changes });
});

router.patch("/:deviceId/position", (req, res) => {
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ ok: false, error: "Coordenadas inválidas" });
  }

  const result = updateDevicePosition(req.params.deviceId, x, y);
  return res.json({ ok: true, changed: result.changes });
});

router.post("/:deviceId/states", (req, res) => {
  const label = String(req.body?.label ?? "").trim();

  if (!label) {
    return res.status(400).json({ ok: false, error: "Estado obrigatório" });
  }

  const result = addManualState(req.params.deviceId, label);
  return res.json({ ok: true, changed: result.changes });
});

router.patch("/:deviceId/hidden", (req, res) => {
  const hidden = Boolean(req.body?.hidden);
  const result = hideDeviceCard(req.params.deviceId, hidden);
  return res.json({ ok: true, changed: result.changes });
});

router.post("/restore-hidden", (_req, res) => {
  const result = restoreHiddenCards();
  return res.json({ ok: true, changed: result.changes });
});

router.post("/:deviceId/refresh", async (req, res) => {
  try {
    const result = await refreshDevice(req.params.deviceId);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar dispositivo"
    });
  }
});

router.post("/:deviceId/control", async (req, res) => {
  try {
    const action = String(req.body?.action ?? "");

    if (!["turnOn", "turnOff", "toggle"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Ação inválida" });
    }

    const result = await controlDevice(req.params.deviceId, action);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao controlar dispositivo"
    });
  }
});

export default router;

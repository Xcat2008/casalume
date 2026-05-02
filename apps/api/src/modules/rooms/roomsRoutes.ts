import { Router } from "express";
import { getAllRooms } from "./roomsService.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getAllRooms());
});

export default router;

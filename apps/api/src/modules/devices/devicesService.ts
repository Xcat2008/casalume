import { db } from "../../db/database.js";

export type UpsertDeviceInput = {
  deviceId: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  protocol?: string | null;
  ip?: string | null;
  roomId?: number | null;
  type?: string | null;
  online?: number;
  stateJson?: string | null;
  power?: number | null;
};

type ManualDeviceInput = {
  name: string;
  type: string;
  roomId: number | null;
};

type DeviceRow = {
  id: number;
  deviceId: string;
  name: string;
  brand: string | null;
  model: string | null;
  protocol: string | null;
  ip: string | null;
  roomId: number | null;
  type: string | null;
  online: number;
  lastSeen: string | null;
  stateJson: string | null;
  power: number | null;
  customName?: string | null;
  cardX?: number | null;
  cardY?: number | null;
  hidden?: number | null;
  manualStatesJson?: string | null;
  virtual?: number | null;
  roomName?: string | null;
};

function inferCasaLumeDeviceType(input: { name?: string | null; brand?: string | null; model?: string | null; protocol?: string | null }) {
  const text = `${input.name ?? ""} ${input.brand ?? ""} ${input.model ?? ""} ${input.protocol ?? ""}`.toLowerCase();

  if (text.includes("solar") || text.includes("inverter") || text.includes("assistant")) return "solar_inverter";
  if (text.includes("light") || text.includes("lamp") || text.includes("luz")) return "light";
  if (text.includes("plug") || text.includes("tomada")) return "plug";
  if (text.includes("switch") || text.includes("shelly") || text.includes("relay") || text.includes("relé")) return "switch";
  if (text.includes("tv") || text.includes("webos") || text.includes("android tv") || text.includes("cast")) return "tv";
  if (text.includes("sensor")) return "sensor";

  return "device";
}

function parseStates(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function buildCapabilities(type: string) {
  const base = ["online", "lastSeen"];

  if (type === "switch" || type === "light" || type === "plug") {
    return [...base, "onOff", "power"];
  }

  if (type === "solar_inverter") {
    return [...base, "pvPower", "loadPower", "battery", "gridPower"];
  }

  if (type === "sensor") {
    return [...base, "sensor"];
  }

  if (type === "tv") {
    return [...base, "media", "power"];
  }

  return base;
}

function normalizeDevice(row: DeviceRow) {
  const normalizedType = inferCasaLumeDeviceType({
    name: row.customName || row.name,
    brand: row.brand,
    model: row.model,
    protocol: row.protocol
  });

  return {
    ...row,
    name: row.customName || row.name,
    normalizedType,
    hidden: Number(row.hidden || 0),
    virtual: Number(row.virtual || 0),
    manualStates: parseStates(row.manualStatesJson),
    capabilities: buildCapabilities(normalizedType)
  };
}

export function upsertDevice(input: UpsertDeviceInput) {
  const now = new Date().toISOString();
  const normalizedType = input.type || inferCasaLumeDeviceType({
    name: input.name,
    brand: input.brand || "",
    model: input.model || "",
    protocol: input.protocol || ""
  });

  return db.prepare(`
    INSERT INTO devices (
      deviceId,
      name,
      brand,
      model,
      protocol,
      ip,
      roomId,
      type,
      online,
      lastSeen,
      stateJson,
      power,
      virtual
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(deviceId) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      model = excluded.model,
      protocol = excluded.protocol,
      ip = excluded.ip,
      roomId = COALESCE(devices.roomId, excluded.roomId),
      type = excluded.type,
      online = excluded.online,
      lastSeen = excluded.lastSeen,
      stateJson = excluded.stateJson,
      power = excluded.power
  `).run(
    input.deviceId,
    input.name,
    input.brand || null,
    input.model || null,
    input.protocol || null,
    input.ip || null,
    input.roomId ?? null,
    normalizedType,
    input.online ?? 1,
    now,
    input.stateJson ?? null,
    input.power ?? null
  );
}

export function saveDiscoveredDevices(devices: UpsertDeviceInput[]) {
  const transaction = db.transaction((items: UpsertDeviceInput[]) => {
    for (const item of items) {
      upsertDevice(item);
    }
  });

  transaction(devices);
  return { ok: true, saved: devices.length };
}

export function getAllDevices() {
  const rows = db.prepare(`
    SELECT
      devices.*,
      rooms.name as roomName
    FROM devices
    LEFT JOIN rooms ON rooms.id = devices.roomId
    ORDER BY devices.virtual ASC, devices.lastSeen DESC, devices.name ASC
  `).all() as DeviceRow[];

  return rows.map(normalizeDevice);
}

export function getDeviceByDeviceId(deviceId: string) {
  const row = db.prepare(`
    SELECT
      devices.*,
      rooms.name as roomName
    FROM devices
    LEFT JOIN rooms ON rooms.id = devices.roomId
    WHERE devices.deviceId = ?
  `).get(deviceId) as DeviceRow | undefined;

  return row ? normalizeDevice(row) : null;
}

export function assignDeviceToRoom(deviceId: string, roomId: number | null) {
  return db.prepare("UPDATE devices SET roomId = ? WHERE deviceId = ?").run(roomId, deviceId);
}

export function renameDevice(deviceId: string, name: string) {
  return db.prepare("UPDATE devices SET customName = ? WHERE deviceId = ?").run(name, deviceId);
}

export function updateDevicePosition(deviceId: string, x: number, y: number) {
  const safeX = Math.max(0, Math.min(100, x));
  const safeY = Math.max(0, Math.min(100, y));

  return db.prepare("UPDATE devices SET cardX = ?, cardY = ? WHERE deviceId = ?").run(safeX, safeY, deviceId);
}

export function updateDeviceState(deviceId: string, state: Record<string, unknown>, power?: number | null) {
  return db.prepare(`
    UPDATE devices
    SET stateJson = ?, power = COALESCE(?, power), lastSeen = ?, online = 1
    WHERE deviceId = ?
  `).run(
    JSON.stringify(state),
    power ?? null,
    new Date().toISOString(),
    deviceId
  );
}

export function hideDeviceCard(deviceId: string, hidden: boolean) {
  return db.prepare("UPDATE devices SET hidden = ? WHERE deviceId = ?").run(hidden ? 1 : 0, deviceId);
}

export function restoreHiddenCards() {
  return db.prepare("UPDATE devices SET hidden = 0").run();
}

export function addManualState(deviceId: string, label: string) {
  const row = db.prepare("SELECT manualStatesJson FROM devices WHERE deviceId = ?").get(deviceId) as { manualStatesJson?: string | null } | undefined;
  const states = parseStates(row?.manualStatesJson);

  if (!states.includes(label)) {
    states.push(label);
  }

  return db.prepare("UPDATE devices SET manualStatesJson = ? WHERE deviceId = ?").run(JSON.stringify(states), deviceId);
}

export function createManualDevice(input: ManualDeviceInput) {
  const now = new Date().toISOString();
  const deviceId = `manual-${Date.now()}`;

  db.prepare(`
    INSERT INTO devices (
      deviceId,
      name,
      brand,
      model,
      protocol,
      ip,
      roomId,
      type,
      online,
      lastSeen,
      stateJson,
      power,
      customName,
      cardX,
      cardY,
      hidden,
      manualStatesJson,
      virtual
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deviceId,
    input.name,
    "Manual",
    input.type,
    "Manual",
    "-",
    input.roomId,
    input.type,
    1,
    now,
    null,
    null,
    null,
    null,
    null,
    0,
    "[]",
    1
  );

  return getDeviceByDeviceId(deviceId);
}

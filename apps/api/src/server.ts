import cors from "cors";
import express from "express";
import helmet from "helmet";
import mqtt from "mqtt";

import "./db/database.js";
import { removeLegacyMockDevices } from "./db/cleanup.js";
import { upsertDevice } from "./modules/devices/devicesService.js";
import { updateSolarFromMqtt } from "./modules/solar/solarService.js";

import roomsRoutes    from "./modules/rooms/roomsRoutes.js";
import devicesRoutes  from "./modules/devices/devicesRoutes.js";
import zigbeeRoutes   from "./modules/zigbee/zigbeeRoutes.js";
import discoveryRoutes from "./modules/discovery/discoveryRoutes.js";
import solarRoutes    from "./modules/solar/solarRoutes.js";

removeLegacyMockDevices();

const app = express();
const startedAt = new Date().toISOString();

app.use(helmet());
app.use(cors());
app.use(express.json());

const mqttHost    = process.env.MQTT_HOST    || "127.0.0.1";
const mqttPort    = process.env.MQTT_PORT    || "1883";
const solarIp     = process.env.SOLAR_ASSISTANT_IP || "192.168.50.211";
const version     = process.env.CASALUME_VERSION   || "0.4.0";

let mqttOnline      = false;
let solarOnline     = false;
let mqttLastError: string | null = null;
const zigbeeDevicesSeen = new Map<string, { name: string; lastSeen: string }>();

function inferType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("solar") || t.includes("inverter") || t.includes("battery")) return "solar_inverter";
  if (t.includes("light") || t.includes("lamp")    || t.includes("bulb"))     return "light";
  if (t.includes("plug")  || t.includes("socket")  || t.includes("outlet"))   return "plug";
  if (t.includes("switch")|| t.includes("relay")   || t.includes("shelly"))   return "switch";
  if (t.includes("tv")    || t.includes("webos")   || t.includes("cast"))     return "tv";
  if (t.includes("sensor")|| t.includes("motion")  || t.includes("contact"))  return "sensor";
  if (t.includes("climate")|| t.includes("thermostat"))                        return "climate";
  return "device";
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROKER 1 — Nosso Mosquitto (Zigbee, Shelly, Tasmota, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
const mainClient = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`);

mainClient.on("connect", () => {
  mqttOnline = true;
  mqttLastError = null;
  console.log(`[MQTT-main] Ligado a ${mqttHost}:${mqttPort}`);
  mainClient.subscribe([
    "zigbee2mqtt/#",
    "shellies/#",
    "tasmota/#",
    "casalume/#"
  ]);
  mainClient.publish("zigbee2mqtt/bridge/request/devices", "");
});

mainClient.on("offline", () => { mqttOnline = false; });
mainClient.on("error",   (err) => { mqttLastError = err.message; });

mainClient.on("message", (topic, payload) => {
  const raw = payload.toString();
  try {
    if (topic === "zigbee2mqtt/bridge/devices") {
      const devices = JSON.parse(raw) as Array<{
        ieee_address: string; friendly_name: string; type: string;
        disabled?: boolean; interview_completed?: boolean;
        definition?: { vendor?: string; model?: string; description?: string };
      }>;
      for (const d of devices) {
        if (d.type === "Coordinator" || d.disabled) continue;
        const vendor = d.definition?.vendor || "Zigbee";
        const model  = d.definition?.model  || "Unknown";
        upsertDevice({
          deviceId: `zigbee-${d.ieee_address}`,
          name: d.friendly_name || d.ieee_address,
          brand: vendor, model,
          protocol: "Zigbee2MQTT", ip: mqttHost,
          type: inferType(`${d.friendly_name} ${vendor} ${model}`),
          online: d.interview_completed ? 1 : 0
        });
        zigbeeDevicesSeen.set(d.ieee_address, {
          name: d.friendly_name,
          lastSeen: new Date().toISOString()
        });
      }
      console.log(`[Zigbee] ${devices.filter(d => d.type !== "Coordinator").length} dispositivos`);
      return;
    }

    if (topic.startsWith("zigbee2mqtt/") && !topic.includes("/bridge/")) {
      const friendlyName = topic.replace("zigbee2mqtt/", "");
      const state = JSON.parse(raw) as Record<string, unknown>;
      for (const [ieee, info] of zigbeeDevicesSeen) {
        if (info.name === friendlyName) {
          upsertDevice({
            deviceId: `zigbee-${ieee}`, name: friendlyName,
            brand: "Zigbee", model: "Unknown",
            protocol: "Zigbee2MQTT", ip: mqttHost,
            type: inferType(friendlyName), online: 1,
            stateJson: raw,
            power: typeof state.power === "number" ? state.power : null
          });
          break;
        }
      }
      return;
    }

    if (topic.startsWith("shellies/")) {
      const parts = topic.split("/");
      const shellyId = parts[1];
      if (!shellyId) return;
      const isPower = parts.includes("power") || parts.includes("energy");
      upsertDevice({
        deviceId: `shelly-mqtt-${shellyId}`,
        name: shellyId.replace(/-/g, " "),
        brand: "Shelly", model: "Shelly MQTT",
        protocol: "Shelly MQTT", ip: "-",
        type: "switch", online: 1,
        stateJson: JSON.stringify({ state: raw }),
        power: isPower ? parseFloat(raw) || null : null
      });
      return;
    }

    if (topic.startsWith("tasmota/")) {
      const parts = topic.split("/");
      const id = parts[1];
      if (!id || parts[2] !== "tele") return;
      upsertDevice({
        deviceId: `tasmota-${id}`, name: id,
        brand: "Tasmota", model: "Tasmota Device",
        protocol: "Tasmota MQTT", ip: "-",
        type: "switch", online: 1, stateJson: raw
      });
      return;
    }
  } catch { /* payload não JSON */ }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BROKER 2 — Solar Assistant direto (192.168.50.211:1883)
// ═══════════════════════════════════════════════════════════════════════════════
function connectSolarMqtt() {
  console.log(`[MQTT-solar] A ligar ao Solar Assistant em ${solarIp}:1883...`);

  const solarClient = mqtt.connect(`mqtt://${solarIp}:1883`, {
    clientId: `casalume-solar-${Date.now()}`,
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 10000
  });

  solarClient.on("connect", () => {
    solarOnline = true;
    console.log(`[MQTT-solar] Ligado ao Solar Assistant`);
    solarClient.subscribe("solar_assistant/#");
  });

  solarClient.on("offline", () => {
    solarOnline = false;
    console.warn("[MQTT-solar] Desligado do Solar Assistant");
  });

  solarClient.on("error", (err) => {
    console.error(`[MQTT-solar] Erro: ${err.message}`);
  });

  solarClient.on("message", (topic, payload) => {
    const raw = payload.toString();
    updateSolarFromMqtt(topic, raw);

    // Atualizar dispositivo na DB com potência de carga atual
    if (topic === "solar_assistant/inverter_1/load_power/state") {
      upsertDevice({
        deviceId: "solar-assistant-main",
        name: "Solar Assistant",
        brand: "Solar Assistant",
        model: "Hybrid Inverter MQTT",
        protocol: "Solar Assistant MQTT",
        ip: solarIp,
        type: "solar_inverter",
        online: 1,
        power: parseFloat(raw) || null
      });
    }
  });

  return solarClient;
}

connectSolarMqtt();

// ═══════════════════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true, name: "CasaLume", version,
    phase: "3.0-enterprise", startedAt,
    services: {
      mqtt:         mqttOnline  ? "online" : "offline",
      solarMqtt:    solarOnline ? "online" : "offline",
      sqlite:       "online",
      zigbee2mqtt:  "active",
      discovery:    "real",
      wifiControl:  "shelly",
      solar:        "solar_assistant_mqtt_direct"
    },
    mqtt: {
      connected: mqttOnline,
      lastError: mqttLastError,
      zigbeeDevicesSeen: zigbeeDevicesSeen.size
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rotas
// ═══════════════════════════════════════════════════════════════════════════════
app.use("/api/rooms",     roomsRoutes);
app.use("/api/devices",   devicesRoutes);
app.use("/api/zigbee",    zigbeeRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/solar",     solarRoutes);

const port = Number(process.env.CASALUME_API_PORT) || 4101;
app.listen(port, "0.0.0.0", () => {
  console.log(`CasaLume API v${version} Fase 3.0-Enterprise ativa na porta ${port}`);
});

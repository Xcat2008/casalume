import dgram from "dgram";
import os from "os";
import { saveDiscoveredDevices } from "../devices/devicesService.js";

type DiscoveredDevice = {
  deviceId: string;
  name: string;
  brand: string;
  model: string;
  protocol: string;
  ip: string;
  roomId: number | null;
  type: string;
  online: number;
  lastSeen: string;
};

type Zigbee2MqttDevice = {
  ieee_address: string;
  friendly_name: string;
  type: string;
  supported: boolean;
  disabled: boolean;
  definition?: {
    vendor?: string;
    model?: string;
    description?: string;
  };
  interview_completed: boolean;
};

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function getLocalSubnet(): string {
  if (process.env.LOCAL_SUBNET) return process.env.LOCAL_SUBNET;

  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && address.address.startsWith("192.168.")) {
        return address.address.split(".").slice(0, 3).join(".");
      }
    }
  }

  return "192.168.50";
}

function inferTypeFromText(text: string): string {
  const t = text.toLowerCase();

  if (t.includes("solar") || t.includes("inverter") || t.includes("assistant") || t.includes("battery")) return "solar_inverter";
  if (t.includes("light") || t.includes("lamp") || t.includes("luz") || t.includes("bulb") || t.includes("led")) return "light";
  if (t.includes("plug") || t.includes("tomada") || t.includes("socket") || t.includes("outlet")) return "plug";
  if (t.includes("switch") || t.includes("relay") || t.includes("relé") || t.includes("shelly")) return "switch";
  if (t.includes("tv") || t.includes("webos") || t.includes("android tv") || t.includes("cast") || t.includes("television")) return "tv";
  if (t.includes("sensor") || t.includes("motion") || t.includes("contact") || t.includes("temperature") || t.includes("humidity") || t.includes("door") || t.includes("window")) return "sensor";
  if (t.includes("climate") || t.includes("thermostat") || t.includes("ac") || t.includes("hvac") || t.includes("heat")) return "climate";
  if (t.includes("router") || t.includes("access point") || t.includes("gateway") || t.includes("network")) return "network";

  return "device";
}

// ─── Shelly ─────────────────────────────────────────────────────────────────

async function discoverShelly(): Promise<DiscoveredDevice[]> {
  const subnet = getLocalSubnet();
  const found: DiscoveredDevice[] = [];

  const checks = Array.from({ length: 254 }, async (_, index) => {
    const ip = `${subnet}.${index + 1}`;

    try {
      const response = await fetch(`http://${ip}/shelly`, {
        signal: timeoutSignal(650)
      });

      if (!response.ok) return;

      const data = await response.json() as Record<string, unknown>;
      const name = (data.name as string) || (data.id as string) || `Shelly ${ip}`;
      const model = (data.model as string) || (data.type as string) || "Shelly";
      const inferredType = inferTypeFromText(`${name} ${model} shelly switch`);

      found.push({
        deviceId: `shelly-${ip}`,
        name,
        brand: "Shelly",
        model,
        protocol: "Shelly local API",
        ip,
        roomId: null,
        type: inferredType,
        online: 1,
        lastSeen: new Date().toISOString()
      });
    } catch {
      // silêncio: IP sem Shelly
    }
  });

  await Promise.allSettled(checks);
  return found;
}

// ─── SSDP / UPnP ────────────────────────────────────────────────────────────

function parseHeader(raw: string, header: string): string {
  const match = raw.match(new RegExp(`^${header}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function inferSsdpDevice(message: string, ip: string): DiscoveredDevice | null {
  const server = parseHeader(message, "SERVER");
  const st = parseHeader(message, "ST");
  const usn = parseHeader(message, "USN");

  const text = `${server} ${st} ${usn}`.toLowerCase();

  let brand = "UPnP";
  let model = "SSDP Device";
  let protocol = "UPnP / SSDP";
  let type = "network";
  let name = `Dispositivo ${ip}`;

  if (text.includes("lg") || text.includes("lge") || text.includes("webos")) {
    brand = "LG";
    model = "webOS TV";
    protocol = "LG webOS / SSDP";
    type = "tv";
    name = "LG webOS TV";
  } else if (text.includes("dial") || text.includes("google") || text.includes("chromecast") || text.includes("android")) {
    brand = text.includes("google") ? "Google" : "Android";
    model = "Cast / Android TV";
    protocol = "Cast / Android TV";
    type = "tv";
    name = "Android TV / Cast";
  } else if (text.includes("asus") || text.includes("router") || text.includes("wps") || text.includes("gateway")) {
    brand = "ASUS";
    model = "Router / Access Point";
    protocol = "UPnP / SSDP";
    type = "network";
    name = "Router / Access Point";
  } else if (text.includes("samsung")) {
    brand = "Samsung";
    model = "Samsung TV";
    protocol = "UPnP / SSDP";
    type = "tv";
    name = "Samsung TV";
  } else {
    return null;
  }

  return {
    deviceId: `ssdp-${ip}-${Buffer.from(`${brand}-${model}-${usn}`).toString("hex").slice(0, 12)}`,
    name,
    brand,
    model,
    protocol,
    ip,
    roomId: null,
    type,
    online: 1,
    lastSeen: new Date().toISOString()
  };
}

async function discoverSsdp(): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const devices = new Map<string, DiscoveredDevice>();

    const search = [
      "M-SEARCH * HTTP/1.1",
      "HOST: 239.255.255.250:1900",
      'MAN: "ssdp:discover"',
      "MX: 2",
      "ST: ssdp:all",
      "",
      ""
    ].join("\r\n");

    socket.on("message", (buffer, remote) => {
      const parsed = inferSsdpDevice(buffer.toString("utf8"), remote.address);
      if (parsed) devices.set(parsed.deviceId, parsed);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(Buffer.from(search), 1900, "239.255.255.250");
    });

    setTimeout(() => {
      try { socket.close(); } catch { /* já fechado */ }
      resolve([...devices.values()]);
    }, 3200);
  });
}

// ─── Zigbee2MQTT (real via HTTP API) ────────────────────────────────────────

async function discoverZigbeeMqtt(): Promise<DiscoveredDevice[]> {
  const z2mHost = process.env.ZIGBEE2MQTT_HOST || "zigbee2mqtt";
  const z2mPort = process.env.ZIGBEE2MQTT_PORT || "8080";
  const z2mUrl = `http://${z2mHost}:${z2mPort}`;

  try {
    const response = await fetch(`${z2mUrl}/api/devices`, {
      signal: timeoutSignal(5000)
    });

    if (!response.ok) {
      console.warn(`[Zigbee2MQTT] HTTP ${response.status} ao obter dispositivos`);
      return [];
    }

    const raw = await response.json() as Zigbee2MqttDevice[];

    if (!Array.isArray(raw)) return [];

    const devices: DiscoveredDevice[] = raw
      .filter((item) => item.type !== "Coordinator" && !item.disabled)
      .map((item) => {
        const vendor = item.definition?.vendor || "Zigbee";
        const model = item.definition?.model || "Unknown";
        const description = item.definition?.description || "";
        const inferredType = inferTypeFromText(`${item.friendly_name} ${vendor} ${model} ${description}`);

        return {
          deviceId: `zigbee-${item.ieee_address}`,
          name: item.friendly_name || item.ieee_address,
          brand: vendor,
          model,
          protocol: "Zigbee2MQTT",
          ip: z2mHost,
          roomId: null,
          type: inferredType,
          online: item.interview_completed ? 1 : 0,
          lastSeen: new Date().toISOString()
        };
      });

    console.log(`[Zigbee2MQTT] ${devices.length} dispositivos descobertos`);
    return devices;
  } catch (error) {
    console.warn(`[Zigbee2MQTT] Erro na descoberta: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// ─── Solar Assistant ─────────────────────────────────────────────────────────

async function discoverSolarAssistant(): Promise<DiscoveredDevice[]> {
  const solarIp = process.env.SOLAR_ASSISTANT_IP || "192.168.50.211";
  const solarRoomId = process.env.SOLAR_ASSISTANT_ROOM_ID ? Number(process.env.SOLAR_ASSISTANT_ROOM_ID) : 5;

  return [
    {
      deviceId: "solar-assistant-main",
      name: "Solar Assistant",
      brand: "Solar Assistant",
      model: "Hybrid Inverter MQTT",
      protocol: "Solar Assistant MQTT",
      ip: solarIp,
      roomId: solarRoomId,
      type: "solar_inverter",
      online: 1,
      lastSeen: new Date().toISOString()
    }
  ];
}

// ─── Orchestrador principal ──────────────────────────────────────────────────

export async function runRealDiscovery() {
  console.log("[Discovery] A iniciar descoberta multi-protocolo...");

  const [shelly, ssdp, zigbee, solar] = await Promise.all([
    discoverShelly(),
    discoverSsdp(),
    discoverZigbeeMqtt(),
    discoverSolarAssistant()
  ]);

  const devices = [...shelly, ...ssdp, ...zigbee, ...solar];

  saveDiscoveredDevices(devices);

  console.log(`[Discovery] Concluído: ${devices.length} dispositivos (Shelly: ${shelly.length}, SSDP: ${ssdp.length}, Zigbee: ${zigbee.length}, Solar: ${solar.length})`);

  return {
    hostname: os.hostname(),
    subnet: getLocalSubnet(),
    discovered: devices.length,
    groups: {
      shelly: shelly.length,
      ssdp: ssdp.length,
      zigbee: zigbee.length,
      solar: solar.length
    },
    devices
  };
}

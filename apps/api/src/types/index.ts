export type Room = {
  id: number;
  key: string;
  name: string;
  icon: string;
};

export type DeviceProtocol =
  | "Shelly local API"
  | "Solar Assistant MQTT"
  | "Zigbee2MQTT"
  | "UPnP / SSDP"
  | "LG webOS / SSDP"
  | "Cast / Android TV"
  | "Manual"
  | string;

export type DeviceType =
  | "light"
  | "plug"
  | "switch"
  | "sensor"
  | "solar_inverter"
  | "tv"
  | "climate"
  | "network"
  | "device"
  | string;

export type Device = {
  id: number;
  deviceId: string;
  name: string;
  brand: string | null;
  model: string | null;
  protocol: DeviceProtocol | null;
  ip: string | null;
  roomId: number | null;
  roomName?: string | null;
  type: DeviceType | null;
  normalizedType?: DeviceType;
  capabilities?: string[];
  online: number;
  lastSeen: string | null;
  stateJson?: string | null;
  power?: number | null;
  customName?: string | null;
  cardX?: number | null;
  cardY?: number | null;
  hidden?: number;
  manualStates?: string[];
  manualStatesJson?: string | null;
  virtual?: number;
};

export type DiscoveryResult = {
  hostname: string;
  subnet: string;
  discovered: number;
  groups: {
    shelly: number;
    ssdp: number;
    zigbee: number;
    solar: number;
  };
  devices: Device[];
};

export type HealthResponse = {
  ok: boolean;
  name: string;
  version: string;
  phase: string;
  startedAt: string;
  services: Record<string, string>;
  mqtt: {
    connected: boolean;
    lastError: string | null;
  };
};

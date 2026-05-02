export type SolarState = {
  pvPower: number;
  pvPower1: number;
  pvPower2: number;
  pvVoltage1: number;
  pvVoltage2: number;
  pvCurrent1: number;
  pvCurrent2: number;
  batteryPower: number;
  batteryVoltage: number;
  batteryCurrent: number;
  batterySOC: number;
  batteryTemperature: number;
  batteryHealth: number;
  batteryCycles: number;
  batteryCapacity: number;
  batteryChargeCapacity: number;
  cellVoltageAvg: number;
  cellVoltageHigh: number;
  cellVoltageLow: number;
  gridPower: number;
  gridVoltage: number;
  gridFrequency: number;
  loadPower: number;
  loadApparentPower: number;
  loadPercentage: number;
  acOutputVoltage: number;
  acOutputFrequency: number;
  temperature: number;
  deviceMode: string;
  outputSourcePriority: string;
  chargerSourcePriority: string;
  totalBatteryEnergyIn: number;
  totalBatteryEnergyOut: number;
  totalGridEnergyIn: number;
  totalGridEnergyOut: number;
  totalLoadEnergy: number;
  totalPvEnergy: number;
  lastUpdated: string;
  source: "solar_assistant_mqtt" | "dessmonitor_api" | "none";
};

let solarState: SolarState = {
  pvPower: 0, pvPower1: 0, pvPower2: 0,
  pvVoltage1: 0, pvVoltage2: 0, pvCurrent1: 0, pvCurrent2: 0,
  batteryPower: 0, batteryVoltage: 0, batteryCurrent: 0,
  batterySOC: 0, batteryTemperature: 0, batteryHealth: 0,
  batteryCycles: 0, batteryCapacity: 0, batteryChargeCapacity: 0,
  cellVoltageAvg: 0, cellVoltageHigh: 0, cellVoltageLow: 0,
  gridPower: 0, gridVoltage: 0, gridFrequency: 0,
  loadPower: 0, loadApparentPower: 0, loadPercentage: 0,
  acOutputVoltage: 0, acOutputFrequency: 0, temperature: 0,
  deviceMode: "Unknown", outputSourcePriority: "Unknown",
  chargerSourcePriority: "Unknown",
  totalBatteryEnergyIn: 0, totalBatteryEnergyOut: 0,
  totalGridEnergyIn: 0, totalGridEnergyOut: 0,
  totalLoadEnergy: 0, totalPvEnergy: 0,
  lastUpdated: new Date().toISOString(),
  source: "none"
};

export function updateSolarFromMqtt(topic: string, value: string) {
  const n = parseFloat(value);
  const ok = !isNaN(n);

  if (topic === "solar_assistant/inverter_1/pv_power/state"              && ok) solarState.pvPower = n;
  if (topic === "solar_assistant/inverter_1/pv_power_1/state"            && ok) solarState.pvPower1 = n;
  if (topic === "solar_assistant/inverter_1/pv_power_2/state"            && ok) solarState.pvPower2 = n;
  if (topic === "solar_assistant/inverter_1/pv_voltage_1/state"          && ok) solarState.pvVoltage1 = n;
  if (topic === "solar_assistant/inverter_1/pv_voltage_2/state"          && ok) solarState.pvVoltage2 = n;
  if (topic === "solar_assistant/inverter_1/pv_current_1/state"          && ok) solarState.pvCurrent1 = n;
  if (topic === "solar_assistant/inverter_1/pv_current_2/state"          && ok) solarState.pvCurrent2 = n;
  if (topic === "solar_assistant/inverter_1/battery_voltage/state"       && ok) solarState.batteryVoltage = n;
  if (topic === "solar_assistant/inverter_1/battery_current/state"       && ok) solarState.batteryCurrent = n;
  if (topic === "solar_assistant/inverter_1/grid_power/state"            && ok) solarState.gridPower = n;
  if (topic === "solar_assistant/inverter_1/grid_voltage/state"          && ok) solarState.gridVoltage = n;
  if (topic === "solar_assistant/inverter_1/grid_frequency/state"        && ok) solarState.gridFrequency = n;
  if (topic === "solar_assistant/inverter_1/load_power/state"            && ok) solarState.loadPower = n;
  if (topic === "solar_assistant/inverter_1/load_apparent_power/state"   && ok) solarState.loadApparentPower = n;
  if (topic === "solar_assistant/inverter_1/load_percentage/state"       && ok) solarState.loadPercentage = n;
  if (topic === "solar_assistant/inverter_1/ac_output_voltage/state"     && ok) solarState.acOutputVoltage = n;
  if (topic === "solar_assistant/inverter_1/ac_output_frequency/state"   && ok) solarState.acOutputFrequency = n;
  if (topic === "solar_assistant/inverter_1/temperature/state"           && ok) solarState.temperature = n;
  if (topic === "solar_assistant/inverter_1/device_mode/state")               solarState.deviceMode = value;
  if (topic === "solar_assistant/inverter_1/output_source_priority/state")    solarState.outputSourcePriority = value;
  if (topic === "solar_assistant/inverter_1/charger_source_priority/state")   solarState.chargerSourcePriority = value;

  if (topic === "solar_assistant/battery_1/power/state"                  && ok) solarState.batteryPower = n;
  if (topic === "solar_assistant/battery_1/state_of_charge/state"        && ok) solarState.batterySOC = n;
  if (topic === "solar_assistant/battery_1/temperature/state"            && ok) solarState.batteryTemperature = n;
  if (topic === "solar_assistant/battery_1/state_of_health/state"        && ok) solarState.batteryHealth = n;
  if (topic === "solar_assistant/battery_1/cycles/state"                 && ok) solarState.batteryCycles = n;
  if (topic === "solar_assistant/battery_1/capacity/state"               && ok) solarState.batteryCapacity = n;
  if (topic === "solar_assistant/battery_1/charge_capacity/state"        && ok) solarState.batteryChargeCapacity = n;
  if (topic === "solar_assistant/battery_1/cell_voltage_-_average/state" && ok) solarState.cellVoltageAvg = n;
  if (topic === "solar_assistant/battery_1/cell_voltage_-_highest/state" && ok) solarState.cellVoltageHigh = n;
  if (topic === "solar_assistant/battery_1/cell_voltage_-_lowest/state"  && ok) solarState.cellVoltageLow = n;
  if (topic === "solar_assistant/battery_1/voltage/state"                && ok) solarState.batteryVoltage = n;
  if (topic === "solar_assistant/battery_1/current/state"                && ok) solarState.batteryCurrent = n;

  if (topic === "solar_assistant/total/battery_power/state"              && ok) solarState.batteryPower = n;
  if (topic === "solar_assistant/total/battery_state_of_charge/state"   && ok) solarState.batterySOC = n;
  if (topic === "solar_assistant/total/battery_temperature/state"        && ok) solarState.batteryTemperature = n;
  if (topic === "solar_assistant/total/battery_energy_in/state"          && ok) solarState.totalBatteryEnergyIn = n;
  if (topic === "solar_assistant/total/battery_energy_out/state"         && ok) solarState.totalBatteryEnergyOut = n;
  if (topic === "solar_assistant/total/grid_energy_in/state"             && ok) solarState.totalGridEnergyIn = n;
  if (topic === "solar_assistant/total/grid_energy_out/state"            && ok) solarState.totalGridEnergyOut = n;
  if (topic === "solar_assistant/total/load_energy/state"                && ok) solarState.totalLoadEnergy = n;
  if (topic === "solar_assistant/total/pv_energy/state"                  && ok) solarState.totalPvEnergy = n;

  solarState.lastUpdated = new Date().toISOString();
  solarState.source = "solar_assistant_mqtt";
}

export function getSolarState(): SolarState {
  return { ...solarState };
}

export function getSolarFlow() {
  const s = getSolarState();
  const alerts: Array<{ level: string; msg: string }> = [];

  if (s.batterySOC < 10)   alerts.push({ level: "critical", msg: "Bateria critica abaixo de 10%" });
  else if (s.batterySOC < 20) alerts.push({ level: "warning", msg: "Bateria abaixo de 20%" });
  if (s.temperature > 55)  alerts.push({ level: "warning",  msg: "Temperatura do inversor elevada" });
  if (s.gridPower > 50)    alerts.push({ level: "info",     msg: "A importar energia da rede" });

  return {
    ...s,
    batteryCharging:    s.batteryPower > 50,
    batteryDischarging: s.batteryPower < -50,
    gridImporting:      s.gridPower > 50,
    gridExporting:      s.gridPower < -50,
    pvProducing:        s.pvPower > 10,
    alerts
  };
}

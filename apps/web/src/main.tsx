import React, {
  useCallback, useEffect, useMemo, useRef, useState
} from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowLeft, Bath, Bed, Bell, ChefHat, CloudSun,
  Grid2X2, Home, LayoutDashboard, LibraryBig,
  Pencil, Plus, RefreshCw, Search, Settings,
  Sun, Trash2, X, Zap
} from "lucide-react";
import "./index.css";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════
type Room   = { id: number; key: string; name: string; icon: string };
type Device = {
  id: number; deviceId: string; name: string;
  brand: string | null; model: string | null;
  protocol: string | null; ip: string | null;
  roomId: number | null; roomName?: string | null;
  type: string | null; normalizedType?: string;
  online: number; power?: number | null;
  cardX?: number | null; cardY?: number | null;
  hidden?: number; manualStates?: string[]; virtual?: number;
};
type CardPos = { x: number; y: number };
type Weather = { temp: number; description: string };
type ModalState =
  | { kind: "none" }
  | { kind: "rename";     device: Device }
  | { kind: "addVirtual"; roomId: number | null }
  | { kind: "addState";   device: Device };

type SolarState = {
  pvPower: number; pvPower1: number; pvPower2: number;
  pvVoltage1: number; pvVoltage2: number;
  pvCurrent1: number; pvCurrent2: number;
  batteryPower: number; batteryVoltage: number; batteryCurrent: number;
  batterySOC: number; batteryTemperature: number; batteryHealth: number;
  batteryCycles: number; batteryCapacity: number; batteryChargeCapacity: number;
  cellVoltageAvg: number; cellVoltageHigh: number; cellVoltageLow: number;
  gridPower: number; gridVoltage: number; gridFrequency: number;
  loadPower: number; loadApparentPower: number; loadPercentage: number;
  acOutputVoltage: number; acOutputFrequency: number; temperature: number;
  deviceMode: string; outputSourcePriority: string; chargerSourcePriority: string;
  totalBatteryEnergyIn: number; totalBatteryEnergyOut: number;
  totalGridEnergyIn: number; totalGridEnergyOut: number;
  totalLoadEnergy: number; totalPvEnergy: number;
  batteryCharging: boolean; batteryDischarging: boolean;
  gridImporting: boolean; gridExporting: boolean; pvProducing: boolean;
  alerts: Array<{ level: string; msg: string }>;
  lastUpdated: string; source: string;
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function roomKey(r?: Room) { return `${r?.key ?? ""} ${r?.name ?? ""}`.toLowerCase(); }
function roomImage(r: Room) {
  const k = roomKey(r);
  if (k.includes("cozinha")) return "/images/kitchen.png";
  if (k.includes("sala"))    return "/images/living-room.png";
  if (k.includes("quarto"))  return "/images/bedroom.png";
  if (k.includes("banho"))   return "/images/bathroom.png";
  if (k.includes("solar"))   return "/images/solar-garage.png";
  return "/images/casalume-house-premium.png";
}
function isSolar(r?: Room) { return roomKey(r).includes("solar"); }
function findRoom(rooms: Room[], q: string) { return rooms.find(r => roomKey(r).includes(q)); }
function deviceCount(devices: Device[], room?: Room) {
  if (!room) return 0;
  return devices.filter(d => d.roomId === room.id).length;
}
function typeLabel(d: Device) {
  const t = `${d.normalizedType ?? d.type ?? ""}`.toLowerCase();
  if (t.includes("light"))   return "Luz";
  if (t.includes("plug"))    return "Tomada";
  if (t.includes("switch"))  return "Interruptor";
  if (t.includes("solar"))   return "Energia Solar";
  if (t.includes("tv"))      return "TV";
  if (t.includes("sensor"))  return "Sensor";
  if (t.includes("climate")) return "Clima";
  return "Dispositivo";
}
function typeBadgeClass(d: Device) {
  const t = `${d.normalizedType ?? d.type ?? ""}`.toLowerCase();
  if (t.includes("light"))  return "type-light";
  if (t.includes("plug"))   return "type-plug";
  if (t.includes("switch") || t.includes("relay")) return "type-switch";
  if (t.includes("sensor")) return "type-sensor";
  if (t.includes("solar"))  return "type-solar";
  if (t.includes("tv"))     return "type-tv";
  if (t.includes("climate"))return "type-climate";
  return "type-device";
}
async function apiPatch(path: string, body: unknown) {
  await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function apiPost(path: string, body?: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return r.json();
}
function W(n: number) { return `${Math.abs(Math.round(n)).toLocaleString("pt-PT")} W`; }

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    setMsg(text);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3000);
  }, []);
  return { msg, show };
}
function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function Modal({ state, rooms, onClose, onRename, onAddVirtual, onAddState }: {
  state: ModalState; rooms: Room[]; onClose: () => void;
  onRename: (d: Device, name: string) => Promise<void>;
  onAddVirtual: (name: string, type: string, roomId: number | null) => Promise<void>;
  onAddState: (d: Device, label: string) => Promise<void>;
}) {
  const [value, setValue]   = useState("");
  const [type,  setType]    = useState("switch");
  const [roomId,setRoomId]  = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue(state.kind === "rename" ? (state as { kind: "rename"; device: Device }).device.name : "");
    setTimeout(() => ref.current?.focus(), 80);
  }, [state]);
  if (state.kind === "none") return null;
  async function confirm() {
    if (state.kind === "rename" && value.trim())
      { await onRename((state as { kind:"rename"; device:Device }).device, value.trim()); onClose(); }
    else if (state.kind === "addVirtual" && value.trim())
      { await onAddVirtual(value.trim(), type, roomId ?? (state as { kind:"addVirtual"; roomId:number|null }).roomId); onClose(); }
    else if (state.kind === "addState" && value.trim())
      { await onAddState((state as { kind:"addState"; device:Device }).device, value.trim()); onClose(); }
  }
  const titles = { none:"", rename:"Renomear dispositivo", addVirtual:"Adicionar cartao manual", addState:"Adicionar estado manual" };
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onKeyDown={e => { if (e.key==="Enter") confirm(); if (e.key==="Escape") onClose(); }}>
        <h2>{titles[state.kind]}</h2>
        <div className="modal-field">
          <label>{state.kind === "addState" ? "Nome do estado" : "Nome"}</label>
          <input ref={ref} value={value} onChange={e => setValue(e.target.value)} placeholder="Ex: Luz do teto" />
        </div>
        {state.kind === "addVirtual" && (<>
          <div className="modal-field">
            <label>Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="light">Luz</option><option value="plug">Tomada</option>
              <option value="switch">Interruptor</option><option value="sensor">Sensor</option>
              <option value="climate">Clima</option><option value="tv">TV</option>
              <option value="solar_inverter">Solar</option><option value="device">Outro</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Divisao</label>
            <select value={roomId ?? ""} onChange={e => setRoomId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Por atribuir</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </>)}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={confirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEATHER
// ═══════════════════════════════════════════════════════════════════════════════
function WeatherBadge() {
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=41.55&longitude=-8.43&current=temperature_2m,weathercode&timezone=Europe/Lisbon")
      .then(r => r.json()).then(data => {
        const temp = Math.round(data.current?.temperature_2m ?? 0);
        const code = data.current?.weathercode ?? 0;
        const desc: Record<number, string> = {
          0:"Limpo", 1:"Quase limpo", 2:"Parcialmente nublado", 3:"Nublado",
          45:"Nevoeiro", 61:"Chuva fraca", 63:"Chuva", 80:"Aguaceiros", 95:"Trovoada"
        };
        setW({ temp, description: desc[code] ?? "Variavel" });
      }).catch(() => null);
  }, []);
  return (
    <div className="weather-badge">
      <CloudSun size={26} />
      <div><strong>{w ? `${w.temp}C` : "--C"}</strong><span>{w?.description ?? "..."}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLAR ROOM PAGE — Drag & Drop + SVG linhas dinâmicas
// ═══════════════════════════════════════════════════════════════════════════════

const SOLAR_CARDS_KEY = "casalume_solar_card_positions";

type SolarCardId = "grid" | "inverter" | "battery" | "panels" | "house" | "totals";

type CardPct = { x: number; y: number };

const DEFAULT_POSITIONS: Record<SolarCardId, CardPct> = {
  grid:     { x:  2, y: 30 },
  inverter: { x: 30, y: 33 },
  battery:  { x: 52, y: 25 },
  panels:   { x: 76, y:  4 },
  house:    { x: 76, y: 58 },
  totals:   { x:  2, y: 60 },
};

// Fluxo entre nós — índices são IDs de cartões
type FlowEdge = {
  id: string;
  from: SolarCardId;
  to: SolarCardId;
  color: string;
  active: boolean;
};

// SVG de linhas dinâmicas — usa posições em %
function SolarFlowSVG({
  edges,
  positions,
  refs,
  containerRef,
}: {
  edges: FlowEdge[];
  positions: Record<SolarCardId, CardPct>;
  refs: Record<SolarCardId, React.RefObject<HTMLDivElement | null>>;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [lines, setLines] = React.useState<Array<{ id: string; x1:number; y1:number; x2:number; y2:number; color:string }>>([]);

  // Recalcular centros dos cartões a partir dos elementos reais
  React.useEffect(() => {
    function calc() {
      const container = containerRef.current;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const next = edges
        .filter(e => e.active)
        .map(e => {
          const fromEl = refs[e.from]?.current;
          const toEl   = refs[e.to]?.current;
          if (!fromEl || !toEl) return null;
          const fr = fromEl.getBoundingClientRect();
          const tr = toEl.getBoundingClientRect();
          const x1 = ((fr.left + fr.width  / 2) - cr.left) / cr.width  * 100;
          const y1 = ((fr.top  + fr.height / 2) - cr.top)  / cr.height * 100;
          const x2 = ((tr.left + tr.width  / 2) - cr.left) / cr.width  * 100;
          const y2 = ((tr.top  + tr.height / 2) - cr.top)  / cr.height * 100;
          return { id: e.id, x1, y1, x2, y2, color: e.color };
        })
        .filter(Boolean) as typeof lines;
      setLines(next);
    }
    calc();
    const id = setInterval(calc, 200);
    return () => clearInterval(id);
  }, [edges, positions]);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:1 }}>
      <defs>
        {lines.map(l => (
          <marker key={`m-${l.id}`} id={`a-${l.id}`} markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
            <path d="M0,0 L0,3 L3,1.5 z" fill={l.color} opacity="0.85"/>
          </marker>
        ))}
      </defs>
      {lines.map(l => {
        const mx = (l.x1 + l.x2) / 2;
        const my = (l.y1 + l.y2) / 2 - 6;
        const d  = `M${l.x1},${l.y1} Q${mx},${my} ${l.x2},${l.y2}`;
        return (
          <g key={l.id}>
            <path d={d} fill="none" stroke={l.color} strokeWidth="0.35" strokeOpacity="0.2" strokeDasharray="1.2 1.2"/>
            <path d={d} fill="none" stroke={l.color} strokeWidth="0.6" strokeOpacity="0.85"
              strokeDasharray="2 2.5" strokeLinecap="round"
              markerEnd={`url(#a-${l.id})`}
              style={{ animation:"flow-dash-fwd 1.4s linear infinite" }}/>
          </g>
        );
      })}
    </svg>
  );
}

// Cartão solar arrastável
function SolarFlowCard({
  id, icon, title, value, sub, color, dot, editing,
  position, onDragEnd, cardRef,
}: {
  id: SolarCardId; icon: string; title: string; value: string;
  sub?: string; color: string; dot?: "green"|"yellow"|"red"|"grey";
  editing: boolean; position: CardPct;
  onDragEnd: (id: SolarCardId, x: number, y: number) => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dotColors = { green:"#22c55e", yellow:"#f59e0b", red:"#ef4444", grey:"#6b7280" };
  const dragging = React.useRef(false);
  const startPos = React.useRef({ mx:0, my:0, cx:0, cy:0 });
  const containerRef = React.useRef<HTMLElement | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if (!editing) return;
    e.preventDefault();
    dragging.current = true;
    const el = cardRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    containerRef.current = parent;
    const pr = parent.getBoundingClientRect();
    startPos.current = {
      mx: e.clientX, my: e.clientY,
      cx: position.x, cy: position.y,
    };

    function onMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const pr2 = containerRef.current.getBoundingClientRect();
      const dx = ((ev.clientX - startPos.current.mx) / pr2.width)  * 100;
      const dy = ((ev.clientY - startPos.current.my) / pr2.height) * 100;
      const nx = Math.max(0, Math.min(88, startPos.current.cx + dx));
      const ny = Math.max(0, Math.min(85, startPos.current.cy + dy));
      if (cardRef.current) {
        cardRef.current.style.left = `${nx}%`;
        cardRef.current.style.top  = `${ny}%`;
      }
    }
    function onUp(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      dragging.current = false;
      const pr2 = containerRef.current.getBoundingClientRect();
      const dx = ((ev.clientX - startPos.current.mx) / pr2.width)  * 100;
      const dy = ((ev.clientY - startPos.current.my) / pr2.height) * 100;
      const nx = Math.max(0, Math.min(88, startPos.current.cx + dx));
      const ny = Math.max(0, Math.min(85, startPos.current.cy + dy));
      onDragEnd(id, nx, ny);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }

  return (
    <div
      ref={cardRef}
      className={`sflow-card ${editing ? "sflow-card-editing" : ""}`}
      style={{ left:`${position.x}%`, top:`${position.y}%`, position:"absolute", zIndex:2,
               cursor: editing ? "grab" : "default" }}
      onMouseDown={onMouseDown}
    >
      {editing && <div className="sflow-drag-handle">⠿ mover</div>}
      <div className="sflow-card-header">
        <span className="sflow-card-icon">{icon}</span>
        <span className="sflow-card-title">{title}</span>
        {dot && <span className="sflow-dot" style={{ background: dotColors[dot] }}/>}
      </div>
      <div className="sflow-card-value" style={{ color }}>{value}</div>
      {sub && <div className="sflow-card-sub">{sub}</div>}
    </div>
  );
}

function SolarRoomPage({ solar, onBack }: { solar: SolarState | null; onBack: () => void }) {
  const s = solar;
  const age = s ? Math.floor((Date.now() - new Date(s.lastUpdated).getTime()) / 1000) : 0;
  const socColor = !s ? "#9ca3af" : s.batterySOC > 60 ? "#22c55e" : s.batterySOC > 25 ? "#f59e0b" : "#ef4444";

  const [editing, setEditing] = React.useState(false);
  const [positions, setPositions] = React.useState<Record<SolarCardId, CardPct>>(() => {
    try {
      const saved = localStorage.getItem(SOLAR_CARDS_KEY);
      return saved ? { ...DEFAULT_POSITIONS, ...JSON.parse(saved) } : DEFAULT_POSITIONS;
    } catch { return DEFAULT_POSITIONS; }
  });

  const containerRef = React.useRef<HTMLElement | null>(null);
  const refs: Record<SolarCardId, React.RefObject<HTMLDivElement | null>> = {
    grid:     React.useRef(null),
    inverter: React.useRef(null),
    battery:  React.useRef(null),
    panels:   React.useRef(null),
    house:    React.useRef(null),
    totals:   React.useRef(null),
  };

  function handleDragEnd(id: SolarCardId, x: number, y: number) {
    setPositions(prev => {
      const next = { ...prev, [id]: { x, y } };
      localStorage.setItem(SOLAR_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetPositions() {
    localStorage.removeItem(SOLAR_CARDS_KEY);
    setPositions(DEFAULT_POSITIONS);
  }

  const edges: FlowEdge[] = !s ? [] : [
    { id:"pv-inv",   from:"panels",   to:"inverter", color:"#fbbf24", active: s.pvProducing },
    { id:"grid-inv", from:"grid",     to:"inverter", color:"#f87171", active: s.gridImporting },
    { id:"inv-grid", from:"inverter", to:"grid",     color:"#4ade80", active: s.gridExporting },
    { id:"inv-bat",  from:"inverter", to:"battery",  color:"#4ade80", active: s.batteryCharging },
    { id:"bat-inv",  from:"battery",  to:"inverter", color:"#fbbf24", active: s.batteryDischarging },
    { id:"inv-home", from:"inverter", to:"house",    color:"#818cf8", active: s.loadPower > 10 },
  ];

  return (
    <div style={{ maxWidth:1540, margin:"0 auto", padding:"0 44px 70px" }}>
      <section
        className="division-card"
        style={{ height:700 }}
        ref={el => { containerRef.current = el; }}
      >
        <img src="/images/solar-garage.png" alt="Sistema Solar"
          style={{ filter:"brightness(0.68) saturate(1.1)" }}/>

        {s && (
          <SolarFlowSVG
            edges={edges}
            positions={positions}
            refs={refs}
            containerRef={containerRef}
          />
        )}

        <div className="card-canvas">

          {/* Controlos sobrepostos na imagem — topo */}
          <div className="overlay-controls">
            <button className="overlay-back" onClick={onBack}>
              <ArrowLeft size={16}/> Casa
            </button>
            <div className="overlay-center">
              {s && (
                <div className="overlay-mode" style={{
                  color: s.deviceMode==="Grid"||s.deviceMode==="Line" ? "#f87171" : "#4ade80",
                  borderColor: s.deviceMode==="Grid"||s.deviceMode==="Line" ? "rgba(239,68,68,0.4)" : "rgba(74,222,128,0.4)"
                }}>
                  <Zap size={12}/>
                  {({"Grid":"Rede","Line":"Rede","Solar/Battery":"Solar + Bat","Solar":"Solar","Battery":"Bateria"}[s.deviceMode] ?? s.deviceMode)}
                </div>
              )}
              {s && s.alerts.map((a,i) => (
                <div key={i} className={`overlay-alert overlay-alert-${a.level}`}>{a.msg}</div>
              ))}
            </div>
            <div className="overlay-right">
              {s && <span className="overlay-time">{age < 10 ? "Agora" : `${age}s`}<span className="solar-source-dot" style={{ marginLeft:4 }}/></span>}
              {editing ? (
                <>
                  <button className="overlay-btn overlay-btn-primary" onClick={() => setEditing(false)}>
                    <Settings size={13}/> Guardar
                  </button>
                  <button className="overlay-btn" onClick={resetPositions}>Repor</button>
                </>
              ) : (
                <button className="overlay-btn" onClick={() => setEditing(true)}>
                  <Settings size={13}/> Editar
                </button>
              )}
            </div>
          </div>

          {editing && (
            <div className="overlay-edit-hint">
              Arrasta os cartões · As linhas acompanham automaticamente
            </div>
          )}

          {!s && <div className="empty-device">A aguardar dados do Solar Assistant...</div>}

          {s && (<>
            <SolarFlowCard id="grid" icon="⚡" title="Rede"
              value={s.gridImporting ? `${(s.gridPower/1000).toFixed(1)} kW` : s.gridExporting ? `-${(Math.abs(s.gridPower)/1000).toFixed(1)} kW` : "0 W"}
              sub={s.gridImporting ? `da rede · ${s.gridVoltage}V` : s.gridExporting ? `para a rede · ${s.gridVoltage}V` : `${s.gridVoltage}V · sem uso`}
              color={s.gridImporting ? "#f87171" : s.gridExporting ? "#4ade80" : "#9ca3af"}
              dot={s.gridImporting ? "red" : s.gridExporting ? "green" : "grey"}
              editing={editing} position={positions.grid}
              onDragEnd={handleDragEnd} cardRef={refs.grid}/>

            <SolarFlowCard id="inverter" icon="⚡" title="Inversor"
              value={`${s.loadPower} W`}
              sub={`${({"Grid":"Rede","Solar/Battery":"Solar+Bat","Solar":"Solar","Battery":"Bateria","Line":"Rede"}[s.deviceMode]??s.deviceMode)} · ${s.temperature}C · ${s.acOutputVoltage}V`}
              color="#a5b4fc"
              dot={s.deviceMode==="Grid"||s.deviceMode==="Line" ? "red" : "green"}
              editing={editing} position={positions.inverter}
              onDragEnd={handleDragEnd} cardRef={refs.inverter}/>

            <SolarFlowCard id="battery" icon={s.batteryCharging?"🔋⬆":s.batteryDischarging?"🔋⬇":"🔋"} title="Bateria"
              value={`${s.batterySOC}%`}
              sub={s.batteryCharging ? `a carregar · ${(s.batteryPower/1000).toFixed(2)} kW · ${s.batteryVoltage}V` :
                   s.batteryDischarging ? `a descarregar · ${(Math.abs(s.batteryPower)/1000).toFixed(2)} kW · ${s.batteryVoltage}V` :
                   `${s.batteryVoltage}V · ${s.batteryTemperature}C · repouso`}
              color={socColor}
              dot={s.batteryCharging?"green":s.batteryDischarging?"yellow":"grey"}
              editing={editing} position={positions.battery}
              onDragEnd={handleDragEnd} cardRef={refs.battery}/>

            <SolarFlowCard id="panels" icon="☀️" title="Paineis"
              value={`${s.pvPower} W`}
              sub={`S1:${s.pvVoltage1}V·${s.pvPower1}W  S2:${s.pvVoltage2}V·${s.pvPower2}W`}
              color={s.pvProducing?"#fbbf24":"#9ca3af"}
              dot={s.pvProducing?"yellow":"grey"}
              editing={editing} position={positions.panels}
              onDragEnd={handleDragEnd} cardRef={refs.panels}/>

            <SolarFlowCard id="house" icon="🏠" title="Casa"
              value={`${s.loadPower} W`}
              sub="consumo instantaneo"
              color="#818cf8" dot="green"
              editing={editing} position={positions.house}
              onDragEnd={handleDragEnd} cardRef={refs.house}/>

            {/* Totais — cartão especial arrastável */}
            <div
              ref={refs.totals}
              className={`sflow-totals-card ${editing ? "sflow-card-editing" : ""}`}
              style={{ left:`${positions.totals.x}%`, top:`${positions.totals.y}%`,
                       position:"absolute", zIndex:2, cursor: editing?"grab":"default",
                       maxWidth:320 }}
              onMouseDown={e => {
                if (!editing) return;
                e.preventDefault();
                const el = refs.totals.current;
                const parent = el?.parentElement;
                if (!el || !parent) return;
                const pr = parent.getBoundingClientRect();
                const startX = positions.totals.x, startY = positions.totals.y;
                const startMx = e.clientX, startMy = e.clientY;
                function mv(ev: MouseEvent) {
                  const pr2 = parent!.getBoundingClientRect();
                  const nx = Math.max(0, Math.min(88, startX + ((ev.clientX-startMx)/pr2.width)*100));
                  const ny = Math.max(0, Math.min(85, startY + ((ev.clientY-startMy)/pr2.height)*100));
                  if (el) { el.style.left=`${nx}%`; el.style.top=`${ny}%`; }
                }
                function up(ev: MouseEvent) {
                  const pr2 = parent!.getBoundingClientRect();
                  const nx = Math.max(0, Math.min(88, startX + ((ev.clientX-startMx)/pr2.width)*100));
                  const ny = Math.max(0, Math.min(85, startY + ((ev.clientY-startMy)/pr2.height)*100));
                  handleDragEnd("totals", nx, ny);
                  window.removeEventListener("mousemove", mv);
                  window.removeEventListener("mouseup", up);
                }
                window.addEventListener("mousemove", mv);
                window.addEventListener("mouseup", up);
              }}
            >
              {editing && <div className="sflow-drag-handle">⠿ mover</div>}
              <div className="sflow-totals-title">
                <span style={{ color:"#4ade80" }}>{({"Solar first":"Solar primeiro","Solar/Battery/Utility":"Solar / Bat / Rede","Utility first":"Rede primeiro","Solar only":"Apenas solar","SBU":"Solar / Bat / Rede"}[s.outputSourcePriority]??s.outputSourcePriority)}</span>
                <br/>
                <span style={{ fontSize:"0.72rem", fontWeight:400, color:"rgba(255,255,255,0.4)" }}>{({"Solar and utility simultaneously":"Carrega: solar e rede","Solar only":"Carrega: apenas solar","Utility only":"Carrega: apenas rede"}[s.chargerSourcePriority]??s.chargerSourcePriority)}</span>
              </div>
              <div className="sflow-totals-grid">
                <div><span>Solar hoje</span><strong>{s.totalPvEnergy} kWh</strong></div>
                <div><span>Rede hoje</span><strong>{s.totalGridEnergyIn} kWh</strong></div>
                <div><span>Bat carregou</span><strong>{s.totalBatteryEnergyIn} kWh</strong></div>
                <div><span>Bat descarregou</span><strong>{s.totalBatteryEnergyOut} kWh</strong></div>
                <div><span>Consumo total</span><strong>{s.totalLoadEnergy} kWh</strong></div>
                <div><span>Exportou</span><strong>{s.totalGridEnergyOut} kWh</strong></div>
              </div>
            </div>

          </>)}
        </div>
      </section>

      {/* Painel de integrações */}
      {editing && (
        <div className="solar-integrations-panel">
          <div className="sip-header">
            <Zap size={18}/>
            <div>
              <h2 style={{ margin:0, fontSize:"1.4rem" }}>Integracoes Solar</h2>
              <p style={{ margin:"4px 0 0", color:"#71817b", fontSize:"0.88rem" }}>
                Escolhe a fonte de dados. Podes ter varias ativas em simultaneo.
              </p>
            </div>
          </div>
          <div className="sip-grid">
            <div className="sip-card sip-card-active">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)" }}>☀️</div>
                <div><div className="sip-brand-name">Solar Assistant</div><div className="sip-brand-sub">Via MQTT local</div></div>
                <div className="sip-status sip-status-active">● Ativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-field-row">
                  <div className="sip-field"><label>PV</label><input readOnly value={`${solar?.pvPower ?? 0} W`} className="sip-input sip-input-readonly sip-input-live"/></div>
                  <div className="sip-field"><label>Bateria</label><input readOnly value={`${solar?.batterySOC ?? 0}%`} className="sip-input sip-input-readonly sip-input-live"/></div>
                  <div className="sip-field"><label>Carga</label><input readOnly value={`${solar?.loadPower ?? 0} W`} className="sip-input sip-input-readonly sip-input-live"/></div>
                </div>
                <div className="sip-field"><label>Broker MQTT</label><input readOnly value="192.168.50.211:1883" className="sip-input sip-input-readonly"/></div>
                <div className="sip-field"><label>Topic prefix</label><input readOnly value="solar_assistant" className="sip-input sip-input-readonly"/></div>
                <div className="sip-info">Ligado ao Solar Assistant. Suporta Easun, Growatt, Deye, Voltronic, SRNE e outros.</div>
              </div>
            </div>
            <div className="sip-card">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#f97316,#ea580c)" }}>⚡</div>
                <div><div className="sip-brand-name">DessMonitor / Easun</div><div className="sip-brand-sub">API cloud SmartESS</div></div>
                <div className="sip-status sip-status-inactive">○ Inativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-info sip-info-warn">Requer conta dessmonitor.com. Compativel com Easun, PowMr, MPP Solar, MUST Power.</div>
                <div className="sip-field"><label>Email</label><input placeholder="email@exemplo.com" className="sip-input"/></div>
                <div className="sip-field"><label>Password</label><input type="password" placeholder="••••••••" className="sip-input"/></div>
                <div className="sip-field-row"><button className="sip-btn sip-btn-primary">Ligar conta</button><a href="https://www.dessmonitor.com" target="_blank" rel="noreferrer" className="sip-btn sip-btn-ghost">dessmonitor.com ↗</a></div>
              </div>
            </div>
            <div className="sip-card">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#16a34a,#15803d)" }}>🌱</div>
                <div><div className="sip-brand-name">Growatt</div><div className="sip-brand-sub">API cloud ShinePhone</div></div>
                <div className="sip-status sip-status-inactive">○ Inativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-info sip-info-warn">Compativel com SPF, SPH, MIN, MID, MAC e outras series Growatt.</div>
                <div className="sip-field"><label>Username</label><input placeholder="Username ShinePhone" className="sip-input"/></div>
                <div className="sip-field"><label>Password</label><input type="password" placeholder="••••••••" className="sip-input"/></div>
                <div className="sip-field-row"><button className="sip-btn sip-btn-primary">Ligar conta</button><a href="https://server.growatt.com" target="_blank" rel="noreferrer" className="sip-btn sip-btn-ghost">growatt.com ↗</a></div>
              </div>
            </div>
            <div className="sip-card">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#0ea5e9,#0284c7)" }}>☁️</div>
                <div><div className="sip-brand-name">Deye / SolarmanPV</div><div className="sip-brand-sub">API cloud SolarmanPV</div></div>
                <div className="sip-status sip-status-inactive">○ Inativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-info sip-info-warn">Compativel com Deye, Sunsynk, SolaX na plataforma SolarmanPV.</div>
                <div className="sip-field"><label>App ID</label><input placeholder="App ID SolarmanPV" className="sip-input"/></div>
                <div className="sip-field"><label>Email</label><input placeholder="email@exemplo.com" className="sip-input"/></div>
                <div className="sip-field"><label>Password</label><input type="password" placeholder="••••••••" className="sip-input"/></div>
                <div className="sip-field-row"><button className="sip-btn sip-btn-primary">Ligar conta</button><a href="https://home.solarmanpv.com" target="_blank" rel="noreferrer" className="sip-btn sip-btn-ghost">solarmanpv.com ↗</a></div>
              </div>
            </div>
            <div className="sip-card">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#8b5cf6,#7c3aed)" }}>📡</div>
                <div><div className="sip-brand-name">MQTT Generico</div><div className="sip-brand-sub">Qualquer broker MQTT</div></div>
                <div className="sip-status sip-status-inactive">○ Inativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-info">Para Tasmota, Shelly MQTT, Home Assistant, Node-RED, etc.</div>
                <div className="sip-field"><label>Host</label><input placeholder="192.168.1.100" className="sip-input"/></div>
                <div className="sip-field-row">
                  <div className="sip-field"><label>Porta</label><input placeholder="1883" className="sip-input"/></div>
                  <div className="sip-field"><label>Prefix</label><input placeholder="solar/" className="sip-input"/></div>
                </div>
                <div className="sip-field-row"><button className="sip-btn sip-btn-primary">Ligar</button><button className="sip-btn sip-btn-ghost">Testar</button></div>
              </div>
            </div>
            <div className="sip-card">
              <div className="sip-card-header">
                <div className="sip-brand-icon" style={{ background:"linear-gradient(135deg,#dc2626,#b91c1c)" }}>🇦🇹</div>
                <div><div className="sip-brand-name">Fronius</div><div className="sip-brand-sub">API local Solar.web</div></div>
                <div className="sip-status sip-status-inactive">○ Inativo</div>
              </div>
              <div className="sip-card-body">
                <div className="sip-info">Acesso local via API REST Fronius Datamanager. Sem internet.</div>
                <div className="sip-field"><label>IP Datamanager</label><input placeholder="192.168.1.200" className="sip-input"/></div>
                <div className="sip-field-row"><button className="sip-btn sip-btn-primary">Ligar</button><button className="sip-btn sip-btn-ghost">Testar</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLAR DASHBOARD (tab ⚡)
// ═══════════════════════════════════════════════════════════════════════════════
function FlowArrow({ active, direction, color }: { active:boolean; direction:"down"|"up"|"left"|"right"; color:string }) {
  if (!active) return <div className="flow-arrow flow-inactive" />;
  return <div className={`flow-arrow flow-${direction} flow-active`} style={{ "--flow-color": color } as React.CSSProperties} />;
}

function SolarDashboard({ state }: { state: SolarState }) {
  const s = state;
  const socColor = s.batterySOC > 60 ? "#22c55e" : s.batterySOC > 25 ? "#f59e0b" : "#ef4444";
  const age = Math.floor((Date.now() - new Date(s.lastUpdated).getTime()) / 1000);
  return (
    <div className="solar-panel">
      <div className="solar-header">
        <div><div className="brand-small">CasaLume</div><h1>Solar.</h1></div>
        <div className="solar-mode-badge"><Zap size={16}/> {s.deviceMode}</div>
        <div className="solar-updated">{age < 10 ? "Agora" : `${age}s atras`}<span className="solar-source-dot"/></div>
      </div>
      {s.alerts.length > 0 && (
        <div className="solar-alerts">
          {s.alerts.map((a,i) => <div key={i} className={`solar-alert solar-alert-${a.level}`}>{a.msg}</div>)}
        </div>
      )}
      <div className="solar-flow-grid">
        <div className="solar-node solar-node-pv">
          <div className="solar-node-icon">☀️</div>
          <div className="solar-node-title">Paineis Solares</div>
          <div className={`solar-node-value ${s.pvProducing ? "value-active" : "value-idle"}`}>{W(s.pvPower)}</div>
          <div className="solar-node-detail">
            <span>S1: {s.pvVoltage1}V · {s.pvPower1}W</span>
            <span>S2: {s.pvVoltage2}V · {s.pvPower2}W</span>
          </div>
        </div>
        <div className="solar-arrow-col"><FlowArrow active={s.pvProducing} direction="down" color="#f59e0b"/></div>
        <div className="solar-node solar-node-grid">
          <div className="solar-node-icon">{s.gridImporting?"🔌":s.gridExporting?"📤":"🔌"}</div>
          <div className="solar-node-title">Rede Eletrica</div>
          <div className={`solar-node-value ${s.gridImporting?"value-danger":s.gridExporting?"value-export":"value-idle"}`}>
            {s.gridImporting?`+${W(s.gridPower)}`:s.gridExporting?`-${W(s.gridPower)}`:"0 W"}
          </div>
          <div className="solar-node-detail">
            <span>{s.gridVoltage}V · {s.gridFrequency}Hz</span>
            <span>Entrada: {s.totalGridEnergyIn} kWh</span>
          </div>
        </div>
        <div className="solar-arrow-col"><FlowArrow active={s.gridImporting} direction="down" color="#ef4444"/></div>
        <div className="solar-node solar-node-inverter">
          <div className="solar-node-icon">⚡</div>
          <div className="solar-node-title">Inversor</div>
          <div className="solar-node-value value-active">{s.temperature}°C</div>
          <div className="solar-node-detail">
            <span>{s.acOutputVoltage}V · {s.acOutputFrequency}Hz</span>
            <span>{s.outputSourcePriority}</span>
          </div>
        </div>
        <div className="solar-arrow-col"><FlowArrow active={s.loadPower>10} direction="down" color="#6366f1"/></div>
        <div className="solar-node solar-node-load">
          <div className="solar-node-icon">🏠</div>
          <div className="solar-node-title">Consumo Casa</div>
          <div className="solar-node-value value-load">{W(s.loadPower)}</div>
          <div className="solar-node-detail">
            <span>{s.loadPercentage}% capacidade</span>
            <span>Total: {s.totalLoadEnergy} kWh</span>
          </div>
        </div>
        <div className="solar-arrow-row">
          <FlowArrow active={s.batteryCharging}    direction="right" color="#22c55e"/>
          <FlowArrow active={s.batteryDischarging} direction="left"  color="#f59e0b"/>
        </div>
        <div className="solar-node solar-node-battery">
          <div className="solar-node-icon">🔋</div>
          <div className="solar-node-title">Bateria</div>
          <div className="battery-bar-wrap">
            <div className="battery-bar-track">
              <div className="battery-bar-fill" style={{ width:`${s.batterySOC}%`, background:socColor }}/>
            </div>
            <span className="battery-soc-label" style={{ color:socColor }}>{s.batterySOC}%</span>
          </div>
          <div className={`solar-node-value ${s.batteryDischarging?"value-danger":s.batteryCharging?"value-active":"value-idle"}`}>
            {s.batteryDischarging?`-${W(s.batteryPower)}`:s.batteryCharging?`+${W(s.batteryPower)}`:"Repouso"}
          </div>
          <div className="solar-node-detail">
            <span>{s.batteryVoltage}V · {s.batteryCurrent}A · {s.batteryTemperature}°C</span>
            <span>Saude: {s.batteryHealth}% · Ciclos: {s.batteryCycles}</span>
            <span>Celulas avg {s.cellVoltageAvg}V</span>
          </div>
        </div>
      </div>
      <div className="solar-totals">
        {[
          ["PV hoje",         `${s.totalPvEnergy} kWh`],
          ["Bat. carregou",   `${s.totalBatteryEnergyIn} kWh`],
          ["Bat. descarregou",`${s.totalBatteryEnergyOut} kWh`],
          ["Rede importou",   `${s.totalGridEnergyIn} kWh`],
          ["Consumo total",   `${s.totalLoadEnergy} kWh`],
          ["Exportou rede",   `${s.totalGridEnergyOut} kWh`],
        ].map(([label, val]) => (
          <div key={label} className="solar-total-card">
            <span className="solar-total-label">{label}</span>
            <span className="solar-total-value">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [rooms, setRooms]             = useState<Room[]>([]);
  const [devices, setDevices]         = useState<Device[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [activeTab, setActiveTab]     = useState<"home"|"devices"|"solar">("home");
  const [message, setMessage]         = useState("Sistema pronto.");
  const [loading, setLoading]         = useState(false);
  const [positions, setPositions]     = useState<Record<string, CardPos>>({});
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [modal, setModal]             = useState<ModalState>({ kind: "none" });
  const [solar, setSolar]             = useState<SolarState | null>(null);
  const { msg: toastMsg, show: showToast } = useToast();

  const selectedRoom    = useMemo(() => rooms.find(r => r.id === selectedRoomId) ?? null, [rooms, selectedRoomId]);
  const allDevices      = useMemo(() => devices.filter(d => !hiddenCards.includes(d.deviceId)), [devices, hiddenCards]);
  const selectedDevices = useMemo(() => {
    if (!selectedRoom) return [];
    return allDevices.filter(d => d.roomId === selectedRoom.id);
  }, [allDevices, selectedRoom]);

  async function loadData(runDiscovery = false) {
    setLoading(true);
    try {
      if (runDiscovery) { setMessage("A procurar..."); await fetch("/api/discovery"); }
      const [rr, dr] = await Promise.all([fetch("/api/rooms"), fetch("/api/devices")]);
      const rd: Room[]   = await rr.json();
      const dd: Device[] = await dr.json();
      setRooms(rd); setDevices(dd);
      const pos: Record<string, CardPos> = {};
      const hid: string[] = [];
      for (const d of dd) {
        if (typeof d.cardX === "number" && typeof d.cardY === "number") pos[d.deviceId] = { x: d.cardX, y: d.cardY };
        if (Number(d.hidden ?? 0) === 1) hid.push(d.deviceId);
      }
      setPositions(pos); setHiddenCards(hid);
      setMessage(runDiscovery ? `Concluido: ${dd.length} dispositivos.` : "Sistema pronto.");
    } catch { setMessage("Erro na API."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    async function fetchSolar() {
      try { const r = await fetch("/api/solar/state"); setSolar(await r.json()); } catch { /* silêncio */ }
    }
    fetchSolar();
    const id = setInterval(fetchSolar, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { loadData(false); }, []);

  async function handleRename(d: Device, name: string) {
    await apiPatch(`/api/devices/${encodeURIComponent(d.deviceId)}/name`, { name });
    showToast(`"${name}" guardado.`); await loadData(false);
  }
  async function handleAddVirtual(name: string, type: string, roomId: number | null) {
    await apiPost("/api/devices/manual", { name, type, roomId });
    showToast(`"${name}" criado.`); await loadData(false);
  }
  async function handleAddState(d: Device, label: string) {
    await apiPost(`/api/devices/${encodeURIComponent(d.deviceId)}/states`, { label });
    showToast(`Estado "${label}" adicionado.`); await loadData(false);
  }
  async function handleAssign(d: Device, roomId: number | null) {
    await apiPatch(`/api/devices/${encodeURIComponent(d.deviceId)}/room`, { roomId }); await loadData(false);
  }
  async function handleControl(d: Device, action: "turnOn"|"turnOff"|"toggle") {
    await apiPost(`/api/devices/${encodeURIComponent(d.deviceId)}/control`, { action });
    showToast(`${d.name}: comando enviado.`); await loadData(false);
  }
  async function handleHide(d: Device) {
    await apiPatch(`/api/devices/${encodeURIComponent(d.deviceId)}/hidden`, { hidden: true });
    showToast(`"${d.name}" ocultado.`); await loadData(false);
  }
  async function handleRestoreHidden() {
    await apiPost("/api/devices/restore-hidden"); showToast("Restaurados."); await loadData(false);
  }
  function handleDragEnd(e: React.DragEvent<HTMLElement>, d: Device) {
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const x = Math.max(2, Math.min(78, ((e.clientX - rect.left) / rect.width)  * 100));
    const y = Math.max(2, Math.min(78, ((e.clientY - rect.top)  / rect.height) * 100));
    setPositions(p => ({ ...p, [d.deviceId]: { x, y } }));
    apiPatch(`/api/devices/${encodeURIComponent(d.deviceId)}/position`, { x, y }).then(() => loadData(false)).catch(() => null);
  }

  const sala      = findRoom(rooms, "sala");
  const cozinha   = findRoom(rooms, "cozinha");
  const quarto    = findRoom(rooms, "quarto");
  const banho     = findRoom(rooms, "banho");
  const solarRoom = findRoom(rooms, "solar");

  // Divisão solar → usa RoomPage especializada
  if (selectedRoom && isSolar(selectedRoom)) {
    return (
      <>
        <Modal state={modal} rooms={rooms} onClose={() => setModal({ kind:"none" })}
          onRename={handleRename} onAddVirtual={handleAddVirtual} onAddState={handleAddState}/>
        <Toast msg={toastMsg}/>
        <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab}
          onHome={() => { setSelectedRoomId(null); setActiveTab("home"); }} onScan={() => loadData(true)}>
          <SolarRoomPage solar={solar} onBack={() => setSelectedRoomId(null)}/>
        </DashboardShell>
      </>
    );
  }

  return (
    <>
      <Modal state={modal} rooms={rooms} onClose={() => setModal({ kind:"none" })}
        onRename={handleRename} onAddVirtual={handleAddVirtual} onAddState={handleAddState}/>
      <Toast msg={toastMsg}/>

      {selectedRoom ? (
        <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab}
          onHome={() => { setSelectedRoomId(null); setActiveTab("home"); }} onScan={() => loadData(true)}>
          <RoomPage room={selectedRoom} devices={selectedDevices} allDevices={allDevices} rooms={rooms} positions={positions}
            onBack={() => setSelectedRoomId(null)} onControl={handleControl}
            onRename={d => setModal({ kind:"rename", device:d })}
            onAssign={handleAssign}
            onDragEnd={async (deviceId, x, y) => {
              await apiPatch(`/api/devices/${encodeURIComponent(deviceId)}/position`, { x, y });
              await loadData(false);
            }}
            onHide={handleHide}
            onAddState={d => setModal({ kind:"addState", device:d })}
            onAddManual={() => setModal({ kind:"addVirtual", roomId:selectedRoom.id })}
            onRestoreDevice={async (d) => {
              await apiPatch(`/api/devices/${encodeURIComponent(d.deviceId)}/room`, { roomId: selectedRoom.id });
              await loadData(false);
            }}/>
        </DashboardShell>
      ) : (
        <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab}
          onHome={() => { setSelectedRoomId(null); setActiveTab("home"); }} onScan={() => loadData(true)}>

          {activeTab === "home" && (
            <main className="content">

              {loading && <div className="status-line">A procurar dispositivos...</div>}
              <section className="house-card">
                <img src="/images/casalume-house-premium.png" alt="CasaLume"/>
                <WeatherBadge/>
                {solarRoom && <RoomBadge className="pin-solar"   label="Sistema Solar"  count={deviceCount(allDevices,solarRoom)} onClick={() => setSelectedRoomId(solarRoom.id)}/>}
                {quarto    && <RoomBadge className="pin-quarto"  label="Quarto"         count={deviceCount(allDevices,quarto)}    onClick={() => setSelectedRoomId(quarto.id)}/>}
                {banho     && <RoomBadge className="pin-banho"   label="Casa de banho"  count={deviceCount(allDevices,banho)}     onClick={() => setSelectedRoomId(banho.id)}/>}
                {cozinha   && <RoomBadge className="pin-cozinha" label="Cozinha"        count={deviceCount(allDevices,cozinha)}   onClick={() => setSelectedRoomId(cozinha.id)}/>}
                {sala      && <RoomBadge className="pin-sala"    label="Sala"           count={deviceCount(allDevices,sala)}      onClick={() => setSelectedRoomId(sala.id)}/>}
              </section>
            </main>
          )}

          {activeTab === "solar" && (
            solar ? <SolarDashboard state={solar}/> :
            <main className="content"><div className="status-line">A carregar dados solares...</div></main>
          )}

          {activeTab === "devices" && (
            <DeviceCenter devices={devices} rooms={rooms} hiddenCount={hiddenCards.length}
              onScan={() => loadData(true)} onAssign={handleAssign}
              onRename={d => setModal({ kind:"rename", device:d })}
              onAddManual={() => setModal({ kind:"addVirtual", roomId:null })}
              onRestoreHidden={handleRestoreHidden} onHide={handleHide}/>
          )}

        </DashboardShell>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardShell({ children, activeTab, setActiveTab, onHome, onScan }: {
  children: React.ReactNode;
  activeTab: "home"|"devices"|"solar";
  setActiveTab: (t: "home"|"devices"|"solar") => void;
  onHome: () => void; onScan: () => void;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="side-logo" onClick={onHome}><Sun size={24}/></button>
        <button className={`side-icon ${activeTab==="home"    ?"active":""}`} onClick={onHome} title="Casa"><Grid2X2 size={22}/></button>
        <button className={`side-icon ${activeTab==="solar"   ?"active":""}`} onClick={() => setActiveTab("solar")} title="Solar"><Zap size={22}/></button>
        <button className={`side-icon ${activeTab==="devices" ?"active":""}`} onClick={() => setActiveTab("devices")} title="Dispositivos"><LibraryBig size={22}/></button>
        <button className="side-icon" title="Definições"><Settings size={22}/></button>
      </aside>
      <div className="main-wrap">
        {children}
      </div>
    </div>
  );
}

function RoomBadge({ label, count, className, onClick }: { label:string; count:number; className:string; onClick:()=>void }) {
  return (
    <button className={`room-badge ${className}`} onClick={onClick}>
      <span>{label}</span><strong>{count}</strong>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOM PAGE — Enterprise com modo edição profissional
// ═══════════════════════════════════════════════════════════════════════════════
function RoomPage({ room, devices, allDevices, rooms, positions, onBack, onControl,
  onRename, onAssign, onDragEnd, onHide, onAddState, onAddManual, onRestoreDevice }: {
  room: Room; devices: Device[]; allDevices: Device[]; rooms: Room[];
  positions: Record<string, CardPos>;
  onBack: () => void;
  onControl: (d: Device, a: "turnOn"|"turnOff"|"toggle") => void;
  onRename: (d: Device) => void;
  onAssign: (d: Device, roomId: number|null) => void;
  onDragEnd: (deviceId: string, x: number, y: number) => void;
  onHide: (d: Device) => void;
  onAddState: (d: Device) => void;
  onAddManual: () => void;
  onRestoreDevice: (d: Device) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draggingId, setDraggingId] = React.useState<string|null>(null);
  const containerRef = React.useRef<HTMLElement|null>(null);

  // Dispositivos descobertos mas não nesta divisão (para adicionar)
  // Excluir dispositivos do tipo solar_inverter (têm página própria)
  const available = allDevices.filter(d =>
    d.roomId !== room.id &&
    !devices.some(rd => rd.deviceId === d.deviceId) &&
    (d.normalizedType ?? d.type ?? "").toLowerCase() !== "solar_inverter" &&
    d.protocol !== "Solar Assistant MQTT"
  );

  // Drag profissional via mouse events
  function startDrag(e: React.MouseEvent, device: Device) {
    if (!editing) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    setDraggingId(device.deviceId);

    const startMx = e.clientX;
    const startMy = e.clientY;
    const startPos = positions[device.deviceId] ?? { x: 2, y: 4 };
    const captured = container; // capturar referência não-null para os closures

    function onMove(ev: MouseEvent) {
      const cr = captured.getBoundingClientRect();
      const nx = Math.max(0, Math.min(85, startPos.x + ((ev.clientX - startMx) / cr.width)  * 100));
      const ny = Math.max(0, Math.min(85, startPos.y + ((ev.clientY - startMy) / cr.height) * 100));
      const el = captured.querySelector(`[data-device-id="${device.deviceId}"]`) as HTMLElement|null;
      if (el) { el.style.left = `${nx}%`; el.style.top = `${ny}%`; }
    }
    function onUp(ev: MouseEvent) {
      const cr = captured.getBoundingClientRect();
      const nx = Math.max(0, Math.min(85, startPos.x + ((ev.clientX - startMx) / cr.width)  * 100));
      const ny = Math.max(0, Math.min(85, startPos.y + ((ev.clientY - startMy) / cr.height) * 100));
      onDragEnd(device.deviceId, nx, ny);
      setDraggingId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }

  return (
    <main className="content">
      <div className={`room-workspace ${editing ? "room-workspace-editing" : ""}`}>
        {/* Imagem principal com cartões */}
        <section
          className="division-card"
          ref={el => { containerRef.current = el; }}
          style={{ flex:1, height:680 }}
        >
          <img src={roomImage(room)} alt={room.name} style={{ filter: editing ? "brightness(0.55)" : "brightness(0.85)" }}/>

          <div className="card-canvas">

            {/* Controlos sobrepostos na imagem */}
            <div className="overlay-controls">
              <button className="overlay-back" onClick={onBack}>
                <ArrowLeft size={16}/> Casa
              </button>
              <div className="overlay-center">
                <span className="overlay-room-name">{room.name}</span>
              </div>
              <div className="overlay-right">
                {editing ? (
                  <>
                    <button className="overlay-btn overlay-btn-primary" onClick={() => setEditing(false)}>
                      <Settings size={13}/> Guardar
                    </button>
                    <button className="overlay-btn" onClick={onAddManual}>
                      <Plus size={13}/> Novo
                    </button>
                  </>
                ) : (
                  <button className="overlay-btn" onClick={() => setEditing(true)}>
                    <Settings size={13}/> Editar
                  </button>
                )}
              </div>
            </div>

            {editing && (
              <div className="overlay-edit-hint">
                Arrasta os cartões para reposicionar · Painel lateral para adicionar
              </div>
            )}

            {devices.length === 0 && !editing && (
              <div className="empty-device">
                Sem dispositivos. Clica em "Editar" para adicionar.
              </div>
            )}

            {devices.map((d, i) => {
              const col = i % 3;
              const row = Math.floor(i / 3);
              const defaultX = col === 0 ? 2 : col === 1 ? 35 : 68;
              const defaultY = 4 + row * 30;
              const pos = positions[d.deviceId] ?? { x: defaultX, y: defaultY };

              return (
                <article
                  key={d.deviceId}
                  data-device-id={d.deviceId}
                  className={`smart-device-card draggable-card ${draggingId===d.deviceId?"dragging":""} ${editing?"card-edit-mode":""}`}
                  style={{ left:`${pos.x}%`, top:`${pos.y}%`, cursor: editing?"grab":"default" }}
                  onMouseDown={e => startDrag(e, d)}
                >
                  {/* Handle de drag visível em edição */}
                  {editing && (
                    <div className="card-drag-handle">⠿ mover</div>
                  )}

                  <div className="smart-device-head">
                    <div>
                      <strong>{d.name}</strong>
                      <span>{d.brand}{d.model ? ` · ${d.model}` : ""}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                      <small className={d.online?"device-online":"device-offline"}>
                        {d.online?"online":"offline"}
                      </small>
                      {editing && (
                        <button
                          className="card-remove-btn"
                          onClick={e => { e.stopPropagation(); onHide(d); }}
                          title="Remover da divisão"
                        >✕</button>
                      )}
                    </div>
                  </div>

                  {/* Info do dispositivo */}
                  <div className="smart-device-meta">
                    <span className={`type-badge ${typeBadgeClass(d)}`}>{typeLabel(d)}</span>
                    {d.protocol && <span>{d.protocol}</span>}
                    {d.ip && d.ip!=="-" && <span>IP: {d.ip}</span>}
                    {typeof d.power==="number" && d.power > 0 && <span>⚡ {d.power.toFixed(0)} W</span>}
                    {(d.manualStates??[]).map(s => <span key={s}>· {s}</span>)}
                  </div>

                  {/* Ações — só visíveis fora do modo edição */}
                  {!editing && (
                    <div className="smart-device-actions">
                      <button onClick={() => onControl(d,"turnOn")}>Ligar</button>
                      <button onClick={() => onControl(d,"turnOff")}>Desligar</button>
                      <button onClick={() => onRename(d)}><Pencil size={13}/></button>
                      <button onClick={() => onAddState(d)}>+ Estado</button>
                    </div>
                  )}

                  {/* Mover para divisão — só em edição */}
                  {editing && (
                    <select
                      className="room-select-mini"
                      value={d.roomId??""}
                      onChange={e => onAssign(d, e.target.value?Number(e.target.value):null)}
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="">Por atribuir</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                </article>
              );
            })}

            {/* Hint de edição */}
            {editing && (
              <div style={{
                position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)",
                background:"rgba(15,106,87,0.85)", color:"white", borderRadius:8,
                padding:"8px 16px", fontSize:"0.8rem", fontWeight:700, pointerEvents:"none",
                backdropFilter:"blur(8px)"
              }}>
                Arrasta os cartões para reposicionar · Usa o painel lateral para adicionar dispositivos
              </div>
            )}
          </div>
        </section>

        {/* Painel lateral de edição */}
        {editing && (
          <aside className="room-edit-panel">
            <div className="room-edit-panel-title">
              <LibraryBig size={16}/> Dispositivos disponíveis
            </div>
            <p className="room-edit-panel-sub">
              Clica para adicionar à divisão <strong>{room.name}</strong>
            </p>

            {available.length === 0 ? (
              <div className="room-edit-empty">
                Todos os dispositivos descobertos já estão atribuídos.<br/>
                Usa "Novo cartão" para criar um manual.
              </div>
            ) : (
              <div className="room-edit-device-list">
                {available.map(d => (
                  <button
                    key={d.deviceId}
                    className="room-edit-device-item"
                    onClick={() => onRestoreDevice(d)}
                  >
                    <div className="room-edit-device-top">
                      <span className={`type-badge ${typeBadgeClass(d)}`} style={{ fontSize:"0.72rem" }}>{typeLabel(d)}</span>
                      <span className={d.online?"device-online":"device-offline"} style={{ fontSize:"0.72rem", padding:"3px 7px" }}>
                        {d.online?"online":"offline"}
                      </span>
                    </div>
                    <strong>{d.name}</strong>
                    <span>{d.brand}{d.model?` · ${d.model}`:""}</span>
                    {d.protocol && <span style={{ color:"rgba(255,255,255,0.45)", fontSize:"0.75rem" }}>{d.protocol}</span>}
                    <div className="room-edit-device-add">+ Adicionar a {room.name}</div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginTop:16, borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:14 }}>
              <div className="room-edit-panel-title" style={{ marginBottom:8 }}>
                <Settings size={14}/> Gestão
              </div>
              <button className="room-edit-action-btn" onClick={onAddManual}>
                <Plus size={14}/> Criar cartão manual
              </button>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE CENTER
// ═══════════════════════════════════════════════════════════════════════════════
const TYPE_FILTERS = [
  { label:"Todos", value:"" }, { label:"Luz", value:"light" },
  { label:"Tomada", value:"plug" }, { label:"Switch", value:"switch" },
  { label:"Sensor", value:"sensor" }, { label:"Solar", value:"solar" },
  { label:"TV", value:"tv" }, { label:"Clima", value:"climate" },
];
function DeviceCenter({ devices, rooms, hiddenCount, onScan, onAssign, onRename, onAddManual, onRestoreHidden, onHide }: {
  devices:Device[]; rooms:Room[]; hiddenCount:number;
  onScan:()=>void; onAssign:(d:Device,r:number|null)=>void;
  onRename:(d:Device)=>void; onAddManual:()=>void;
  onRestoreHidden:()=>void; onHide:(d:Device)=>void;
}) {
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const filtered = useMemo(() => devices.filter(d => {
    const ms = !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.brand??"").toLowerCase().includes(search.toLowerCase()) || (d.ip??"").includes(search);
    const mt = !typeFilter || (d.normalizedType??d.type??"").toLowerCase().includes(typeFilter);
    return ms && mt;
  }), [devices, search, typeFilter]);
  return (
    <main className="content">
      <div className="page-head">
        <div><div className="brand-small">CasaLume</div><h1>Dispositivos.</h1></div>
        <div className="header-actions">
          <button className="edit-button" onClick={onAddManual}><Plus size={18}/> Adicionar</button>
          <button className="edit-button" onClick={onRestoreHidden}>Restaurar ({hiddenCount})</button>
          <button className="edit-button" onClick={onScan}><RefreshCw size={18}/> Procurar</button>
        </div>
      </div>
      <div className="search-bar">
        <Search size={18}/>
        <input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)}/>
        {search && <button style={{ border:0, background:"none", padding:4 }} onClick={() => setSearch("")}><X size={16}/></button>}
      </div>
      <div className="filter-chips">
        {TYPE_FILTERS.map(f => (
          <button key={f.value} className={`chip ${typeFilter===f.value?"active":""}`} onClick={() => setTypeFilter(f.value)}>{f.label}</button>
        ))}
      </div>
      <div className="device-library">
        {filtered.map(d => (
          <article key={d.deviceId} className="library-card">
            <div className="library-top">
              <div><strong>{d.name}</strong><span>{d.brand} · {d.model}</span></div>
              <small className={d.online?"device-online":"device-offline"}>{d.online?"online":"offline"}</small>
            </div>
            <div className="smart-device-meta">
              <span className={`type-badge ${typeBadgeClass(d)}`}>{typeLabel(d)}</span>
              <span>Protocolo: {d.protocol}</span>
              {d.ip && d.ip!=="-" && <span>IP: {d.ip}</span>}
              <span>Divisao: {d.roomName??"Por atribuir"}</span>
              {typeof d.power==="number" && <span>Potencia: {d.power.toFixed(1)} W</span>}
            </div>
            <div className="library-actions">
              <button onClick={() => onRename(d)}><Pencil size={14}/> Renomear</button>
              <select value={d.roomId??""} onChange={e => onAssign(d, e.target.value?Number(e.target.value):null)}>
                <option value="">Por atribuir</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="danger-button" style={{ background:"rgba(239,68,68,0.12)", color:"#dc2626", border:"1px solid rgba(239,68,68,0.22)" }} onClick={() => onHide(d)}>
                <Trash2 size={14}/> Ocultar
              </button>
            </div>
          </article>
        ))}
        {filtered.length===0 && <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#71817b", padding:"48px 0" }}>Nenhum dispositivo encontrado.</div>}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ═══════════════════════════════════════════════════════════════════════════════
function EditorPanel({ rooms, devices, hiddenCount, onAddManual, onRestoreHidden }: {
  rooms:Room[]; devices:Device[]; hiddenCount:number;
  onAddManual:()=>void; onRestoreHidden:()=>void;
}) {
  const byRoom = useMemo(() => {
    const m = new Map<number|null,Device[]>();
    for (const d of devices) { if (!m.has(d.roomId)) m.set(d.roomId,[]); m.get(d.roomId)!.push(d); }
    return m;
  }, [devices]);
  return (
    <main className="content">
      <div className="page-head">
        <div><div className="brand-small">CasaLume</div><h1>Editor.</h1></div>
        <button className="edit-button" onClick={onAddManual}><Plus size={18}/> Adicionar</button>
      </div>
      <div className="editor-grid">
        <article><h3>Total</h3><p><strong style={{ fontSize:"2rem" }}>{devices.length}</strong> dispositivos.</p></article>
        <article><h3>Por atribuir</h3><p><strong>{byRoom.get(null)?.length??0}</strong> sem divisao.</p></article>
        <article><h3>Ocultos</h3><p>{hiddenCount} ocultos.</p><button onClick={onRestoreHidden}>Restaurar</button></article>
        {rooms.map(r => (
          <article key={r.id}><h3>{r.name}</h3><p><strong>{byRoom.get(r.id)?.length??0}</strong> dispositivos</p></article>
        ))}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App/></React.StrictMode>
);

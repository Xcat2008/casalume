import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.resolve("/app/data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "casalume.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deviceId TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  protocol TEXT,
  ip TEXT,
  roomId INTEGER,
  type TEXT,
  online INTEGER DEFAULT 1,
  lastSeen TEXT,
  stateJson TEXT,
  power REAL,
  customName TEXT,
  cardX REAL,
  cardY REAL,
  hidden INTEGER DEFAULT 0,
  manualStatesJson TEXT,
  virtual INTEGER DEFAULT 0,
  FOREIGN KEY(roomId) REFERENCES rooms(id)
);
`);

function addColumnIfMissing(column: string, definition: string) {
  const columns = db.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE devices ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("stateJson", "TEXT");
addColumnIfMissing("power", "REAL");
addColumnIfMissing("customName", "TEXT");
addColumnIfMissing("cardX", "REAL");
addColumnIfMissing("cardY", "REAL");
addColumnIfMissing("hidden", "INTEGER DEFAULT 0");
addColumnIfMissing("manualStatesJson", "TEXT");
addColumnIfMissing("virtual", "INTEGER DEFAULT 0");

const roomCount = db.prepare("SELECT COUNT(*) as total FROM rooms").get() as { total: number };

if (roomCount.total === 0) {
  const insert = db.prepare("INSERT INTO rooms (key, name, icon) VALUES (?, ?, ?)");
  insert.run("sala", "Sala", "tv");
  insert.run("cozinha", "Cozinha", "chef-hat");
  insert.run("quartos", "Quartos", "bed");
  insert.run("casa-banho", "Casa de banho", "bath");
  insert.run("solar", "Sistema Solar", "sun");
}

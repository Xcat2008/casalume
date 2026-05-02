import { db } from "./database.js";

export function removeLegacyMockDevices() {
  db.exec(`
    DELETE FROM devices
    WHERE deviceId IN (
      'shelly-local-001',
      'lg-tv-001',
      'solar-001'
    );
  `);
}

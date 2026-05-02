import { db } from "../../db/database.js";

export function getAllRooms() {
  return db.prepare("SELECT * FROM rooms ORDER BY id ASC").all();
}

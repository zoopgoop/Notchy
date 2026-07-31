import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getDb } from "../db/client";
import { today } from "../engine/dateUtils";

/**
 * Exports a raw copy of the actual SQLite database rather than a hand-serialized JSON
 * dump — a copy is complete by construction (every table, always, with no risk of drifting
 * out of sync as the schema grows) and imports back in as a straight file swap instead of a
 * bespoke ID-preserving insert pipeline. It's still directly inspectable with any standard
 * SQLite tool (DB Browser for SQLite, DBeaver, `sqlite3` CLI, ...) if you want to look inside.
 */
export async function exportAllData(): Promise<void> {
  const db = await getDb();
  // Merge any pending WAL data into the main file and truncate the WAL, so a copy of just
  // notchy.db alone is a complete, self-contained snapshot — no separate -wal/-shm sidecar
  // files needed alongside it.
  await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");

  const source = new File(Paths.document, "SQLite", "notchy.db");
  const destination = new File(Paths.cache, `notchy-backup-${today()}.db`);
  if (destination.exists) destination.delete();
  await source.copy(destination);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(destination.uri, { mimeType: "application/octet-stream" });
  }
}

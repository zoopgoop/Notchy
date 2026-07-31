import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { closeAndResetDb } from "../db/client";

export type ImportResult = { kind: "success" } | { kind: "canceled" } | { kind: "error"; message: string };

// The fixed 16-byte header every real SQLite file starts with — a cheap way to reject an
// obviously-wrong file before it ever gets anywhere near replacing the real database.
const SQLITE_MAGIC = "SQLite format 3\0";

/**
 * Replaces the entire local database with a picked backup file — a full swap, not a merge.
 * Every screen holds state built from the OLD data (categories, habits, cached hook state,
 * ...), so rather than trying to hot-refresh all of that in place, the caller is expected to
 * prompt for a full app restart once this resolves successfully.
 */
export async function importAllData(): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return { kind: "canceled" };

  const pickedFile = new File(picked.assets[0].uri);
  const header = await pickedFile.bytes();
  const headerText = String.fromCharCode(...header.slice(0, SQLITE_MAGIC.length));
  if (headerText !== SQLITE_MAGIC) {
    return { kind: "error", message: "That doesn't look like a Notchy backup file (not a SQLite database)." };
  }

  await closeAndResetDb();

  const sqliteDir = new File(Paths.document, "SQLite");
  const destination = new File(sqliteDir, "notchy.db");
  const wal = new File(sqliteDir, "notchy.db-wal");
  const shm = new File(sqliteDir, "notchy.db-shm");
  if (destination.exists) destination.delete();
  if (wal.exists) wal.delete();
  if (shm.exists) shm.delete();

  await pickedFile.copy(destination);

  return { kind: "success" };
}

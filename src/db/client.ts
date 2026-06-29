import * as SQLite from "expo-sqlite";
import { BUILT_IN_TAGS, MIGRATIONS } from "./schema";
import { generateId } from "./id";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Memoized — opens and migrates once per app lifetime, every caller after the first just awaits the same promise. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("notchy.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = row?.user_version ?? 0;

  // foreign_keys must be toggled outside any transaction — SQLite silently no-ops the
  // pragma otherwise — and some migrations rebuild tables that other tables reference,
  // which needs checks off for the duration.
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
  await db.execAsync("PRAGMA foreign_keys = ON;");

  if (currentVersion === 0) {
    await seedBuiltInTags(db);
  }

  return db;
}

async function seedBuiltInTags(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const label of BUILT_IN_TAGS) {
    await db.runAsync("INSERT INTO tags (id, label, is_built_in) VALUES (?, ?, 1)", [
      generateId(),
      label,
    ]);
  }
}

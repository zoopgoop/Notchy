import { Tag } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { rowToTag, TagRow } from "../mappers";

export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TagRow>("SELECT * FROM tags ORDER BY is_built_in DESC, label ASC");
  return rows.map(rowToTag);
}

export async function createTag(label: string): Promise<Tag> {
  const db = await getDb();
  const tag: Tag = { id: generateId(), label, isBuiltIn: false };
  await db.runAsync("INSERT INTO tags (id, label, is_built_in) VALUES (?, ?, 0)", [tag.id, tag.label]);
  return tag;
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM tags WHERE id = ?", [id]);
}

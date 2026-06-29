import { Category } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { CategoryRow, rowToCategory } from "../mappers";

export async function createCategory(input: { name: string; color: string }): Promise<Category> {
  const db = await getDb();
  const category: Category = {
    id: generateId(),
    name: input.name,
    color: input.color,
    createdAt: new Date().toISOString(),
  };
  await db.runAsync("INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)", [
    category.id,
    category.name,
    category.color,
    category.createdAt,
  ]);
  return category;
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>("SELECT * FROM categories ORDER BY created_at ASC");
  return rows.map(rowToCategory);
}

export async function getCategory(id: string): Promise<Category | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CategoryRow>("SELECT * FROM categories WHERE id = ?", [id]);
  return row ? rowToCategory(row) : null;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, "name" | "color">>
): Promise<void> {
  const db = await getDb();
  if (updates.name !== undefined) {
    await db.runAsync("UPDATE categories SET name = ? WHERE id = ?", [updates.name, id]);
  }
  if (updates.color !== undefined) {
    await db.runAsync("UPDATE categories SET color = ? WHERE id = ?", [updates.color, id]);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM categories WHERE id = ?", [id]);
}

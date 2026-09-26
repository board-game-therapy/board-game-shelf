import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull().default("Uncategorized"),
  confidence: text("confidence").notNull().default("confirmed"),
  kind: text("kind").notNull().default("game"),
  notes: text("notes").notNull().default(""),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  catalogKey: text("catalog_key").unique(),
  tags: text("tags").notNull().default("[]"),
  evidence: text("evidence").notNull().default("[]"),
  catalogSnapshot: text("catalog_snapshot").notNull().default("{}"),
  archived: integer("archived").notNull().default(0),
});
export const catalogState = sqliteTable("catalog_state", {
  id: integer("id").primaryKey(),
});

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {id:text('id').primaryKey(), kind:text('kind').notNull(), data:text('data').notNull(), revision:integer('revision').notNull().default(1)});

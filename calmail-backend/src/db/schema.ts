import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Add this new table
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id")
    .references(() => users.clerkUserId)
    .notNull()
    .unique(),
  provider: text("provider").notNull(), // e.g., 'google'
  accessToken: text("access_token").notNull(), // This will be encrypted
  refreshToken: text("refresh_token"), // This will be encrypted
  scopes: text("scopes"),
});

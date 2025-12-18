import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

// Core user table backing auth flow
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Hospitals (customers from Unleashed)
export const hospitals = mysqlTable("hospitals", {
  id: int("id").autoincrement().primaryKey(),
  unleashGuid: varchar("unleashGuid", { length: 64 }).notNull().unique(),
  customerCode: varchar("customerCode", { length: 100 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Hospital = typeof hospitals.$inferSelect;
export type InsertHospital = typeof hospitals.$inferInsert;

// Hospital areas (extracted from CustomerRef)
export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  hospitalId: int("hospitalId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 255 }),
  isConfirmed: boolean("isConfirmed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Area = typeof areas.$inferSelect;
export type InsertArea = typeof areas.$inferInsert;

// Area name aliases for fuzzy matching
export const areaAliases = mysqlTable("areaAliases", {
  id: int("id").autoincrement().primaryKey(),
  areaId: int("areaId").notNull(),
  alias: varchar("alias", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AreaAlias = typeof areaAliases.$inferSelect;
export type InsertAreaAlias = typeof areaAliases.$inferInsert;

// Purchases synced from Unleashed
export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  unleashOrderGuid: varchar("unleashOrderGuid", { length: 64 }).notNull().unique(),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull(),
  orderDate: timestamp("orderDate").notNull(),
  hospitalId: int("hospitalId").notNull(),
  areaId: int("areaId"),
  customerRef: text("customerRef"),
  rawAreaText: varchar("rawAreaText", { length: 500 }),
  orderStatus: varchar("orderStatus", { length: 50 }),
  isReorder: boolean("isReorder"),
  reorderConfirmed: boolean("reorderConfirmed").default(false).notNull(),
  linkedPurchaseId: int("linkedPurchaseId"),
  isExcluded: boolean("isExcluded").default(false).notNull(),
  excludeReason: varchar("excludeReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;

// Purchase line items
export const purchaseLines = mysqlTable("purchaseLines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  unleashProductGuid: varchar("unleashProductGuid", { length: 64 }),
  productCode: varchar("productCode", { length: 50 }),
  productDescription: text("productDescription"),
  productType: mysqlEnum("productType", ["standard", "mesh_top", "long_drop", "other"]).default("other"),
  productSize: mysqlEnum("productSize", ["full", "medium", "half", "other"]).default("other"),
  productColor: varchar("productColor", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PurchaseLine = typeof purchaseLines.$inferSelect;
export type InsertPurchaseLine = typeof purchaseLines.$inferInsert;

// Pending area matches for manual confirmation
export const pendingMatches = mysqlTable("pendingMatches", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  rawAreaText: varchar("rawAreaText", { length: 500 }).notNull(),
  suggestedAreaId: int("suggestedAreaId"),
  suggestedAreaName: varchar("suggestedAreaName", { length: 255 }),
  matchScore: decimal("matchScore", { precision: 5, scale: 2 }),
  llmSuggestion: text("llmSuggestion"),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected", "new_area"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type PendingMatch = typeof pendingMatches.$inferSelect;
export type InsertPendingMatch = typeof pendingMatches.$inferInsert;

// Notification log
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["overdue", "due_soon"]).notNull(),
  areaId: int("areaId").notNull(),
  hospitalId: int("hospitalId").notNull(),
  message: text("message"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Sync log for tracking data imports
export const syncLogs = mysqlTable("syncLogs", {
  id: int("id").autoincrement().primaryKey(),
  syncType: varchar("syncType", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed", "cancelled"]).notNull(),
  recordsProcessed: int("recordsProcessed").default(0),
  progressStep: varchar("progressStep", { length: 100 }),
  progressDetail: text("progressDetail"),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

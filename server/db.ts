import { eq, and, desc, sql, like, or, isNull, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  hospitals, Hospital, InsertHospital,
  areas, Area, InsertArea,
  areaAliases, AreaAlias, InsertAreaAlias,
  purchases, Purchase, InsertPurchase,
  purchaseLines, PurchaseLine, InsertPurchaseLine,
  pendingMatches, PendingMatch, InsertPendingMatch,
  notifications, Notification, InsertNotification,
  syncLogs, SyncLog, InsertSyncLog
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Hospital operations
export async function upsertHospital(hospital: InsertHospital): Promise<Hospital> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(hospitals).values(hospital).onDuplicateKeyUpdate({
    set: {
      customerCode: hospital.customerCode,
      customerName: hospital.customerName,
      updatedAt: new Date(),
    }
  });

  const result = await db.select().from(hospitals).where(eq(hospitals.unleashGuid, hospital.unleashGuid)).limit(1);
  return result[0];
}

export async function batchUpsertHospitals(hospitalList: InsertHospital[]): Promise<void> {
  const db = await getDb();
  if (!db || hospitalList.length === 0) return;
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < hospitalList.length; i += BATCH_SIZE) {
    const batch = hospitalList.slice(i, i + BATCH_SIZE);
    for (const hospital of batch) {
      await db.insert(hospitals).values(hospital).onDuplicateKeyUpdate({
        set: {
          customerCode: hospital.customerCode,
          customerName: hospital.customerName,
          updatedAt: new Date(),
        }
      });
    }
  }
}

export async function getAllHospitals(): Promise<Hospital[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hospitals).orderBy(hospitals.customerName);
}

export async function getHospitalById(id: number): Promise<Hospital | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(hospitals).where(eq(hospitals.id, id)).limit(1);
  return result[0];
}

// Area operations
export async function createArea(area: InsertArea): Promise<Area> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(areas).values(area);
  const inserted = await db.select().from(areas).where(eq(areas.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function getAreasByHospital(hospitalId: number): Promise<Area[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(areas).where(eq(areas.hospitalId, hospitalId)).orderBy(areas.name);
}

export async function getAllAreas(): Promise<(Area & { hospitalName: string })[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      id: areas.id,
      hospitalId: areas.hospitalId,
      name: areas.name,
      normalizedName: areas.normalizedName,
      isConfirmed: areas.isConfirmed,
      createdAt: areas.createdAt,
      updatedAt: areas.updatedAt,
      hospitalName: hospitals.customerName,
    })
    .from(areas)
    .leftJoin(hospitals, eq(areas.hospitalId, hospitals.id))
    .orderBy(hospitals.customerName, areas.name);
  
  return result.map(r => ({
    ...r,
    hospitalName: r.hospitalName || 'Unknown',
  }));
}

export async function updateArea(id: number, data: Partial<InsertArea>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(areas).set({ ...data, updatedAt: new Date() }).where(eq(areas.id, id));
}

// Area alias operations
export async function addAreaAlias(alias: InsertAreaAlias): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(areaAliases).values(alias);
}

export async function getAliasesForArea(areaId: number): Promise<AreaAlias[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(areaAliases).where(eq(areaAliases.areaId, areaId));
}

export async function getAllAliases(): Promise<AreaAlias[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(areaAliases);
}

// Purchase operations
export async function upsertPurchase(purchase: InsertPurchase): Promise<Purchase> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(purchases).values(purchase).onDuplicateKeyUpdate({
    set: {
      orderDate: purchase.orderDate,
      areaId: purchase.areaId,
      customerRef: purchase.customerRef,
      rawAreaText: purchase.rawAreaText,
      orderStatus: purchase.orderStatus,
      updatedAt: new Date(),
    }
  });

  const result = await db.select().from(purchases).where(eq(purchases.unleashOrderGuid, purchase.unleashOrderGuid)).limit(1);
  return result[0];
}

export async function getPurchasesByArea(areaId: number): Promise<Purchase[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchases).where(eq(purchases.areaId, areaId)).orderBy(desc(purchases.orderDate));
}

export async function getPurchasesByHospital(hospitalId: number): Promise<Purchase[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchases).where(eq(purchases.hospitalId, hospitalId)).orderBy(desc(purchases.orderDate));
}

export async function getUnmatchedPurchases(): Promise<Purchase[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchases).where(isNull(purchases.areaId)).orderBy(desc(purchases.orderDate));
}

export async function updatePurchase(id: number, data: Partial<InsertPurchase>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchases).set({ ...data, updatedAt: new Date() }).where(eq(purchases.id, id));
}

export async function batchUpsertPurchases(purchaseList: InsertPurchase[]): Promise<void> {
  const db = await getDb();
  if (!db || purchaseList.length === 0) return;
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < purchaseList.length; i += BATCH_SIZE) {
    const batch = purchaseList.slice(i, i + BATCH_SIZE);
    for (const purchase of batch) {
      await db.insert(purchases).values(purchase).onDuplicateKeyUpdate({
        set: {
          orderDate: purchase.orderDate,
          areaId: purchase.areaId,
          customerRef: purchase.customerRef,
          rawAreaText: purchase.rawAreaText,
          orderStatus: purchase.orderStatus,
          updatedAt: new Date(),
        }
      });
    }
  }
}

export async function getAllPurchases(): Promise<Purchase[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchases);
}

// Purchase line operations
export async function createPurchaseLines(lines: InsertPurchaseLine[]): Promise<void> {
  const db = await getDb();
  if (!db || lines.length === 0) return;
  
  // Insert in batches of 100 to avoid query size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(purchaseLines).values(batch).onDuplicateKeyUpdate({
        set: {
          quantity: sql`VALUES(quantity)`,
          unitPrice: sql`VALUES(unitPrice)`,
        }
      });
    } catch (error) {
      console.error('Error inserting purchase lines batch:', error);
      // Continue with next batch
    }
  }
}

export async function getPurchaseLinesByPurchase(purchaseId: number): Promise<PurchaseLine[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, purchaseId));
}

// Pending match operations
export async function createPendingMatch(match: InsertPendingMatch): Promise<PendingMatch> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(pendingMatches).values(match);
  const inserted = await db.select().from(pendingMatches).where(eq(pendingMatches.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function createPendingMatchIfNotExists(match: InsertPendingMatch): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Check if pending match already exists for this purchase
  const existing = await db.select().from(pendingMatches)
    .where(and(eq(pendingMatches.purchaseId, match.purchaseId), eq(pendingMatches.status, 'pending')))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(pendingMatches).values(match);
  }
}

export async function batchCreatePendingMatches(matches: InsertPendingMatch[]): Promise<void> {
  const db = await getDb();
  if (!db || matches.length === 0) return;
  
  // Get all existing pending matches to filter out duplicates
  const existingMatches = await db.select({ purchaseId: pendingMatches.purchaseId })
    .from(pendingMatches)
    .where(eq(pendingMatches.status, 'pending'));
  const existingPurchaseIds = new Set(existingMatches.map(m => m.purchaseId));
  
  // Filter out matches that already exist
  const newMatches = matches.filter(m => !existingPurchaseIds.has(m.purchaseId));
  if (newMatches.length === 0) return;
  
  // Insert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < newMatches.length; i += BATCH_SIZE) {
    const batch = newMatches.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(pendingMatches).values(batch);
    } catch (error) {
      console.error('Error inserting pending matches batch:', error);
    }
  }
}

export async function getPendingMatches() {
  const db = await getDb();
  if (!db) return [];
  
  // Join with purchases and hospitals to get context
  const results = await db
    .select({
      id: pendingMatches.id,
      purchaseId: pendingMatches.purchaseId,
      rawAreaText: pendingMatches.rawAreaText,
      suggestedAreaId: pendingMatches.suggestedAreaId,
      suggestedAreaName: pendingMatches.suggestedAreaName,
      matchScore: pendingMatches.matchScore,
      llmSuggestion: pendingMatches.llmSuggestion,
      status: pendingMatches.status,
      createdAt: pendingMatches.createdAt,
      resolvedAt: pendingMatches.resolvedAt,
      // Purchase info
      orderNumber: purchases.orderNumber,
      orderDate: purchases.orderDate,
      customerRef: purchases.customerRef,
      // Hospital info
      hospitalId: hospitals.id,
      hospitalName: hospitals.customerName,
      hospitalCode: hospitals.customerCode,
    })
    .from(pendingMatches)
    .innerJoin(purchases, eq(pendingMatches.purchaseId, purchases.id))
    .innerJoin(hospitals, eq(purchases.hospitalId, hospitals.id))
    .where(eq(pendingMatches.status, 'pending'))
    .orderBy(hospitals.customerName, pendingMatches.rawAreaText);
  
  return results;
}

export async function updatePendingMatch(id: number, data: Partial<InsertPendingMatch>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pendingMatches).set(data).where(eq(pendingMatches.id, id));
}

// Notification operations
export async function createNotification(notification: InsertNotification): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(notification);
}

export async function getRecentNotifications(areaId: number, type: 'overdue' | 'due_soon', withinDays: number = 7): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - withinDays);
  
  return db.select().from(notifications)
    .where(and(
      eq(notifications.areaId, areaId),
      eq(notifications.type, type),
      gte(notifications.sentAt, cutoffDate)
    ));
}

// Sync log operations
export async function createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(syncLogs).values(log);
  const inserted = await db.select().from(syncLogs).where(eq(syncLogs.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function updateSyncLog(id: number, data: Partial<InsertSyncLog>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(syncLogs).set(data).where(eq(syncLogs.id, id));
}

export async function getLatestSyncLog(syncType?: string): Promise<SyncLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  // If no syncType specified, get the most recent sync of any type
  const query = syncType 
    ? db.select().from(syncLogs).where(eq(syncLogs.syncType, syncType))
    : db.select().from(syncLogs);
  const result = await query.orderBy(desc(syncLogs.startedAt)).limit(1);
  return result[0];
}

export async function getSyncLogById(id: number): Promise<SyncLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(syncLogs).where(eq(syncLogs.id, id)).limit(1);
  return result[0];
}

// Reorder status calculations
export interface AreaReorderStatus {
  areaId: number;
  areaName: string;
  hospitalId: number;
  hospitalName: string;
  lastPurchaseDate: Date | null;
  reorderDueDate: Date | null;
  status: 'overdue' | 'due_soon' | 'on_track' | 'no_purchase';
  daysUntilDue: number | null;
}

export async function getAreaReorderStatuses(): Promise<AreaReorderStatus[]> {
  const db = await getDb();
  if (!db) return [];

  const allAreas = await getAllAreas();
  
  // Get all purchases in one query and group by area
  const allPurchases = await db.select().from(purchases).orderBy(desc(purchases.orderDate));
  const purchasesByArea = new Map<number, typeof allPurchases[0]>();
  for (const p of allPurchases) {
    if (p.areaId && !purchasesByArea.has(p.areaId)) {
      purchasesByArea.set(p.areaId, p); // First one is the most recent
    }
  }
  
  const now = new Date();
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  const dueSoonThresholdMs = 90 * 24 * 60 * 60 * 1000; // 90 days

  const statuses: AreaReorderStatus[] = [];

  for (const area of allAreas) {
    const lastPurchase = purchasesByArea.get(area.id);

    let status: AreaReorderStatus['status'] = 'no_purchase';
    let reorderDueDate: Date | null = null;
    let daysUntilDue: number | null = null;

    if (lastPurchase) {
      reorderDueDate = new Date(lastPurchase.orderDate.getTime() + twoYearsMs);
      const timeDiff = reorderDueDate.getTime() - now.getTime();
      daysUntilDue = Math.ceil(timeDiff / (24 * 60 * 60 * 1000));

      if (timeDiff < 0) {
        status = 'overdue';
      } else if (timeDiff < dueSoonThresholdMs) {
        status = 'due_soon';
      } else {
        status = 'on_track';
      }
    }

    statuses.push({
      areaId: area.id,
      areaName: area.name,
      hospitalId: area.hospitalId,
      hospitalName: area.hospitalName,
      lastPurchaseDate: lastPurchase?.orderDate || null,
      reorderDueDate,
      status,
      daysUntilDue,
    });
  }

  // Sort by daysUntilDue (smallest/most overdue first, nulls at end)
  statuses.sort((a, b) => {
    if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
    if (a.daysUntilDue === null) return 1;
    if (b.daysUntilDue === null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  return statuses;
}

// Stock forecast calculations
export interface StockForecast {
  hospitalId: number;
  hospitalName: string;
  areaId: number;
  areaName: string;
  productType: string;
  productSize: string;
  productColor: string;
  expectedQuantity: number;
  expectedReorderDate: Date | null;
}

export async function getStockForecasts(): Promise<StockForecast[]> {
  const db = await getDb();
  if (!db) return [];

  const allAreas = await getAllAreas();
  const forecasts: StockForecast[] = [];
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;

  // Get all purchases and lines in bulk
  const allPurchases = await db.select().from(purchases).orderBy(desc(purchases.orderDate));
  const allLines = await db.select().from(purchaseLines);
  
  // Build lookup maps
  const purchasesByArea = new Map<number, typeof allPurchases[0]>();
  for (const p of allPurchases) {
    if (p.areaId && !purchasesByArea.has(p.areaId)) {
      purchasesByArea.set(p.areaId, p);
    }
  }
  
  const linesByPurchase = new Map<number, typeof allLines>();
  for (const line of allLines) {
    if (!linesByPurchase.has(line.purchaseId)) {
      linesByPurchase.set(line.purchaseId, []);
    }
    linesByPurchase.get(line.purchaseId)!.push(line);
  }

  for (const area of allAreas) {
    const lastPurchase = purchasesByArea.get(area.id);
    if (!lastPurchase) continue;

    const lines = linesByPurchase.get(lastPurchase.id) || [];

    // Filter for Sporicidal Curtains only (standard, mesh_top, long_drop)
    const curtainLines = lines.filter(l => 
      l.productType === 'standard' || l.productType === 'mesh_top' || l.productType === 'long_drop'
    );

    for (const line of curtainLines) {
      forecasts.push({
        hospitalId: area.hospitalId,
        hospitalName: area.hospitalName,
        areaId: area.id,
        areaName: area.name,
        productType: line.productType || 'other',
        productSize: line.productSize || 'other',
        productColor: line.productColor || 'Unknown',
        expectedQuantity: Number(line.quantity),
        expectedReorderDate: new Date(lastPurchase.orderDate.getTime() + twoYearsMs),
      });
    }
  }

  return forecasts;
}

// Cleanup: Remove orphan purchases (no product lines) and their pending matches
export interface CleanupResult {
  orphanPurchasesFound: number;
  pendingMatchesDeleted: number;
  purchasesDeleted: number;
}

export async function cleanupOrphanPurchases(): Promise<CleanupResult> {
  const db = await getDb();
  if (!db) return { orphanPurchasesFound: 0, pendingMatchesDeleted: 0, purchasesDeleted: 0 };

  // Find purchases that have no product lines
  const allPurchases = await db.select({ id: purchases.id }).from(purchases);
  const allLines = await db.select({ purchaseId: purchaseLines.purchaseId }).from(purchaseLines);
  
  const purchasesWithLines = new Set(allLines.map(l => l.purchaseId));
  const orphanPurchaseIds = allPurchases
    .filter(p => !purchasesWithLines.has(p.id))
    .map(p => p.id);

  if (orphanPurchaseIds.length === 0) {
    return { orphanPurchasesFound: 0, pendingMatchesDeleted: 0, purchasesDeleted: 0 };
  }

  console.log(`[Cleanup] Found ${orphanPurchaseIds.length} orphan purchases (no product lines)`);

  // Delete pending matches for orphan purchases
  let pendingMatchesDeleted = 0;
  for (const purchaseId of orphanPurchaseIds) {
    const result = await db.delete(pendingMatches).where(eq(pendingMatches.purchaseId, purchaseId));
    pendingMatchesDeleted += Number(result[0]?.affectedRows || 0);
  }
  console.log(`[Cleanup] Deleted ${pendingMatchesDeleted} pending matches`);

  // Delete orphan purchases
  let purchasesDeleted = 0;
  for (const purchaseId of orphanPurchaseIds) {
    const result = await db.delete(purchases).where(eq(purchases.id, purchaseId));
    purchasesDeleted += Number(result[0]?.affectedRows || 0);
  }
  console.log(`[Cleanup] Deleted ${purchasesDeleted} orphan purchases`);

  return {
    orphanPurchasesFound: orphanPurchaseIds.length,
    pendingMatchesDeleted,
    purchasesDeleted,
  };
}

// Preview cleanup without deleting (dry run)
export async function previewOrphanPurchases(): Promise<{ count: number; samples: { id: number; orderNumber: string; hospitalName: string; customerRef: string | null }[] }> {
  const db = await getDb();
  if (!db) return { count: 0, samples: [] };

  // Find purchases that have no product lines with hospital info
  const allPurchasesWithInfo = await db
    .select({
      id: purchases.id,
      orderNumber: purchases.orderNumber,
      customerRef: purchases.customerRef,
      hospitalName: hospitals.customerName,
    })
    .from(purchases)
    .innerJoin(hospitals, eq(purchases.hospitalId, hospitals.id));
  
  const allLines = await db.select({ purchaseId: purchaseLines.purchaseId }).from(purchaseLines);
  const purchasesWithLines = new Set(allLines.map(l => l.purchaseId));
  
  const orphans = allPurchasesWithInfo.filter(p => !purchasesWithLines.has(p.id));

  return {
    count: orphans.length,
    samples: orphans.slice(0, 10), // Return first 10 as samples
  };
}

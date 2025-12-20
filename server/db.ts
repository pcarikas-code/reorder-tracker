import { eq, and, desc, sql, like, or, isNull, gte, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  hospitals, Hospital, InsertHospital,
  areas, Area, InsertArea,
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
  
  // True bulk insert with ON DUPLICATE KEY UPDATE
  const BATCH_SIZE = 100;
  for (let i = 0; i < hospitalList.length; i += BATCH_SIZE) {
    const batch = hospitalList.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(hospitals).values(batch).onDuplicateKeyUpdate({
        set: {
          customerCode: sql`VALUES(customerCode)`,
          customerName: sql`VALUES(customerName)`,
          updatedAt: sql`NOW()`,
        }
      });
    } catch (error) {
      console.error('Error batch upserting hospitals:', error);
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

  // Check if area with same name already exists for this hospital
  const existing = await db.select().from(areas)
    .where(and(eq(areas.hospitalId, area.hospitalId), eq(areas.name, area.name)))
    .limit(1);
  
  if (existing.length > 0) {
    // Return existing area instead of creating duplicate
    return existing[0];
  }

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

// Old simple version removed - replaced by comprehensive version below

export async function updatePurchase(id: number, data: Partial<InsertPurchase>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchases).set({ ...data, updatedAt: new Date() }).where(eq(purchases.id, id));
}

export async function batchUpsertPurchases(purchaseList: InsertPurchase[]): Promise<void> {
  const db = await getDb();
  if (!db || purchaseList.length === 0) return;
  
  // True bulk insert with ON DUPLICATE KEY UPDATE
  const BATCH_SIZE = 100;
  for (let i = 0; i < purchaseList.length; i += BATCH_SIZE) {
    const batch = purchaseList.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(purchases).values(batch).onDuplicateKeyUpdate({
        set: {
          orderDate: sql`VALUES(orderDate)`,
          invoiceDate: sql`VALUES(invoiceDate)`,
          areaId: sql`VALUES(areaId)`,
          customerRef: sql`VALUES(customerRef)`,
          rawAreaText: sql`VALUES(rawAreaText)`,
          orderStatus: sql`VALUES(orderStatus)`,
          updatedAt: sql`NOW()`,
        }
      });
    } catch (error) {
      console.error('Error batch upserting purchases:', error);
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
          unleashProductGuid: sql`VALUES(unleashProductGuid)`,
          productCode: sql`VALUES(productCode)`,
          productDescription: sql`VALUES(productDescription)`,
          productType: sql`VALUES(productType)`,
          productSize: sql`VALUES(productSize)`,
          productColor: sql`VALUES(productColor)`,
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

// SIMPLIFIED: Get all unmatched purchases directly from purchases table
// A purchase is unmatched if: areaId IS NULL AND isExcluded = false
// This replaces the complex pending_matches logic
export async function getUnmatchedPurchases() {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select({
      id: purchases.id,
      purchaseId: purchases.id, // Alias for compatibility
      orderNumber: purchases.orderNumber,
      orderDate: purchases.orderDate,
      invoiceDate: purchases.invoiceDate,
      customerRef: purchases.customerRef,
      rawAreaText: purchases.rawAreaText,
      hospitalId: hospitals.id,
      hospitalName: hospitals.customerName,
      hospitalCode: hospitals.customerCode,
    })
    .from(purchases)
    .innerJoin(hospitals, eq(purchases.hospitalId, hospitals.id))
    .where(and(
      isNull(purchases.areaId),
      eq(purchases.isExcluded, false)
    ))
    .orderBy(hospitals.customerName, desc(purchases.orderDate));
  
  return results;
}

// Keep old function name as alias for backward compatibility
export const getPendingMatches = getUnmatchedPurchases;

export async function updatePendingMatch(id: number, data: Partial<InsertPendingMatch>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pendingMatches).set(data).where(eq(pendingMatches.id, id));
}

export async function deletePendingMatchByPurchaseId(purchaseId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pendingMatches).where(eq(pendingMatches.purchaseId, purchaseId));
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
  lastPurchaseDate: Date | null; // This is now invoiceDate (or orderDate if no invoice)
  lastOrderDate: Date | null; // The sales order date
  orderNumber: string | null; // The SO-U number for On Order items
  reorderDueDate: Date | null;
  status: 'on_order' | 'overdue' | 'due_soon' | 'near_soon' | 'far_soon';
  daysUntilDue: number | null;
}

export async function getAreaReorderStatuses(): Promise<AreaReorderStatus[]> {
  const db = await getDb();
  if (!db) return [];

  const allAreas = await getAllAreas();
  
  // Get all purchases in one query
  const allPurchases = await db.select().from(purchases).orderBy(desc(purchases.orderDate));
  
  // Build two maps:
  // 1. onOrderByArea: Areas that have a purchase without invoiceDate (On Order)
  // 2. lastDeliveredByArea: Most recent delivered purchase (with invoiceDate) per area
  const onOrderByArea = new Map<number, typeof allPurchases[0]>();
  const lastDeliveredByArea = new Map<number, typeof allPurchases[0]>();
  
  for (const p of allPurchases) {
    if (!p.areaId || p.isExcluded) continue;
    
    // Track On Order purchases (no invoiceDate)
    if (!p.invoiceDate && !onOrderByArea.has(p.areaId)) {
      onOrderByArea.set(p.areaId, p);
    }
    
    // Track delivered purchases (with invoiceDate) - sorted by orderDate, so first one is most recent
    if (p.invoiceDate && !lastDeliveredByArea.has(p.areaId)) {
      lastDeliveredByArea.set(p.areaId, p);
    }
  }
  
  const now = new Date();
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  const eighteenMonthsMs = 18 * 30 * 24 * 60 * 60 * 1000; // 18 months threshold for On Order
  const dueSoonThresholdMs = 90 * 24 * 60 * 60 * 1000; // 0-90 days
  const nearSoonThresholdMs = 180 * 24 * 60 * 60 * 1000; // 90-180 days
  const farSoonThresholdMs = 360 * 24 * 60 * 60 * 1000; // 180-360 days

  const statuses: AreaReorderStatus[] = [];

  for (const area of allAreas) {
    const onOrderPurchase = onOrderByArea.get(area.id);
    const lastDelivered = lastDeliveredByArea.get(area.id);

    // Skip areas with no purchase history at all
    if (!onOrderPurchase && !lastDelivered) continue;

    // Check if there's a qualifying On Order purchase
    // Only count as "On Order" if the Sales Order was placed 18+ months after the last invoice
    // This excludes spares/additions which are typically ordered shortly after delivery
    let isQualifyingOnOrder = false;
    if (onOrderPurchase && lastDelivered?.invoiceDate) {
      const monthsSinceLastInvoice = onOrderPurchase.orderDate.getTime() - lastDelivered.invoiceDate.getTime();
      isQualifyingOnOrder = monthsSinceLastInvoice >= eighteenMonthsMs;
    } else if (onOrderPurchase && !lastDelivered) {
      // No previous delivery - this is a first order, show as On Order
      isQualifyingOnOrder = true;
    }

    if (isQualifyingOnOrder && onOrderPurchase) {
      statuses.push({
        areaId: area.id,
        areaName: area.name,
        hospitalId: area.hospitalId,
        hospitalName: area.hospitalName,
        lastPurchaseDate: lastDelivered?.invoiceDate || null,
        lastOrderDate: onOrderPurchase.orderDate,
        orderNumber: onOrderPurchase.orderNumber,
        reorderDueDate: null,
        status: 'on_order',
        daysUntilDue: null,
      });
      continue;
    }

    // No On Order purchase - use the last delivered order for reorder calculations
    if (!lastDelivered || !lastDelivered.invoiceDate) continue;

    // Use invoiceDate for reorder calculations (when curtains were actually delivered)
    const reorderDueDate = new Date(lastDelivered.invoiceDate.getTime() + twoYearsMs);
    const timeDiff = reorderDueDate.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(timeDiff / (24 * 60 * 60 * 1000));

    let status: AreaReorderStatus['status'];
    if (timeDiff < 0) {
      status = 'overdue';
    } else if (timeDiff < dueSoonThresholdMs) {
      status = 'due_soon';
    } else if (timeDiff < nearSoonThresholdMs) {
      status = 'near_soon';
    } else if (timeDiff < farSoonThresholdMs) {
      status = 'far_soon';
    } else {
      // More than 360 days out - skip these as they're not actionable
      continue;
    }

    statuses.push({
      areaId: area.id,
      areaName: area.name,
      hospitalId: area.hospitalId,
      hospitalName: area.hospitalName,
      lastPurchaseDate: lastDelivered.invoiceDate,
      lastOrderDate: lastDelivered.orderDate,
      orderNumber: null,
      reorderDueDate,
      status,
      daysUntilDue,
    });
  }

  // Sort by status priority (overdue first, then on_order, then by daysUntilDue)
  const statusOrder = { 'overdue': 0, 'on_order': 1, 'due_soon': 2, 'near_soon': 3, 'far_soon': 4 };
  statuses.sort((a, b) => {
    // First sort by status priority
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    // Then by daysUntilDue
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
  productCode: string;
  productDescription: string;
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
  // Sort by invoiceDate first (for delivered orders), then orderDate - consistent with getAreaReorderStatuses
  const allPurchases = await db.select().from(purchases).orderBy(desc(purchases.invoiceDate), desc(purchases.orderDate));
  const allLines = await db.select().from(purchaseLines);
  
  // Build lookup maps - prioritize purchases with invoiceDate (delivered orders)
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
        productCode: line.productCode || 'unknown',
        productDescription: line.productDescription || '',
        productType: line.productType || 'other',
        productSize: line.productSize || 'other',
        productColor: line.productColor || 'Unknown',
        expectedQuantity: Number(line.quantity),
        // Use invoiceDate for reorder calculation (when curtains were delivered), fall back to orderDate
        expectedReorderDate: lastPurchase.invoiceDate 
          ? new Date(lastPurchase.invoiceDate.getTime() + twoYearsMs)
          : new Date(lastPurchase.orderDate.getTime() + twoYearsMs),
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

  // Bulk delete pending matches for orphan purchases using IN clause
  let pendingMatchesDeleted = 0;
  const BATCH_SIZE = 500;
  for (let i = 0; i < orphanPurchaseIds.length; i += BATCH_SIZE) {
    const batch = orphanPurchaseIds.slice(i, i + BATCH_SIZE);
    const result = await db.delete(pendingMatches).where(inArray(pendingMatches.purchaseId, batch));
    pendingMatchesDeleted += Number(result[0]?.affectedRows || 0);
  }
  console.log(`[Cleanup] Deleted ${pendingMatchesDeleted} pending matches`);

  // Bulk delete orphan purchases using IN clause
  let purchasesDeleted = 0;
  for (let i = 0; i < orphanPurchaseIds.length; i += BATCH_SIZE) {
    const batch = orphanPurchaseIds.slice(i, i + BATCH_SIZE);
    const result = await db.delete(purchases).where(inArray(purchases.id, batch));
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

// Exclude purchase operations
export async function excludePurchase(purchaseId: number, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchases).set({ isExcluded: true, excludeReason: reason || null }).where(eq(purchases.id, purchaseId));
}

export async function unexcludePurchase(purchaseId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchases).set({ isExcluded: false, excludeReason: null }).where(eq(purchases.id, purchaseId));
}

export async function getExcludedPurchases() {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select({
      id: purchases.id,
      orderNumber: purchases.orderNumber,
      orderDate: purchases.orderDate,
      customerRef: purchases.customerRef,
      rawAreaText: purchases.rawAreaText,
      excludeReason: purchases.excludeReason,
      hospitalId: hospitals.id,
      hospitalName: hospitals.customerName,
    })
    .from(purchases)
    .innerJoin(hospitals, eq(purchases.hospitalId, hospitals.id))
    .where(eq(purchases.isExcluded, true))
    .orderBy(desc(purchases.orderDate));
  
  return results;
}

// Update area name
export async function updateAreaName(areaId: number, newName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(areas).set({ name: newName }).where(eq(areas.id, areaId));
}

// Get purchases linked to an area with details
export async function getPurchasesForArea(areaId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select({
      id: purchases.id,
      orderNumber: purchases.orderNumber,
      orderDate: purchases.orderDate,
      customerRef: purchases.customerRef,
      rawAreaText: purchases.rawAreaText,
      hospitalId: hospitals.id,
      hospitalName: hospitals.customerName,
    })
    .from(purchases)
    .innerJoin(hospitals, eq(purchases.hospitalId, hospitals.id))
    .where(eq(purchases.areaId, areaId))
    .orderBy(desc(purchases.orderDate));
  
  return results;
}

// Unlink a purchase from its area (sets areaId to null and creates pending match)
export async function unlinkPurchaseFromArea(purchaseId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Get the purchase first
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, purchaseId));
  if (!purchase) return;
  
  // Set areaId to null
  await db.update(purchases).set({ areaId: null }).where(eq(purchases.id, purchaseId));
  
  // Create a pending match for this purchase (use onDuplicateKeyUpdate to handle race conditions)
  await db.insert(pendingMatches).values({
    purchaseId: purchase.id,
    rawAreaText: purchase.rawAreaText || purchase.customerRef || 'Unknown',
    status: 'pending',
  }).onDuplicateKeyUpdate({
    set: { status: 'pending', rawAreaText: sql`VALUES(rawAreaText)` }
  });
}

// Move a purchase to a different area
export async function movePurchaseToArea(purchaseId: number, newAreaId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchases).set({ areaId: newAreaId }).where(eq(purchases.id, purchaseId));
}

// Merge two areas - move all purchases from source to target, then delete source
export async function mergeAreas(sourceAreaId: number, targetAreaId: number): Promise<{ purchasesMoved: number }> {
  const db = await getDb();
  if (!db) return { purchasesMoved: 0 };
  
  // Move all purchases from source to target
  const result = await db.update(purchases)
    .set({ areaId: targetAreaId })
    .where(eq(purchases.areaId, sourceAreaId));
  
  // Delete the source area
  await db.delete(areas).where(eq(areas.id, sourceAreaId));
  
  return { purchasesMoved: result[0]?.affectedRows || 0 };
}

// Get all purchases for a hospital with area info and curtain totals
export async function getPurchasesByHospitalWithArea(hospitalId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Get purchases
  const purchaseResults = await db
    .select({
      id: purchases.id,
      orderNumber: purchases.orderNumber,
      orderDate: purchases.orderDate,
      invoiceDate: purchases.invoiceDate,
      customerRef: purchases.customerRef,
      rawAreaText: purchases.rawAreaText,
      areaId: purchases.areaId,
      areaName: areas.name,
    })
    .from(purchases)
    .leftJoin(areas, eq(purchases.areaId, areas.id))
    .where(eq(purchases.hospitalId, hospitalId))
    .orderBy(desc(purchases.orderDate));
  
  // Get all purchase lines for these purchases to calculate curtain totals
  // Only count lines where productType is NOT 'other' (services/non-curtain items)
  const purchaseIds = purchaseResults.map(p => p.id);
  if (purchaseIds.length === 0) return [];
  
  const lines = await db
    .select({
      purchaseId: purchaseLines.purchaseId,
      quantity: purchaseLines.quantity,
      productType: purchaseLines.productType,
    })
    .from(purchaseLines)
    .where(inArray(purchaseLines.purchaseId, purchaseIds));
  
  // Calculate total curtains per purchase (exclude 'other' product type)
  const curtainTotals = new Map<number, number>();
  for (const line of lines) {
    if (line.productType !== 'other') {
      const current = curtainTotals.get(line.purchaseId) || 0;
      curtainTotals.set(line.purchaseId, current + parseFloat(line.quantity));
    }
  }
  
  // Combine results
  return purchaseResults.map(p => ({
    ...p,
    totalCurtains: curtainTotals.get(p.id) || 0,
  }));
}

// Repair orphaned pending matches - reset confirmed matches where purchase areaId is still NULL
export async function repairOrphanedPendingMatches(): Promise<{ repaired: number }> {
  const db = await getDb();
  if (!db) return { repaired: 0 };
  
  // Find all confirmed pending matches where the purchase areaId is NULL
  const orphaned = await db
    .select({
      pmId: pendingMatches.id,
      purchaseId: purchases.id,
      areaId: purchases.areaId,
    })
    .from(pendingMatches)
    .innerJoin(purchases, eq(pendingMatches.purchaseId, purchases.id))
    .where(and(
      eq(pendingMatches.status, 'confirmed'),
      isNull(purchases.areaId)
    ));
  
  if (orphaned.length === 0) return { repaired: 0 };
  
  // Reset these pending matches back to 'pending' status
  const pmIds = orphaned.map(o => o.pmId);
  await db.update(pendingMatches)
    .set({ status: 'pending', resolvedAt: null })
    .where(inArray(pendingMatches.id, pmIds));
  
  return { repaired: orphaned.length };
}

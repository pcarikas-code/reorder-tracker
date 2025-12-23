import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import * as synchub from "./synchub";
import { notifyOwner } from "./_core/notification";

// Helper to update sync progress
async function updateSyncProgress(syncLogId: number, step: string, detail: string): Promise<void> {
  await db.updateSyncLog(syncLogId, { progressStep: step, progressDetail: detail });
}

// Helper to check if sync was cancelled
async function checkSyncCancelled(syncLogId: number): Promise<boolean> {
  const syncLog = await db.getSyncLogById(syncLogId);
  return syncLog?.status === 'cancelled';
}

// Background sync function
async function runSyncInBackground(syncLogId: number, sinceDate?: Date): Promise<void> {
  let recordsProcessed = 0;
  const syncType = sinceDate ? 'incremental' : 'full';
  console.log(`[Sync ${syncLogId}] Starting ${syncType} sync...${sinceDate ? ` (since ${sinceDate.toISOString()})` : ''}`);
  try {
    // Check for cancellation before each major step
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled before step 1`);
      return;
    }
    
    // Step 1: Sync customers (hospitals)
    await updateSyncProgress(syncLogId, 'Step 1/6', 'Fetching customers from Synchub...');
    console.log(`[Sync ${syncLogId}] Step 1: Fetching customers...`);
    const customers = await synchub.fetchCustomers();
    console.log(`[Sync ${syncLogId}] Fetched ${customers.length} customers`);
    await updateSyncProgress(syncLogId, 'Step 1/6', `Saving ${customers.length} customers...`);
    await db.batchUpsertHospitals(customers.map(c => ({ unleashGuid: c.Guid, customerCode: c.CustomerCode, customerName: c.CustomerName })));
    recordsProcessed += customers.length;
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 1`);
      return;
    }
    
    // Step 2: Get reference data once
    await updateSyncProgress(syncLogId, 'Step 2/6', 'Loading reference data...');
    console.log(`[Sync ${syncLogId}] Step 2: Getting reference data...`);
    const allHospitals = await db.getAllHospitals();
    const hospitalMap = new Map<string, number>();
    for (const h of allHospitals) hospitalMap.set(h.unleashGuid, h.id);
    console.log(`[Sync ${syncLogId}] Reference data: ${allHospitals.length} hospitals`);
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 2`);
      return;
    }
    
    // Step 3: Fetch orders and order lines together to filter for Endurocide products
    await updateSyncProgress(syncLogId, 'Step 3/6', 'Fetching sales orders from Synchub...');
    console.log(`[Sync ${syncLogId}] Step 3: Fetching orders${sinceDate ? ` modified since ${sinceDate.toISOString()}` : ''}...`);
    const orders = await synchub.fetchSalesOrders(sinceDate);
    console.log(`[Sync ${syncLogId}] Fetched ${orders.length} orders`);
    await updateSyncProgress(syncLogId, 'Step 3/6', `Found ${orders.length} orders, fetching product lines...`);
    
    // Step 3b: Fetch order lines FIRST to identify which orders have Endurocide products
    await updateSyncProgress(syncLogId, 'Step 3/6', `Fetching order lines for ${orders.length} orders (this may take a while)...`);
    console.log(`[Sync ${syncLogId}] Step 3b: Fetching order lines to filter for Endurocide products...`);
    const orderGuids = orders.map(o => o.Guid);
    const allLines = orderGuids.length > 0 ? await synchub.fetchSalesOrderLines(orderGuids) : [];
    console.log(`[Sync ${syncLogId}] Fetched ${allLines.length} Endurocide product lines`);
    await updateSyncProgress(syncLogId, 'Step 3/6', `Found ${allLines.length} Endurocide product lines`);
    
    // Build set of order GUIDs that have at least one Endurocide product
    const ordersWithEndurocide = new Set<string>();
    for (const line of allLines) {
      ordersWithEndurocide.add(line.SalesOrderRemoteID.toLowerCase());
    }
    console.log(`[Sync ${syncLogId}] ${ordersWithEndurocide.size} orders have Endurocide products (filtering out ${orders.length - ordersWithEndurocide.size} orders without)`);
    
    const purchasesToUpsert: Parameters<typeof db.batchUpsertPurchases>[0] = [];
    
    let skippedNoHospital = 0;
    let skippedNoEndurocide = 0;
    for (const order of orders) {
      // Skip orders that don't have any Endurocide products
      if (!ordersWithEndurocide.has(order.Guid.toLowerCase())) { skippedNoEndurocide++; continue; }
      
      const hospitalId = hospitalMap.get(order.CustomerGuid);
      if (!hospitalId) { skippedNoHospital++; continue; }
      
      // Extract area text from CustomerRef for display purposes only
      // Area matching is done manually through the Pending Matches page
      const rawAreaText = synchub.parseCustomerRef(order.CustomerRef);
      
      // Don't set areaId during sync - preserve existing manual matches via COALESCE in batchUpsertPurchases
      purchasesToUpsert.push({ unleashOrderGuid: order.Guid, orderNumber: order.OrderNumber, orderDate: order.OrderDate, invoiceDate: order.InvoiceDate || null, hospitalId, areaId: undefined, customerRef: order.CustomerRef, rawAreaText, orderStatus: order.OrderStatus });
    }
    console.log(`[Sync ${syncLogId}] Order processing: ${skippedNoEndurocide} skipped (no Endurocide products), ${skippedNoHospital} skipped (no hospital), ${purchasesToUpsert.length} orders to process`);
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 3`);
      return;
    }
    
    // Step 4: Batch upsert purchases
    await updateSyncProgress(syncLogId, 'Step 4/5', `Saving ${purchasesToUpsert.length} purchases...`);
    console.log(`[Sync ${syncLogId}] Step 4: Upserting ${purchasesToUpsert.length} purchases...`);
    await db.batchUpsertPurchases(purchasesToUpsert);
    recordsProcessed += purchasesToUpsert.length;
    console.log(`[Sync ${syncLogId}] Purchases upserted`);
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 4`);
      return;
    }
    
    // Step 5: Process order lines (already fetched in Step 3b)
    // Note: Pending matches are no longer stored separately - unmatched purchases are
    // identified directly from the purchases table (areaId IS NULL AND isExcluded = false)
    const allPurchases = await db.getAllPurchases();
    const purchaseMap = new Map<string, number>();
    for (const p of allPurchases) purchaseMap.set(p.unleashOrderGuid.toLowerCase(), p.id);
    
    await updateSyncProgress(syncLogId, 'Step 5/5', `Processing ${allLines.length} order lines...`);
    console.log(`[Sync ${syncLogId}] Step 5: Processing ${allLines.length} order lines...`);
    if (allLines.length > 0) {
      await updateSyncProgress(syncLogId, 'Step 5/5', 'Fetching product catalog...');
      const products = await synchub.fetchProducts();
      const productMap = new Map<string, typeof products[0]>();
      for (const p of products) productMap.set(p.Guid, p);
      
      const lineInserts: Parameters<typeof db.createPurchaseLines>[0] = [];
      let skippedNoPurchase = 0, skippedNoProduct = 0;
      for (const line of allLines) {
        const purchaseId = purchaseMap.get(line.SalesOrderRemoteID.toLowerCase());
        if (!purchaseId) { skippedNoPurchase++; continue; }
        const product = productMap.get(line.ProductGuid);
        if (!product) { skippedNoProduct++; continue; }
        // No need to check isSporicidalCurtain - allLines already filtered at SQL level
        const parsed = synchub.parseProductCode(product.ProductCode);
        lineInserts.push({ purchaseId, unleashLineGuid: line.LineGuid, unleashProductGuid: line.ProductGuid, productCode: product.ProductCode, productDescription: product.ProductDescription, productType: parsed.type, productSize: parsed.size, productColor: parsed.color, quantity: String(line.OrderQuantity), unitPrice: String(line.UnitPrice) });
      }
      console.log(`[Sync ${syncLogId}] Line processing: ${lineInserts.length} to insert, skipped: ${skippedNoPurchase} no purchase, ${skippedNoProduct} no product`);
      if (lineInserts.length > 0) {
        await updateSyncProgress(syncLogId, 'Step 5/5', `Saving ${lineInserts.length} purchase lines...`);
        console.log(`[Sync ${syncLogId}] Inserting ${lineInserts.length} purchase lines...`);
        await db.createPurchaseLines(lineInserts);
        console.log(`[Sync ${syncLogId}] Purchase lines inserted`);
      }
      recordsProcessed += lineInserts.length;
    }
    
    await updateSyncProgress(syncLogId, 'Complete', `Processed ${recordsProcessed} records`);
    await db.updateSyncLog(syncLogId, { status: 'completed', recordsProcessed, completedAt: new Date() });
    console.log(`Sync completed: ${recordsProcessed} records processed`);
  } catch (error) {
    console.error('Sync error:', error);
    await db.updateSyncLog(syncLogId, { status: 'failed', errorMessage: String(error), completedAt: new Date() });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  hospitals: router({
    list: protectedProcedure.query(async () => db.getAllHospitals()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => db.getHospitalById(input.id)),
    getPurchases: protectedProcedure.input(z.object({ hospitalId: z.number() })).query(async ({ input }) => db.getPurchasesByHospitalWithArea(input.hospitalId)),
    register: protectedProcedure.input(z.object({ hospitalId: z.number() })).query(async ({ input }) => db.getHospitalRegister(input.hospitalId)),
  }),

  areas: router({
    list: protectedProcedure.query(async () => db.getAllAreas()),
    byHospital: protectedProcedure.input(z.object({ hospitalId: z.number() })).query(async ({ input }) => db.getAreasByHospital(input.hospitalId)),
    create: protectedProcedure.input(z.object({ hospitalId: z.number(), name: z.string(), normalizedName: z.string().optional() })).mutation(async ({ input }) => db.createArea({ hospitalId: input.hospitalId, name: input.name, normalizedName: input.normalizedName })),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().optional(), normalizedName: z.string().optional(), isConfirmed: z.boolean().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await db.updateArea(id, data); return { success: true }; }),
    rename: protectedProcedure.input(z.object({ areaId: z.number(), newName: z.string() })).mutation(async ({ input }) => {
      const result = await db.updateAreaName(input.areaId, input.newName);
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || 'Failed to rename area' });
      }
      return { success: true };
    }),

    getPurchases: protectedProcedure.input(z.object({ areaId: z.number() })).query(async ({ input }) => db.getPurchasesForArea(input.areaId)),
    getOrderHistory: protectedProcedure.input(z.object({ areaId: z.number(), hospitalId: z.number() })).query(async ({ input }) => db.getAreaOrderHistory(input.areaId, input.hospitalId)),
    unlinkPurchase: protectedProcedure.input(z.object({ purchaseId: z.number() })).mutation(async ({ input }) => { await db.unlinkPurchaseFromArea(input.purchaseId); return { success: true }; }),
    movePurchase: protectedProcedure.input(z.object({ purchaseId: z.number(), newAreaId: z.number() })).mutation(async ({ input }) => { await db.movePurchaseToArea(input.purchaseId, input.newAreaId); return { success: true }; }),
    merge: protectedProcedure.input(z.object({ sourceAreaId: z.number(), targetAreaId: z.number() })).mutation(async ({ input }) => { const result = await db.mergeAreas(input.sourceAreaId, input.targetAreaId); return { success: true, ...result }; }),
  }),

  reorders: router({
    statuses: protectedProcedure.query(async () => db.getAreaReorderStatuses()),
    byStatus: protectedProcedure.input(z.object({ status: z.enum(['overdue', 'due_soon', 'on_track', 'no_purchase']) })).query(async ({ input }) => { const all = await db.getAreaReorderStatuses(); return all.filter(s => s.status === input.status); }),
  }),

  forecasts: router({
    list: protectedProcedure
      .input(z.object({ forecastDays: z.number().min(1).max(365).optional() }).optional())
      .query(async ({ input }) => db.getStockForecasts(input?.forecastDays ?? 90)),
    byHospital: protectedProcedure
      .input(z.object({ hospitalId: z.number(), forecastDays: z.number().min(1).max(365).optional() }))
      .query(async ({ input }) => {
        const all = await db.getStockForecasts(input.forecastDays ?? 90);
        return all.filter(f => f.hospitalId === input.hospitalId);
      }),
    summary: protectedProcedure
      .input(z.object({ forecastDays: z.number().min(1).max(365).optional() }).optional())
      .query(async ({ input }) => {
        const forecasts = await db.getStockForecasts(input?.forecastDays ?? 90);
        const summary: Record<string, { type: string; size: string; color: string; totalQuantity: number; areaCount: number }> = {};
        for (const f of forecasts) {
          const key = `${f.productType}-${f.productSize}-${f.productColor}`;
          if (!summary[key]) summary[key] = { type: f.productType, size: f.productSize, color: f.productColor, totalQuantity: 0, areaCount: 0 };
          summary[key].totalQuantity += f.expectedQuantity;
          summary[key].areaCount += 1;
        }
        return Object.values(summary).sort((a, b) => b.totalQuantity - a.totalQuantity);
      }),
  }),

  // SIMPLIFIED: All operations now use purchaseId directly
  // No more pending_matches table complexity
  matches: router({
    // Get all unmatched purchases (areaId IS NULL AND isExcluded = false)
    pending: protectedProcedure.query(async () => db.getUnmatchedPurchases()),
    
    // Get area suggestions for unmatched purchases using fuzzy matching
    getSuggestions: protectedProcedure.query(async () => {
      const unmatched = await db.getUnmatchedPurchases();
      const allAreas = await db.getAllAreas();
      
      // Import fuzzy matching utility
      const { findBestAreaSuggestion } = await import('../shared/fuzzyMatch');
      
      // Generate suggestions for each unmatched purchase
      const suggestions: Record<number, {
        type: 'existing' | 'new';
        areaId?: number;
        areaName: string;
        confidence: number;
      } | null> = {};
      
      for (const purchase of unmatched) {
        // Get areas for this hospital only
        const hospitalAreas = allAreas
          .filter(a => a.hospitalId === purchase.hospitalId)
          .map(a => ({ id: a.id, name: a.name, hospitalId: a.hospitalId }));
        
        // Pass hospital name for better formatting of new area suggestions
        const suggestion = findBestAreaSuggestion(
          purchase.rawAreaText, 
          hospitalAreas,
          (purchase as any).hospitalName || ''
        );
        suggestions[purchase.id] = suggestion;
      }
      
      return suggestions;
    }),
    
    // Link a purchase to an existing area
    confirm: protectedProcedure.input(z.object({ purchaseId: z.number(), areaId: z.number() })).mutation(async ({ input }) => {
      await db.updatePurchase(input.purchaseId, { areaId: input.areaId });
      return { success: true };
    }),
    
    // Create a new area and link the purchase to it
    createNewArea: protectedProcedure.input(z.object({ purchaseId: z.number(), hospitalId: z.number(), areaName: z.string() })).mutation(async ({ input }) => {
      const area = await db.createArea({ hospitalId: input.hospitalId, name: input.areaName, isConfirmed: true });
      await db.updatePurchase(input.purchaseId, { areaId: area.id });
      return { success: true, areaId: area.id };
    }),
    
    // Exclude a purchase from tracking
    exclude: protectedProcedure.input(z.object({ purchaseId: z.number(), reason: z.string().optional() })).mutation(async ({ input }) => {
      await db.excludePurchase(input.purchaseId, input.reason);
      return { success: true };
    }),
    
    // Get all excluded purchases
    excluded: protectedProcedure.query(async () => db.getExcludedPurchases()),
    
    // Un-exclude a purchase (bring it back to unmatched)
    unexclude: protectedProcedure.input(z.object({ purchaseId: z.number() })).mutation(async ({ input }) => {
      await db.unexcludePurchase(input.purchaseId);
      return { success: true };
    }),
    
    // Alias for exclude (backward compatibility)
    excludeByPurchaseId: protectedProcedure.input(z.object({ purchaseId: z.number(), reason: z.string().optional() })).mutation(async ({ input }) => {
      await db.excludePurchase(input.purchaseId, input.reason);
      return { success: true };
    }),
    
    // Link a purchase directly to an existing area (same as confirm, kept for compatibility)
    linkToArea: protectedProcedure.input(z.object({ purchaseId: z.number(), areaId: z.number() })).mutation(async ({ input }) => {
      await db.updatePurchase(input.purchaseId, { areaId: input.areaId });
      return { success: true };
    }),
    
    // Create a new area and link a purchase to it (same as createNewArea, kept for compatibility)
    createAreaAndLink: protectedProcedure.input(z.object({ purchaseId: z.number(), hospitalId: z.number(), areaName: z.string() })).mutation(async ({ input }) => {
      const area = await db.createArea({ hospitalId: input.hospitalId, name: input.areaName, isConfirmed: true });
      await db.updatePurchase(input.purchaseId, { areaId: area.id });
      return { success: true, areaId: area.id };
    }),
  }),

  sync: router({
    status: protectedProcedure.query(async () => {
      // Get the most recent sync of any type
      const result = await db.getLatestSyncLog();
      return result ?? null;
    }),
    run: protectedProcedure.input(z.object({ incremental: z.boolean().optional() }).optional()).mutation(async ({ input }) => {
      // Check if any sync is already running
      const existingSync = await db.getLatestSyncLog();
      if (existingSync?.status === 'running') {
        return { success: false, message: 'Sync already in progress', syncId: existingSync.id };
      }
      
      // For incremental sync, get the last successful sync date
      let sinceDate: Date | undefined;
      if (input?.incremental && existingSync?.status === 'completed' && existingSync.completedAt) {
        sinceDate = existingSync.completedAt;
      }
      
      const syncType = sinceDate ? 'incremental' : 'full';
      const syncLog = await db.createSyncLog({ syncType, status: 'running' });
      
      // Fire and forget - run sync in background
      runSyncInBackground(syncLog.id, sinceDate).catch(err => console.error('Background sync error:', err));
      
      return { success: true, message: `${syncType.charAt(0).toUpperCase() + syncType.slice(1)} sync started`, syncId: syncLog.id };
    }),
    cancel: protectedProcedure.mutation(async () => {
      // Cancel any running sync
      const existingSync = await db.getLatestSyncLog();
      if (existingSync?.status !== 'running') {
        return { success: false, message: 'No sync is currently running' };
      }
      
      // Mark as cancelled - the background process will check this and stop
      await db.updateSyncLog(existingSync.id, { 
        status: 'cancelled', 
        completedAt: new Date(),
        errorMessage: 'Cancelled by user'
      });
      
      return { success: true, message: 'Sync cancellation requested. It will stop at the next checkpoint.' };
    }),
    previewCleanup: protectedProcedure.query(async () => {
      // Preview orphan purchases without deleting
      return db.previewOrphanPurchases();
    }),
    runCleanup: protectedProcedure.mutation(async () => {
      // Delete orphan purchases and their pending matches
      const result = await db.cleanupOrphanPurchases();
      return { success: true, ...result };
    }),
  }),

  notifications: router({
    checkAndSend: protectedProcedure.mutation(async () => {
      const statuses = await db.getAreaReorderStatuses();
      let notificationsSent = 0;
      for (const status of statuses) {
        if (status.status === 'overdue' || status.status === 'due_soon') {
          const recent = await db.getRecentNotifications(status.areaId, status.status, 7);
          if (recent.length > 0) continue;
          const message = status.status === 'overdue' ? `OVERDUE: ${status.hospitalName} - ${status.areaName} was due for reorder on ${status.reorderDueDate?.toLocaleDateString()}` : `DUE SOON: ${status.hospitalName} - ${status.areaName} is due in ${status.daysUntilDue} days`;
          await notifyOwner({ title: status.status === 'overdue' ? '⚠️ Overdue Reorder' : '📅 Upcoming Reorder', content: message });
          await db.createNotification({ type: status.status, areaId: status.areaId, hospitalId: status.hospitalId, message });
          notificationsSent++;
        }
      }
      return { success: true, notificationsSent };
    }),
  }),

  exports: router({
    reorderAlerts: protectedProcedure.query(async () => {
      const statuses = await db.getAreaReorderStatuses();
      return statuses.filter(s => s.status === 'overdue' || s.status === 'due_soon').map(s => ({ hospital: s.hospitalName, area: s.areaName, status: s.status, lastPurchase: s.lastPurchaseDate?.toISOString().split('T')[0] || 'N/A', dueDate: s.reorderDueDate?.toISOString().split('T')[0] || 'N/A', daysUntilDue: s.daysUntilDue }));
    }),
    stockForecast: protectedProcedure.query(async () => {
      const forecasts = await db.getStockForecasts();
      return forecasts.map(f => ({ hospital: f.hospitalName, area: f.areaName, productType: f.productType, productSize: f.productSize, productColor: f.productColor, quantity: f.expectedQuantity, expectedDate: f.expectedReorderDate?.toISOString().split('T')[0] || 'N/A' }));
    }),
  }),
});

export type AppRouter = typeof appRouter;

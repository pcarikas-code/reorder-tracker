import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as synchub from "./synchub";
import { invokeLLM } from "./_core/llm";
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
    const allAreas = await db.getAllAreas();
    const allAliases = await db.getAllAliases();
    console.log(`[Sync ${syncLogId}] Reference data: ${allHospitals.length} hospitals, ${allAreas.length} areas, ${allAliases.length} aliases`);
    
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
    const pendingMatchesToCreate: { rawAreaText: string; orderGuid: string }[] = [];
    
    let skippedNoHospital = 0;
    let skippedNoRawArea = 0;
    let skippedNoEndurocide = 0;
    let matchedToArea = 0;
    for (const order of orders) {
      // Skip orders that don't have any Endurocide products
      if (!ordersWithEndurocide.has(order.Guid.toLowerCase())) { skippedNoEndurocide++; continue; }
      
      const hospitalId = hospitalMap.get(order.CustomerGuid);
      if (!hospitalId) { skippedNoHospital++; continue; }
      const rawAreaText = synchub.parseCustomerRef(order.CustomerRef);
      let areaId: number | undefined;
      if (rawAreaText) {
        const directMatch = allAreas.find(a => a.hospitalId === hospitalId && (a.name.toLowerCase() === rawAreaText.toLowerCase() || a.normalizedName?.toLowerCase() === rawAreaText.toLowerCase()));
        if (directMatch) { areaId = directMatch.id; matchedToArea++; }
        else { const aliasMatch = allAliases.find(al => al.alias.toLowerCase() === rawAreaText.toLowerCase()); if (aliasMatch) { areaId = aliasMatch.areaId; matchedToArea++; } }
      } else {
        skippedNoRawArea++;
      }
      purchasesToUpsert.push({ unleashOrderGuid: order.Guid, orderNumber: order.OrderNumber, orderDate: order.OrderDate, hospitalId, areaId, customerRef: order.CustomerRef, rawAreaText, orderStatus: order.OrderStatus });
      if (!areaId && rawAreaText) pendingMatchesToCreate.push({ rawAreaText, orderGuid: order.Guid });
    }
    console.log(`[Sync ${syncLogId}] Order processing: ${skippedNoEndurocide} skipped (no Endurocide products), ${skippedNoHospital} skipped (no hospital), ${skippedNoRawArea} skipped (no area text), ${matchedToArea} matched to existing areas, ${pendingMatchesToCreate.length} need matching`);
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 3`);
      return;
    }
    
    // Step 4: Batch upsert purchases
    await updateSyncProgress(syncLogId, 'Step 4/6', `Saving ${purchasesToUpsert.length} purchases...`);
    console.log(`[Sync ${syncLogId}] Step 4: Upserting ${purchasesToUpsert.length} purchases...`);
    await db.batchUpsertPurchases(purchasesToUpsert);
    recordsProcessed += purchasesToUpsert.length;
    console.log(`[Sync ${syncLogId}] Purchases upserted`);
    
    // Check for cancellation
    if (await checkSyncCancelled(syncLogId)) {
      console.log(`[Sync ${syncLogId}] Cancelled after step 4`);
      return;
    }
    
    // Step 5: Get all purchases for mapping and create pending matches
    await updateSyncProgress(syncLogId, 'Step 5/6', 'Creating pending matches...');
    console.log(`[Sync ${syncLogId}] Step 5: Creating pending matches...`);
    const allPurchases = await db.getAllPurchases();
    const purchaseMap = new Map<string, number>();
    // Normalize GUIDs to lowercase for case-insensitive matching
    for (const p of allPurchases) purchaseMap.set(p.unleashOrderGuid.toLowerCase(), p.id);
    
    // Batch create pending matches
    const pendingMatchInserts: Parameters<typeof db.batchCreatePendingMatches>[0] = [];
    for (const pm of pendingMatchesToCreate) {
      const purchaseId = purchaseMap.get(pm.orderGuid.toLowerCase());
      if (purchaseId) pendingMatchInserts.push({ purchaseId, rawAreaText: pm.rawAreaText, status: 'pending' });
    }
    await db.batchCreatePendingMatches(pendingMatchInserts);
    
    console.log(`[Sync ${syncLogId}] Created ${pendingMatchInserts.length} pending matches`);
    
    // Step 6: Process order lines (already fetched in Step 3b)
    await updateSyncProgress(syncLogId, 'Step 6/6', `Processing ${allLines.length} order lines...`);
    console.log(`[Sync ${syncLogId}] Step 6: Processing ${allLines.length} order lines...`);
    if (allLines.length > 0) {
      await updateSyncProgress(syncLogId, 'Step 6/6', 'Fetching product catalog...');
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
        lineInserts.push({ purchaseId, unleashProductGuid: line.ProductGuid, productCode: product.ProductCode, productDescription: product.ProductDescription, productType: parsed.type, productSize: parsed.size, productColor: parsed.color, quantity: String(line.OrderQuantity), unitPrice: String(line.UnitPrice) });
      }
      console.log(`[Sync ${syncLogId}] Line processing: ${lineInserts.length} to insert, skipped: ${skippedNoPurchase} no purchase, ${skippedNoProduct} no product`);
      if (lineInserts.length > 0) {
        await updateSyncProgress(syncLogId, 'Step 6/6', `Saving ${lineInserts.length} purchase lines...`);
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
  }),

  areas: router({
    list: protectedProcedure.query(async () => db.getAllAreas()),
    byHospital: protectedProcedure.input(z.object({ hospitalId: z.number() })).query(async ({ input }) => db.getAreasByHospital(input.hospitalId)),
    create: protectedProcedure.input(z.object({ hospitalId: z.number(), name: z.string(), normalizedName: z.string().optional() })).mutation(async ({ input }) => db.createArea({ hospitalId: input.hospitalId, name: input.name, normalizedName: input.normalizedName })),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().optional(), normalizedName: z.string().optional(), isConfirmed: z.boolean().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await db.updateArea(id, data); return { success: true }; }),
    addAlias: protectedProcedure.input(z.object({ areaId: z.number(), alias: z.string() })).mutation(async ({ input }) => { await db.addAreaAlias({ areaId: input.areaId, alias: input.alias }); return { success: true }; }),
    getAliases: protectedProcedure.input(z.object({ areaId: z.number() })).query(async ({ input }) => db.getAliasesForArea(input.areaId)),
  }),

  reorders: router({
    statuses: protectedProcedure.query(async () => db.getAreaReorderStatuses()),
    byStatus: protectedProcedure.input(z.object({ status: z.enum(['overdue', 'due_soon', 'on_track', 'no_purchase']) })).query(async ({ input }) => { const all = await db.getAreaReorderStatuses(); return all.filter(s => s.status === input.status); }),
  }),

  forecasts: router({
    list: protectedProcedure.query(async () => db.getStockForecasts()),
    byHospital: protectedProcedure.input(z.object({ hospitalId: z.number() })).query(async ({ input }) => { const all = await db.getStockForecasts(); return all.filter(f => f.hospitalId === input.hospitalId); }),
    summary: protectedProcedure.query(async () => {
      const forecasts = await db.getStockForecasts();
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

  matches: router({
    pending: protectedProcedure.query(async () => db.getPendingMatches()),
    confirm: protectedProcedure.input(z.object({ matchId: z.number(), areaId: z.number(), addAlias: z.boolean().optional() })).mutation(async ({ input }) => {
      const matches = await db.getPendingMatches();
      const match = matches.find(m => m.id === input.matchId);
      if (!match) throw new Error("Match not found");
      await db.updatePurchase(match.purchaseId, { areaId: input.areaId });
      if (input.addAlias && match.rawAreaText) await db.addAreaAlias({ areaId: input.areaId, alias: match.rawAreaText });
      await db.updatePendingMatch(input.matchId, { status: 'confirmed', resolvedAt: new Date() });
      return { success: true };
    }),
    createNewArea: protectedProcedure.input(z.object({ matchId: z.number(), hospitalId: z.number(), areaName: z.string() })).mutation(async ({ input }) => {
      const matches = await db.getPendingMatches();
      const match = matches.find(m => m.id === input.matchId);
      if (!match) throw new Error("Match not found");
      const area = await db.createArea({ hospitalId: input.hospitalId, name: input.areaName, isConfirmed: true });
      await db.updatePurchase(match.purchaseId, { areaId: area.id });
      if (match.rawAreaText && match.rawAreaText !== input.areaName) await db.addAreaAlias({ areaId: area.id, alias: match.rawAreaText });
      await db.updatePendingMatch(input.matchId, { status: 'new_area', resolvedAt: new Date() });
      return { success: true, areaId: area.id };
    }),
    reject: protectedProcedure.input(z.object({ matchId: z.number() })).mutation(async ({ input }) => { await db.updatePendingMatch(input.matchId, { status: 'rejected', resolvedAt: new Date() }); return { success: true }; }),
    exclude: protectedProcedure.input(z.object({ matchId: z.number(), reason: z.string().optional() })).mutation(async ({ input }) => {
      const matches = await db.getPendingMatches();
      const match = matches.find(m => m.id === input.matchId);
      if (!match) throw new Error("Match not found");
      await db.excludePurchase(match.purchaseId, input.reason);
      await db.updatePendingMatch(input.matchId, { status: 'rejected', resolvedAt: new Date() });
      return { success: true };
    }),
    excluded: protectedProcedure.query(async () => db.getExcludedPurchases()),
    unexclude: protectedProcedure.input(z.object({ purchaseId: z.number() })).mutation(async ({ input }) => {
      await db.unexcludePurchase(input.purchaseId);
      return { success: true };
    }),
    getLlmSuggestion: protectedProcedure.input(z.object({ 
      rawAreaText: z.string(), 
      customerRef: z.string().optional(),
      hospitalName: z.string().optional(),
      existingAreas: z.array(z.object({ id: z.number(), name: z.string(), hospitalName: z.string() })) 
    })).mutation(async ({ input }) => {
      // If no existing areas, suggest creating a new one
      if (!input.existingAreas || input.existingAreas.length === 0) {
        // Extract a clean area name from the raw text
        const cleanName = input.rawAreaText
          .replace(/^\d+[-\s]*/g, '') // Remove leading numbers
          .replace(/^PO\s*\d+[-\s]*/gi, '') // Remove PO numbers
          .replace(/^\d{4,}[-\s]*/g, '') // Remove long number prefixes
          .trim();
        return {
          bestMatchId: null,
          confidence: 100,
          reasoning: "No existing areas for this hospital. This should be created as a new area.",
          isNewArea: true,
          suggestedName: cleanName || input.rawAreaText
        };
      }
      
      // Build a more detailed prompt with customerRef context
      const prompt = `You are matching a hospital order to an existing area.

Hospital: ${input.hospitalName || 'Unknown'}
Original Reference: "${input.customerRef || input.rawAreaText}"
Extracted Area Text: "${input.rawAreaText}"

Existing areas for this hospital:
${input.existingAreas.map(a => `- ID ${a.id}: "${a.name}"`).join('\n')}

Task: Find the best matching existing area, or suggest this is a new area.
- Look for partial matches (e.g., "Ward 3" matches "Ward 3 - Level 2")
- Look for abbreviations (e.g., "ICU" matches "Intensive Care Unit")
- Look for similar names with different formatting
- If no good match exists, suggest creating a new area with a clean name

Respond with JSON: {bestMatchId: number|null, confidence: 0-100, reasoning: string, isNewArea: boolean, suggestedName: string}`;
      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: "Match hospital area names. Respond with valid JSON." }, { role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "area_match", strict: true, schema: { type: "object", properties: { bestMatchId: { type: ["integer", "null"] }, confidence: { type: "integer" }, reasoning: { type: "string" }, isNewArea: { type: "boolean" }, suggestedName: { type: "string" } }, required: ["bestMatchId", "confidence", "reasoning", "isNewArea", "suggestedName"], additionalProperties: false } } } });
        const content = response?.choices?.[0]?.message?.content;
        if (content && typeof content === 'string') return JSON.parse(content);
        // If no content, return a default suggestion
        return {
          bestMatchId: null,
          confidence: 50,
          reasoning: "Could not analyze. Consider creating as a new area.",
          isNewArea: true,
          suggestedName: input.rawAreaText
        };
      } catch (error) { 
        console.error("LLM suggestion failed:", error);
        return {
          bestMatchId: null,
          confidence: 0,
          reasoning: "AI analysis failed. Please select manually.",
          isNewArea: true,
          suggestedName: input.rawAreaText
        };
      }
      return null;
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

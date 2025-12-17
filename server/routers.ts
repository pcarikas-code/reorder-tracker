import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as synchub from "./synchub";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";

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
    getLlmSuggestion: protectedProcedure.input(z.object({ rawAreaText: z.string(), existingAreas: z.array(z.object({ id: z.number(), name: z.string(), hospitalName: z.string() })) })).mutation(async ({ input }) => {
      const prompt = `Match hospital area names. Raw text: "${input.rawAreaText}". Existing areas:\n${input.existingAreas.map(a => `- ID ${a.id}: "${a.name}" at ${a.hospitalName}`).join('\n')}\nRespond JSON: {bestMatchId: number|null, confidence: 0-100, reasoning: string, isNewArea: boolean, suggestedName: string}`;
      try {
        const response = await invokeLLM({ messages: [{ role: "system", content: "Match hospital area names. Respond with valid JSON." }, { role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "area_match", strict: true, schema: { type: "object", properties: { bestMatchId: { type: ["integer", "null"] }, confidence: { type: "integer" }, reasoning: { type: "string" }, isNewArea: { type: "boolean" }, suggestedName: { type: "string" } }, required: ["bestMatchId", "confidence", "reasoning", "isNewArea", "suggestedName"], additionalProperties: false } } } });
        const content = response.choices[0]?.message?.content;
        if (content && typeof content === 'string') return JSON.parse(content);
      } catch (error) { console.error("LLM suggestion failed:", error); }
      return null;
    }),
  }),

  sync: router({
    status: protectedProcedure.query(async () => db.getLatestSyncLog('full')),
    run: protectedProcedure.mutation(async () => {
      const syncLog = await db.createSyncLog({ syncType: 'full', status: 'running' });
      let recordsProcessed = 0;
      try {
        const customers = await synchub.fetchCustomers();
        for (const customer of customers) { await db.upsertHospital({ unleashGuid: customer.Guid, customerCode: customer.CustomerCode, customerName: customer.CustomerName }); recordsProcessed++; }
        const orders = await synchub.fetchSalesOrders();
        const hospitalMap = new Map<string, number>();
        const allHospitals = await db.getAllHospitals();
        for (const h of allHospitals) hospitalMap.set(h.unleashGuid, h.id);
        const allAreas = await db.getAllAreas();
        const allAliases = await db.getAllAliases();
        for (const order of orders) {
          const hospitalId = hospitalMap.get(order.CustomerGuid);
          if (!hospitalId) continue;
          const rawAreaText = synchub.parseCustomerRef(order.CustomerRef);
          let areaId: number | undefined;
          if (rawAreaText) {
            const directMatch = allAreas.find(a => a.hospitalId === hospitalId && (a.name.toLowerCase() === rawAreaText.toLowerCase() || a.normalizedName?.toLowerCase() === rawAreaText.toLowerCase()));
            if (directMatch) areaId = directMatch.id;
            else { const aliasMatch = allAliases.find(al => al.alias.toLowerCase() === rawAreaText.toLowerCase()); if (aliasMatch) areaId = aliasMatch.areaId; }
          }
          const purchase = await db.upsertPurchase({ unleashOrderGuid: order.Guid, orderNumber: order.OrderNumber, orderDate: order.OrderDate, hospitalId, areaId, customerRef: order.CustomerRef, rawAreaText, orderStatus: order.OrderStatus });
          if (!areaId && rawAreaText) await db.createPendingMatch({ purchaseId: purchase.id, rawAreaText, status: 'pending' });
          recordsProcessed++;
        }
        const orderGuids = orders.map(o => o.Guid);
        if (orderGuids.length > 0) {
          const lines = await synchub.fetchSalesOrderLines(orderGuids);
          const products = await synchub.fetchProducts();
          const productMap = new Map<string, typeof products[0]>();
          for (const p of products) productMap.set(p.Guid, p);
          const purchaseMap = new Map<string, number>();
          for (const order of orders) { const purchases = await db.getPurchasesByHospital(hospitalMap.get(order.CustomerGuid) || 0); const p = purchases.find(pu => pu.unleashOrderGuid === order.Guid); if (p) purchaseMap.set(order.Guid, p.id); }
          const lineInserts: Parameters<typeof db.createPurchaseLines>[0] = [];
          for (const line of lines) {
            const purchaseId = purchaseMap.get(line.SalesOrderRemoteID);
            if (!purchaseId) continue;
            const product = productMap.get(line.ProductGuid);
            if (!product || !synchub.isSporicidalCurtain(product.ProductCode)) continue;
            const parsed = synchub.parseProductCode(product.ProductCode);
            lineInserts.push({ purchaseId, unleashProductGuid: line.ProductGuid, productCode: product.ProductCode, productDescription: product.ProductDescription, productType: parsed.type, productSize: parsed.size, productColor: parsed.color, quantity: String(line.OrderQuantity), unitPrice: String(line.UnitPrice) });
          }
          if (lineInserts.length > 0) await db.createPurchaseLines(lineInserts);
          recordsProcessed += lineInserts.length;
        }
        await db.updateSyncLog(syncLog.id, { status: 'completed', recordsProcessed, completedAt: new Date() });
        return { success: true, recordsProcessed };
      } catch (error) { await db.updateSyncLog(syncLog.id, { status: 'failed', errorMessage: String(error), completedAt: new Date() }); throw error; }
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

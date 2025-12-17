import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("reorders.statuses", () => {
  it("returns an array of area reorder statuses", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.reorders.statuses();

    expect(Array.isArray(result)).toBe(true);
    // Each status should have the expected shape
    if (result.length > 0) {
      const status = result[0];
      expect(status).toHaveProperty("areaId");
      expect(status).toHaveProperty("areaName");
      expect(status).toHaveProperty("hospitalId");
      expect(status).toHaveProperty("hospitalName");
      expect(status).toHaveProperty("status");
      expect(["overdue", "due_soon", "on_track", "no_purchase"]).toContain(status.status);
    }
  });
});

describe("hospitals.list", () => {
  it("returns an array of hospitals", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.hospitals.list();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      const hospital = result[0];
      expect(hospital).toHaveProperty("id");
      expect(hospital).toHaveProperty("customerName");
      expect(hospital).toHaveProperty("unleashGuid");
    }
  });
});

describe("areas.list", () => {
  it("returns an array of areas with hospital names", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.areas.list();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      const area = result[0];
      expect(area).toHaveProperty("id");
      expect(area).toHaveProperty("name");
      expect(area).toHaveProperty("hospitalId");
      expect(area).toHaveProperty("hospitalName");
    }
  });
});

describe("forecasts.list", () => {
  it("returns an array of stock forecasts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.forecasts.list();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      const forecast = result[0];
      expect(forecast).toHaveProperty("hospitalId");
      expect(forecast).toHaveProperty("areaId");
      expect(forecast).toHaveProperty("productType");
      expect(forecast).toHaveProperty("productSize");
      expect(forecast).toHaveProperty("expectedQuantity");
    }
  });
});

describe("forecasts.summary", () => {
  it("returns aggregated product summary", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.forecasts.summary();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      const summary = result[0];
      expect(summary).toHaveProperty("type");
      expect(summary).toHaveProperty("size");
      expect(summary).toHaveProperty("color");
      expect(summary).toHaveProperty("totalQuantity");
      expect(summary).toHaveProperty("areaCount");
    }
  });
});

describe("matches.pending", () => {
  it("returns an array of pending matches", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.matches.pending();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      const match = result[0];
      expect(match).toHaveProperty("id");
      expect(match).toHaveProperty("purchaseId");
      expect(match).toHaveProperty("rawAreaText");
      expect(match).toHaveProperty("status");
      expect(match.status).toBe("pending");
    }
  });
});

describe("sync.status", () => {
  it("returns sync status or undefined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sync.status();

    // Can be undefined if no sync has run
    if (result) {
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("syncType");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("startedAt");
    }
  });
});

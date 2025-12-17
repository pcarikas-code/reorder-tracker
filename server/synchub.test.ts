import { describe, expect, it } from "vitest";
import { testConnection, parseProductCode, parseCustomerRef } from "./synchub";

describe("synchub", () => {
  describe("testConnection", () => {
    it("should connect to Synchub SQL Azure database", async () => {
      const result = await testConnection();
      expect(result).toBe(true);
    }, 30000); // 30 second timeout for database connection
  });

  describe("parseProductCode", () => {
    it("should parse standard full width curtain code", () => {
      const result = parseProductCode("sc-fw-e-mb");
      expect(result.type).toBe("standard");
      expect(result.size).toBe("full");
      expect(result.color).toBe("Medical Blue");
    });

    it("should parse long drop medium width curtain code", () => {
      const result = parseProductCode("sld-mw-e-py");
      expect(result.type).toBe("long_drop");
      expect(result.size).toBe("medium");
      expect(result.color).toBe("Pastel Yellow");
    });

    it("should parse half width curtain code", () => {
      const result = parseProductCode("sc-hw-e-gy");
      expect(result.type).toBe("standard");
      expect(result.size).toBe("half");
      expect(result.color).toBe("Grey");
    });

    it("should handle unknown product codes", () => {
      const result = parseProductCode("unknown-product");
      expect(result.type).toBe("other");
      expect(result.size).toBe("other");
    });
  });

  describe("parseCustomerRef", () => {
    it("should extract area name from PO number format", () => {
      const result = parseCustomerRef("1578153 - Waikato PACU Lvl 3 - 2 yr replacements");
      expect(result).toBe("Waikato PACU Lvl 3");
    });

    it("should extract area name from simple format", () => {
      const result = parseCustomerRef("385808 - Transit Lounge - 2025 Reorder");
      expect(result).toBe("Transit Lounge");
    });

    it("should handle null input", () => {
      const result = parseCustomerRef(null);
      expect(result).toBeNull();
    });

    it("should handle simple area name without PO", () => {
      const result = parseCustomerRef("Emergency Department");
      expect(result).toBe("Emergency Department");
    });
  });
});

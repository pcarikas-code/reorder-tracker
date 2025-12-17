import sql from 'mssql';
import { ENV } from './_core/env';

const SCHEMA = 'unleashed_kencounleashed_12256_1';

let pool: sql.ConnectionPool | null = null;

export async function getSynchubPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const config: sql.config = {
    server: ENV.synchubServer,
    database: ENV.synchubDatabase,
    user: ENV.synchubUser,
    password: ENV.synchubPassword,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  pool = await sql.connect(config);
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const p = await getSynchubPool();
    const result = await p.request().query('SELECT 1 as test');
    return result.recordset[0]?.test === 1;
  } catch (error) {
    console.error('Synchub connection test failed:', error);
    return false;
  }
}

export interface UnleashedCustomer {
  Guid: string;
  CustomerCode: string;
  CustomerName: string;
}

export async function fetchCustomers(): Promise<UnleashedCustomer[]> {
  const p = await getSynchubPool();
  const result = await p.request().query(`
    SELECT Guid, CustomerCode, CustomerName
    FROM [${SCHEMA}].[Customer]
    WHERE IsDeleted = 0
    ORDER BY CustomerName
  `);
  return result.recordset;
}

export interface UnleashedSalesOrder {
  Guid: string;
  OrderNumber: string;
  OrderDate: Date;
  CustomerGuid: string;
  CustomerRef: string;
  Comments: string;
  OrderStatus: string;
}

export async function fetchSalesOrders(sinceDate?: Date): Promise<UnleashedSalesOrder[]> {
  const p = await getSynchubPool();
  let query = `
    SELECT Guid, OrderNumber, OrderDate, CustomerGuid, CustomerRef, Comments, OrderStatus
    FROM [${SCHEMA}].[SalesOrder]
    WHERE IsDeleted = 0
  `;
  
  if (sinceDate) {
    query += ` AND OrderDate >= @sinceDate`;
  }
  
  query += ` ORDER BY OrderDate DESC`;
  
  const request = p.request();
  if (sinceDate) {
    request.input('sinceDate', sql.DateTime, sinceDate);
  }
  
  const result = await request.query(query);
  return result.recordset;
}

export interface UnleashedSalesOrderLine {
  SalesOrderRemoteID: string;
  ProductGuid: string;
  OrderQuantity: number;
  UnitPrice: number;
  Comments: string;
}

export async function fetchSalesOrderLines(orderRemoteIds: string[]): Promise<UnleashedSalesOrderLine[]> {
  if (orderRemoteIds.length === 0) return [];
  
  const p = await getSynchubPool();
  const placeholders = orderRemoteIds.map((_, i) => `@id${i}`).join(',');
  
  const request = p.request();
  orderRemoteIds.forEach((id, i) => {
    request.input(`id${i}`, sql.NVarChar, id);
  });
  
  const result = await request.query(`
    SELECT SalesOrderRemoteID, ProductGuid, OrderQuantity, UnitPrice, Comments
    FROM [${SCHEMA}].[SalesOrderLine]
    WHERE SalesOrderRemoteID IN (${placeholders})
    AND IsDeleted = 0
  `);
  return result.recordset;
}

export interface UnleashedProduct {
  Guid: string;
  ProductCode: string;
  ProductDescription: string;
  ProductGroupGuid: string;
  ProductSubGroupGuid: string;
}

export async function fetchProducts(): Promise<UnleashedProduct[]> {
  const p = await getSynchubPool();
  const result = await p.request().query(`
    SELECT Guid, ProductCode, ProductDescription, ProductGroupGuid, ProductSubGroupGuid
    FROM [${SCHEMA}].[Product]
    WHERE IsDeleted = 0
    ORDER BY ProductCode
  `);
  return result.recordset;
}

export interface UnleashedProductGroup {
  Guid: string;
  GroupName: string;
  ParentGroupGuid: string | null;
}

export async function fetchProductGroups(): Promise<UnleashedProductGroup[]> {
  const p = await getSynchubPool();
  const result = await p.request().query(`
    SELECT Guid, GroupName, ParentGroupGuid
    FROM [${SCHEMA}].[ProductGroup]
    WHERE IsDeleted = 0
  `);
  return result.recordset;
}

// Parse product code to extract type, size, and color
// Check if product is a Sporicidal Curtain (sc-, smtc-, or sld- prefix)
export function isSporicidalCurtain(code: string): boolean {
  const lower = code.toLowerCase();
  return lower.startsWith('sc-') || lower.startsWith('smtc-') || lower.startsWith('sld-');
}

export function parseProductCode(code: string): { type: 'standard' | 'mesh_top' | 'long_drop' | 'other'; size: 'full' | 'medium' | 'half' | 'other'; color: string } {
  const lower = code.toLowerCase();
  
  // Determine type - Sporicidal Curtains include sc-, smtc-, and sld-
  let type: 'standard' | 'mesh_top' | 'long_drop' | 'other' = 'other';
  if (lower.startsWith('sc-')) {
    type = 'standard'; // Standard Curtains
  } else if (lower.startsWith('smtc-')) {
    type = 'mesh_top'; // Standard Mesh Top Curtains
  } else if (lower.startsWith('sld-')) {
    type = 'long_drop'; // Standard Long Drop
  }
  
  // Determine size
  let size: 'full' | 'medium' | 'half' | 'other' = 'other';
  if (lower.includes('-fw-')) {
    size = 'full';
  } else if (lower.includes('-mw-')) {
    size = 'medium';
  } else if (lower.includes('-hw-')) {
    size = 'half';
  }
  
  // Extract color (last part after final dash)
  const parts = code.split('-');
  const colorCode = parts[parts.length - 1] || '';
  
  const colorMap: Record<string, string> = {
    'gy': 'Grey',
    'la': 'Latte',
    'mb': 'Medical Blue',
    'pb': 'Pastel Blue',
    'py': 'Pastel Yellow',
    'te': 'Teal',
    'wh': 'White',
    'gbkwh': 'Geometric Black on White',
    'gbrla': 'Geometric Brown on Latte',
    'ggowh': 'Geometric Gold on White',
    'gmbpb': 'Geometric Medical Blue on Pastel Blue',
    'sdpb': 'Simply Dotty Pastel Blue',
    'sdpy': 'Simply Dotty Pastel Yellow',
    'sdwh': 'Simply Dotty White',
  };
  
  const color = colorMap[colorCode.toLowerCase()] || colorCode;
  
  return { type, size, color };
}

// Parse CustomerRef to extract area name
export function parseCustomerRef(ref: string | null): string | null {
  if (!ref) return null;
  
  // Common patterns:
  // "1578153 - Waikato PACU Lvl 3 - 2 yr replacements - Due Feb 2026"
  // "2852900 - Scott Dialysis - Room 106 screen"
  // "385808 - Transit Lounge - 2025 Reorder"
  
  const parts = ref.split(' - ');
  if (parts.length >= 2) {
    // Skip the PO number (first part if it looks like a number)
    const firstPart = parts[0].trim();
    if (/^\d+$/.test(firstPart) || /^PO-?\d+/.test(firstPart)) {
      // Return the second part as the area name
      return parts[1].trim();
    }
    // Otherwise return the first meaningful part
    return firstPart;
  }
  
  return ref.trim();
}

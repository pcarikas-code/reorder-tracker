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
    requestTimeout: 120000, // 2 minutes per query
    connectionTimeout: 30000, // 30 seconds to connect
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
  // Use LastModifiedOn for incremental sync (catches updates, not just new orders)
  let query = `
    SELECT Guid, OrderNumber, OrderDate, CustomerGuid, CustomerRef, Comments, OrderStatus
    FROM [${SCHEMA}].[SalesOrder]
    WHERE IsDeleted = 0
  `;
  
  if (sinceDate) {
    query += ` AND LastModifiedOn >= @sinceDate`;
  }
  
  query += ` ORDER BY OrderDate DESC`;
  
  const request = p.request();
  if (sinceDate) {
    request.input('sinceDate', sql.DateTime, sinceDate);
  }
  
  const result = await request.query(query);
  return result.recordset;
}

// Fetch orders in date range chunks for initial sync
export async function fetchSalesOrdersInChunks(
  startDate: Date,
  endDate: Date,
  chunkMonths: number = 6
): Promise<UnleashedSalesOrder[]> {
  const p = await getSynchubPool();
  const allOrders: UnleashedSalesOrder[] = [];
  
  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setMonth(currentEnd.getMonth() + chunkMonths);
    if (currentEnd > endDate) currentEnd.setTime(endDate.getTime());
    
    console.log(`Fetching orders from ${currentStart.toISOString()} to ${currentEnd.toISOString()}...`);
    
    const request = p.request();
    request.input('startDate', sql.DateTime, currentStart);
    request.input('endDate', sql.DateTime, currentEnd);
    
    const result = await request.query(`
      SELECT Guid, OrderNumber, OrderDate, CustomerGuid, CustomerRef, Comments, OrderStatus
      FROM [${SCHEMA}].[SalesOrder]
      WHERE IsDeleted = 0 AND OrderDate >= @startDate AND OrderDate < @endDate
      ORDER BY OrderDate DESC
    `);
    
    allOrders.push(...result.recordset);
    console.log(`Fetched ${result.recordset.length} orders for this chunk`);
    
    currentStart = new Date(currentEnd);
  }
  
  return allOrders;
}

export interface UnleashedSalesOrderLine {
  SalesOrderRemoteID: string;
  ProductGuid: string;
  OrderQuantity: number;
  UnitPrice: number;
  Comments: string;
}

// Endurocide brand GUID and Sporicidal Curtains product group
const ENDUROCIDE_BRAND_GUID = '1942038B-C337-4AA4-947B-7D2ED7F26B09';
const SPORICIDAL_CURTAINS_GROUP_GUID = 'C6345836-5C2C-4FFB-BDB9-38E305E105F5';

export async function fetchSalesOrderLines(orderRemoteIds: string[]): Promise<UnleashedSalesOrderLine[]> {
  if (orderRemoteIds.length === 0) return [];
  
  const p = await getSynchubPool();
  const allResults: UnleashedSalesOrderLine[] = [];
  
  // Process in batches of 50 (can be larger now since we filter at SQL level)
  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(orderRemoteIds.length / BATCH_SIZE);
  
  for (let i = 0; i < orderRemoteIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = orderRemoteIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, j) => `@id${j}`).join(',');
    
    // Retry logic for resilience
    let retries = 3;
    while (retries > 0) {
      try {
        const request = p.request();
        batch.forEach((id, j) => {
          request.input(`id${j}`, sql.NVarChar, id);
        });
        
        // JOIN with Product table to filter for Sporicidal Curtains only
        // Filters: Brand=Endurocide, ProductCode starts with sc-/smtc-/sld-, IsDeleted=0
        const result = await request.query(`
          SELECT sol.SalesOrderRemoteID, sol.ProductGuid, sol.OrderQuantity, sol.UnitPrice, sol.Comments
          FROM [${SCHEMA}].[SalesOrderLine] sol
          INNER JOIN [${SCHEMA}].[Product] p ON sol.ProductGuid = p.Guid
          WHERE sol.SalesOrderRemoteID IN (${placeholders})
          AND sol.IsDeleted = 0
          AND p.IsDeleted = 0
          AND (p.ProductCode LIKE 'sc-%' OR p.ProductCode LIKE 'smtc-%' OR p.ProductCode LIKE 'sld-%')
        `);
        allResults.push(...result.recordset);
        
        if (batchNum % 10 === 0 || batchNum === totalBatches) {
          console.log(`[OrderLines] Processed batch ${batchNum}/${totalBatches} (${allResults.length} curtain lines so far)`);
        }
        break; // Success, exit retry loop
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.error(`[OrderLines] Failed batch ${batchNum} after 3 retries:`, error);
          throw error;
        }
        console.warn(`[OrderLines] Batch ${batchNum} failed, retrying... (${retries} left)`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }
  }
  
  return allResults;
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
  
  let text = ref.trim();
  
  // Common PO/reference number patterns to strip from the beginning
  // Patterns: "1578153 - ", "PO123456 ", "PIN123456 ", "LKC123456 ", "RT123456: ", "FA123456: ", "M1234 ", "G1234 ", "WN123456 ", "GR123456 ", "BS123456 ", "NH123456 ", "NCR123456 "
  const poPatterns = [
    /^\d{5,}\s*[-:]\s*/i,                    // "1578153 - " or "1578153: "
    /^PO[-\s]?\d+\s*[-:]?\s*/i,              // "PO123456 " or "PO-123456: "
    /^PIN\s?\d+\s*/i,                        // "PIN123456 " or "PIN 123456"
    /^LKC\s?\d+\s*/i,                        // "LKC123456"
    /^LK\s?\d+\s*/i,                         // "LK 306 332"
    /^RT\d+\s*[-:]\s*/i,                     // "RT017751: "
    /^FA\d+\s*[-:]\s*/i,                     // "FA517097: "
    /^M\d{4,}\s*/i,                          // "M8312 "
    /^G\d{4,}\s*/i,                          // "G5518952 "
    /^WN\d+\s*/i,                            // "WN053527 "
    /^GR\d+\s*/i,                            // "GR053329 "
    /^BS\d+\s*/i,                            // "BS050652 "
    /^NH\d+\s*/i,                            // "NH074600 "
    /^NCR\s?\d+\s*/i,                        // "NCR 524915 " or "NCR524915"
    /^MT\d+\s*/i,                            // "MT525068 "
    /^SEO\d+\s*/i,                           // "SEO16023 "
    /^\d{3}-\d{2}-\d+\s*/i,                  // "030-28-168 " or "505-29-1106 "
    /^\d{6,}\s*/i,                           // "2364405: " (pure numbers at start)
  ];
  
  // Try to strip PO patterns
  for (const pattern of poPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '').trim();
      break;
    }
  }
  
  // If text still starts with a colon, strip it
  text = text.replace(/^:\s*/, '');
  
  // Protect compound words with hyphens before splitting
  // X-Ray, Pre-op, Post-op, Day-stay, etc.
  text = text.replace(/X-Ray/gi, 'X_RAY_TEMP');
  text = text.replace(/Pre-op/gi, 'PRE_OP_TEMP');
  text = text.replace(/Post-op/gi, 'POST_OP_TEMP');
  text = text.replace(/Day-stay/gi, 'DAY_STAY_TEMP');
  text = text.replace(/(\d)-yr/gi, '$1_YR_TEMP');  // "2-yr" -> "2_YR_TEMP"
  
  // Split by common delimiters and find the meaningful area name part
  // The area name is usually after the PO number and before date/replacement suffixes
  const parts = text.split(/\s*[-–]\s*/);
  
  // Find the best part that looks like an area name (not a number, not a date suffix)
  const suffixPatterns = /^(2\s*y(ea)?r?|\d_YR_TEMP|reorder|replacement|changeover|install|due|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|\d{4}|D)$/i;
  const numberOnlyPattern = /^[\d\s&]+$/;
  
  let bestPart = '';
  for (const part of parts) {
    const trimmed = part.trim();
    // Skip empty parts, pure numbers, and suffix patterns
    if (!trimmed || trimmed.length < 2) continue;
    if (numberOnlyPattern.test(trimmed)) continue;
    if (suffixPatterns.test(trimmed)) continue;
    
    // This looks like a meaningful part
    if (!bestPart) {
      bestPart = trimmed;
    } else {
      // If we already have a part, only replace if this one has area keywords
      const hasAreaKeyword = /ward|unit|icu|pacu|theatre|clinic|room|rm|bed|floor|level|lvl|endoscopy|dialysis|radiology|recovery|surgery|surgical|medical|med|ortho|stroke|children|maternity|emergency|ed|er|day\s*stay|pre-?op|post-?op|ccu|nicu|mapu|atu|ssu|ssr|ctu|outpatient|inpatient|x-?ray|procedure|admission/i;
      if (hasAreaKeyword.test(trimmed)) {
        bestPart = trimmed;
      }
    }
  }
  
  text = bestPart || parts[0]?.trim() || text;
  
  // Restore protected compound words
  text = text.replace(/X_RAY_TEMP/gi, 'X-Ray');
  text = text.replace(/PRE_OP_TEMP/gi, 'Pre-op');
  text = text.replace(/POST_OP_TEMP/gi, 'Post-op');
  text = text.replace(/DAY_STAY_TEMP/gi, 'Day-stay');
  text = text.replace(/(\d)_YR_TEMP/gi, '$1-yr');
  
  // Filter out non-area entries (exact matches or contains)
  const nonAreaPatterns = [
    /spares?/i,  // Any entry containing "spare" or "spares"
    /^hooks?$/i,
    /^glides?$/i,
    /^curtain\s*(hooks?|recycle)/i,
    /^recycl/i,
    /^shower\s*curtains?$/i,
    /^extras?$/i,
    /^balance$/i,
    /^install/i,
    /^per\s/i,                               // "per Carolyn Peckston phone call"
  ];
  
  for (const pattern of nonAreaPatterns) {
    if (pattern.test(text)) {
      return null; // This is not an area name
    }
  }
  
  // Filter out entries that look like person names (First Last pattern with no other context)
  // But keep entries like "Ward 1", "ICU", "PACU Lvl 3"
  const looksLikePersonName = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/;
  const hasAreaKeyword = /ward|unit|icu|pacu|theatre|clinic|hospital|room|bed|floor|level|lvl|endoscopy|dialysis|radiology|recovery|surgery|surgical|medical|med|ortho|stroke|children|maternity|emergency|ed|er|day\s*stay|pre-?op|post-?op|ccu|nicu|mapu|atu|ssu|ssr|ctu/i;
  
  if (looksLikePersonName.test(text) && !hasAreaKeyword.test(text)) {
    return null; // Likely a person name, not an area
  }
  
  // Clean up common suffixes that aren't part of the area name
  text = text.replace(/\s*\d-yr\s*(changeover|replacement|install)?s?$/i, '').trim();
  text = text.replace(/\s*2\s*y(ea)?r?\s*(replace(ment)?s?|changeover|install)?$/i, '').trim();
  text = text.replace(/\s*reorder$/i, '').trim();
  text = text.replace(/\s*due\s+\w+\s+\d{4}$/i, '').trim();
  
  // If nothing meaningful left, return null
  if (!text || text.length < 2) {
    return null;
  }
  
  return text;
}

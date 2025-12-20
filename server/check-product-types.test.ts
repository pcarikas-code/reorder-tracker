import { describe, it, expect } from 'vitest';
import { getDb } from './db';
import { purchaseLines } from '../drizzle/schema';
import { sql } from 'drizzle-orm';

describe('Product Type Distribution', () => {
  it('should show the distribution of product types', async () => {
    const db = await getDb();
    if (!db) {
      console.log('No database connection');
      return;
    }
    
    const result = await db.execute(sql`
      SELECT productType, COUNT(*) as count, SUM(quantity) as total_qty 
      FROM purchaseLines 
      GROUP BY productType 
      ORDER BY count DESC
    `);
    
    console.log('Product Type Distribution:');
    console.log(JSON.stringify(result, null, 2));
  });
  
  it('should show sample products for each type', async () => {
    const db = await getDb();
    if (!db) {
      console.log('No database connection');
      return;
    }
    
    // Sample 'other' products
    const otherSamples = await db.execute(sql`
      SELECT productCode, productDescription, quantity 
      FROM purchaseLines 
      WHERE productType = 'other' 
      LIMIT 10
    `);
    
    console.log('Sample "other" products:');
    console.log(JSON.stringify(otherSamples, null, 2));
    
    // Sample curtain products
    const curtainSamples = await db.execute(sql`
      SELECT productCode, productDescription, productType, quantity 
      FROM purchaseLines 
      WHERE productType != 'other' 
      LIMIT 10
    `);
    
    console.log('Sample curtain products:');
    console.log(JSON.stringify(curtainSamples, null, 2));
  });
});

import sql from 'mssql';
import { ENV } from '../server/_core/env.js';

const SCHEMA = 'unleashed_kencounleashed_12256_1';

const config = {
  server: ENV.synchubServer,
  database: ENV.synchubDatabase,
  user: ENV.synchubUser,
  password: ENV.synchubPassword,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  requestTimeout: 30000,
  connectionTimeout: 30000,
};

async function main() {
  const pool = await sql.connect(config);
  
  // Check for Invoice-related tables
  const tables = await pool.request().query(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = '${SCHEMA}' 
    AND TABLE_NAME LIKE '%Invoice%'
    ORDER BY TABLE_NAME
  `);
  console.log('Invoice-related tables:');
  console.log(tables.recordset);
  
  // Check SalesInvoice table columns
  const invoiceCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = '${SCHEMA}' 
    AND TABLE_NAME = 'SalesInvoice'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('\nSalesInvoice columns:');
  console.log(invoiceCols.recordset);
  
  await pool.close();
}

main().catch(console.error);

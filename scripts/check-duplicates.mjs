import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.SYNCHUB_SERVER,
  user: process.env.SYNCHUB_USER,
  password: process.env.SYNCHUB_PASSWORD,
  database: process.env.SYNCHUB_DATABASE,
  ssl: { rejectUnauthorized: true }
});

// Check duplicate order numbers in purchases
const [rows] = await connection.execute(`
  SELECT orderNumber, COUNT(*) as cnt 
  FROM purchases 
  GROUP BY orderNumber 
  ORDER BY cnt DESC 
  LIMIT 10
`);
console.log('Top 10 order numbers by count:');
console.table(rows);

// Check total purchases vs unique order numbers
const [stats] = await connection.execute(`
  SELECT 
    COUNT(*) as total_purchases,
    COUNT(DISTINCT orderNumber) as unique_orders
  FROM purchases
`);
console.log('\nStats:');
console.table(stats);

// Check specific order
const [specific] = await connection.execute(`
  SELECT id, orderNumber, unleashOrderGuid, customerRef, rawAreaText
  FROM purchases 
  WHERE orderNumber = 'SO-U-00000615'
`);
console.log('\nSO-U-00000615 purchases:');
console.table(specific);

await connection.end();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.SYNCHUB_SERVER,
  user: process.env.SYNCHUB_USER,
  password: process.env.SYNCHUB_PASSWORD,
  database: process.env.SYNCHUB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

// Check SO-U-00000892 purchase lines
const [lines] = await conn.query(`
  SELECT pl.id, pl.purchaseId, pl.productCode, pl.productDescription, pl.quantity 
  FROM purchaseLines pl 
  JOIN purchases p ON pl.purchaseId = p.id 
  WHERE p.orderNumber = 'SO-U-00000892' 
  ORDER BY pl.id
`);

console.log('=== SO-U-00000892 Purchase Lines ===');
console.log('Total lines:', lines.length);
let totalQty = 0;
for (const line of lines) {
  console.log(`  ${line.productCode}: ${line.quantity} - ${line.productDescription}`);
  totalQty += parseFloat(line.quantity);
}
console.log('Total quantity:', totalQty);

// Check if there are duplicate purchase lines
const [duplicates] = await conn.query(`
  SELECT purchaseId, productCode, COUNT(*) as cnt 
  FROM purchaseLines 
  GROUP BY purchaseId, productCode 
  HAVING cnt > 1
  LIMIT 20
`);
console.log('\n=== Duplicate Purchase Lines (same purchaseId + productCode) ===');
console.log('Found:', duplicates.length);
if (duplicates.length > 0) {
  console.log(duplicates);
}

// Check total purchase lines count
const [totalLines] = await conn.query(`SELECT COUNT(*) as cnt FROM purchaseLines`);
console.log('\n=== Total Purchase Lines ===');
console.log('Count:', totalLines[0].cnt);

// Check purchases count
const [totalPurchases] = await conn.query(`SELECT COUNT(*) as cnt FROM purchases`);
console.log('\n=== Total Purchases ===');
console.log('Count:', totalPurchases[0].cnt);

await conn.end();

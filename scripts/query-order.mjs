import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await connection.execute(`
  SELECT 
    p.id, p.orderNumber, p.orderDate, p.customerRef, p.rawAreaText,
    h.customerName as hospitalName,
    a.name as areaName,
    pl.productCode, pl.productDescription, pl.quantity, pl.unitPrice, 
    pl.productType, pl.productSize, pl.productColor
  FROM purchases p
  LEFT JOIN hospitals h ON p.hospitalId = h.id
  LEFT JOIN areas a ON p.areaId = a.id
  LEFT JOIN purchaseLines pl ON p.id = pl.purchaseId
  WHERE p.orderNumber = 'SO-U-00000546'
`);

console.log('Order SO-U-00000546 details:');
console.log('===========================');
if (rows.length > 0) {
  const first = rows[0];
  console.log(`Hospital: ${first.hospitalName}`);
  console.log(`Order Date: ${first.orderDate}`);
  console.log(`Customer Ref: ${first.customerRef}`);
  console.log(`Raw Area Text: ${first.rawAreaText}`);
  console.log(`Matched Area: ${first.areaName || 'Not matched'}`);
  console.log('');
  console.log('Product Lines:');
  rows.forEach((row, i) => {
    if (row.productCode) {
      console.log(`  ${i+1}. ${row.productCode} - ${row.productDescription}`);
      console.log(`     Qty: ${row.quantity}, Type: ${row.productType}, Size: ${row.productSize}, Color: ${row.productColor}`);
    }
  });
  if (!rows[0].productCode) {
    console.log('  (No product lines found for this order)');
  }
} else {
  console.log('Order not found in database');
}

await connection.end();

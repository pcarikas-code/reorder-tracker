// Script to clean up duplicate purchases before adding unique constraint
import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.SYNCHUB_SERVER,
    user: process.env.SYNCHUB_USER,
    password: process.env.SYNCHUB_PASSWORD,
    database: process.env.SYNCHUB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  console.log('Connected to database');

  // Step 1: Get stats
  const [stats] = await connection.execute(`
    SELECT COUNT(*) as total_purchases, COUNT(DISTINCT unleashOrderGuid) as unique_orders FROM purchases
  `);
  console.log('Current stats:', stats[0]);
  
  const duplicateCount = stats[0].total_purchases - stats[0].unique_orders;
  console.log(`Found ${duplicateCount} duplicate purchases to remove`);

  if (duplicateCount === 0) {
    console.log('No duplicates found, exiting');
    await connection.end();
    return;
  }

  // Step 2: Delete pending matches for duplicate purchases (keep only the first one per order)
  console.log('Deleting pending matches for duplicate purchases...');
  const [pmResult] = await connection.execute(`
    DELETE pm FROM pendingMatches pm
    INNER JOIN purchases p ON pm.purchaseId = p.id
    WHERE p.id NOT IN (
      SELECT MIN(id) FROM purchases GROUP BY unleashOrderGuid
    )
  `);
  console.log(`Deleted ${pmResult.affectedRows} pending matches`);

  // Step 3: Delete purchase lines for duplicate purchases
  console.log('Deleting purchase lines for duplicate purchases...');
  const [plResult] = await connection.execute(`
    DELETE pl FROM purchaseLines pl
    INNER JOIN purchases p ON pl.purchaseId = p.id
    WHERE p.id NOT IN (
      SELECT * FROM (SELECT MIN(id) FROM purchases GROUP BY unleashOrderGuid) as keep_ids
    )
  `);
  console.log(`Deleted ${plResult.affectedRows} purchase lines`);

  // Step 4: Delete duplicate purchases (keep the first one per order)
  console.log('Deleting duplicate purchases...');
  const [pResult] = await connection.execute(`
    DELETE FROM purchases
    WHERE id NOT IN (
      SELECT * FROM (SELECT MIN(id) FROM purchases GROUP BY unleashOrderGuid) as keep_ids
    )
  `);
  console.log(`Deleted ${pResult.affectedRows} duplicate purchases`);

  // Step 5: Verify
  const [newStats] = await connection.execute(`
    SELECT COUNT(*) as total_purchases, COUNT(DISTINCT unleashOrderGuid) as unique_orders FROM purchases
  `);
  console.log('New stats:', newStats[0]);
  console.log('Cleanup complete!');

  await connection.end();
}

main().catch(console.error);

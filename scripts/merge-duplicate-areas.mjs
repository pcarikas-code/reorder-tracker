// Script to merge duplicate areas (same hospitalId + name)
// Keeps the oldest area and moves all purchases to it

import mysql from 'mysql2/promise';

const config = {
  host: process.env.SYNCHUB_SERVER,
  user: process.env.SYNCHUB_USER,
  password: process.env.SYNCHUB_PASSWORD,
  database: process.env.SYNCHUB_DATABASE,
  ssl: { rejectUnauthorized: true }
};

async function mergeDuplicateAreas() {
  const connection = await mysql.createConnection(config);
  
  try {
    // Find duplicate areas (same hospitalId + name)
    const [duplicates] = await connection.execute(`
      SELECT hospitalId, name, COUNT(*) as count, GROUP_CONCAT(id ORDER BY createdAt ASC) as ids
      FROM areas
      GROUP BY hospitalId, name
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Found ${duplicates.length} duplicate area groups to merge`);
    
    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // Keep the oldest one
      const removeIds = ids.slice(1);
      
      console.log(`Merging area "${dup.name}" (hospital ${dup.hospitalId}): keeping ${keepId}, removing ${removeIds.join(', ')}`);
      
      // Update purchases to point to the kept area
      for (const removeId of removeIds) {
        const [updateResult] = await connection.execute(
          'UPDATE purchases SET areaId = ? WHERE areaId = ?',
          [keepId, removeId]
        );
        console.log(`  Moved ${updateResult.affectedRows} purchases from area ${removeId} to ${keepId}`);
      }
      
      // Delete the duplicate areas
      const [deleteResult] = await connection.execute(
        `DELETE FROM areas WHERE id IN (${removeIds.join(',')})`,
        []
      );
      console.log(`  Deleted ${deleteResult.affectedRows} duplicate areas`);
    }
    
    console.log('Done merging duplicate areas');
    
  } finally {
    await connection.end();
  }
}

mergeDuplicateAreas().catch(console.error);

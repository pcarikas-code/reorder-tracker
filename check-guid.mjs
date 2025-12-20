import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.SYNCHUB_SERVER,
  user: process.env.SYNCHUB_USER,
  password: process.env.SYNCHUB_PASSWORD,
  database: process.env.SYNCHUB_DATABASE,
  ssl: { rejectUnauthorized: true }
});

const [rows] = await conn.execute(
  "SELECT id, orderNumber, unleashOrderGuid FROM purchases WHERE orderNumber = 'SO-U-00000916' LIMIT 1"
);
console.log('Purchase data:', rows);
await conn.end();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT a.id, a.name, h.customerName as hospitalName FROM areas a JOIN hospitals h ON a.hospitalId = h.id WHERE a.name LIKE '%SSR%'");
console.log("Areas with SSR:");
console.log(rows);
await conn.end();

// Crea usuarios de prueba y stock inicial.  Uso: npm run seed
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  const h = await bcrypt.hash('Hielo2026!', 10);
  const usuarios = [
    ['Administrador La Nevada', 'admin@iceroute.com', '900000001', 'admin'],
    ['Carlos Rojas', 'repartidor@iceroute.com', '900000002', 'repartidor'],
    ['Pedro Álvarez', 'cliente@iceroute.com', '900000003', 'cliente'],
  ];
  for (const [n, e, t, r] of usuarios) {
    await db.query('INSERT IGNORE INTO usuario (nombres,email,telefono,password,rol) VALUES (?,?,?,?,?)', [n, e, t, h, r]);
  }
  await db.query('INSERT IGNORE INTO repartidor (id_usuario) SELECT id_usuario FROM usuario WHERE email="repartidor@iceroute.com"');
  await db.query('INSERT IGNORE INTO cliente (id_usuario) SELECT id_usuario FROM usuario WHERE email="cliente@iceroute.com"');
  const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM movimiento_kardex');
  if (!n) {
    const [[a]] = await db.query('SELECT id_usuario FROM usuario WHERE email="admin@iceroute.com"');
    await db.query('INSERT INTO movimiento_kardex (tipo_movimiento,cantidad,observacion,id_tipo_hielo,id_usuario) SELECT "ENTRADA",200,"Stock inicial",id_tipo_hielo,? FROM tipo_hielo', [a.id_usuario]);
  }
  console.log('Listo. Clave de los 3 usuarios: Hielo2026!');
  console.log('admin@iceroute.com | repartidor@iceroute.com | cliente@iceroute.com');
  process.exit();
})();

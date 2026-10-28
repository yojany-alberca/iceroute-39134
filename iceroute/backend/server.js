require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors(), express.json({ limit: '1mb' }));

const db = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS,
  database: process.env.DB_NAME, dateStrings: true, connectionLimit: 10,
});

const BLOQUES = ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00'];
const CUPOS_POR_BLOQUE = 10;
const ACTIVOS = ['Pendiente', 'Asignado', 'En camino'];
const RE_PASS = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (res, code, msg) => res.status(code).json({ error: msg });
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  fail(res, 500, 'Ocurrió un error en el servidor. Intenta de nuevo.');
});

// ---------- Seguridad ----------
const auth = (...roles) => async (req, res, next) => {
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    const d = jwt.verify(t, process.env.JWT_SECRET);
    const [[u]] = await db.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario=?', [d.id]);
    if (!u || !u.activo) return fail(res, 401, 'Tu sesión expiró. Inicia sesión nuevamente.');
    if (roles.length && !roles.includes(u.rol)) return fail(res, 403, 'No tienes permiso para esta acción');
    req.user = { id: u.id_usuario, rol: u.rol };
    next();
  } catch { fail(res, 401, 'Tu sesión expiró. Inicia sesión nuevamente.'); }
};

const idCliente = async (uid) => (await db.query('SELECT id_cliente FROM cliente WHERE id_usuario=?', [uid]))[0][0]?.id_cliente;
const idRepartidor = async (uid) => (await db.query('SELECT id_repartidor FROM repartidor WHERE id_usuario=?', [uid]))[0][0]?.id_repartidor;

async function saldo(conn, idTipo) {
  const [[r]] = await conn.query(
    "SELECT COALESCE(SUM(IF(tipo_movimiento='ENTRADA',cantidad,-cantidad)),0) AS s FROM movimiento_kardex WHERE id_tipo_hielo=?", [idTipo]);
  return Number(r.s);
}

async function devolverStock(conn, idPedido, uid, motivo) {
  await conn.query(
    `INSERT INTO movimiento_kardex (tipo_movimiento,cantidad,observacion,id_tipo_hielo,id_usuario)
     SELECT 'ENTRADA', cantidad, ?, id_tipo_hielo, ? FROM detalle_pedido WHERE id_pedido=?`,
    [`${motivo} pedido #${idPedido}`, uid, idPedido]);
}

// ---------- Hoja de ruta ----------
async function reordenarRuta(conn, idRuta) {
  const [rows] = await conn.query(
    `SELECT dr.id_pedido, p.hora_entrega FROM detalle_ruta dr JOIN pedido p ON p.id_pedido=dr.id_pedido
     WHERE dr.id_ruta=? ORDER BY p.hora_entrega, p.id_pedido`, [idRuta]);
  await conn.query('DELETE FROM detalle_ruta WHERE id_ruta=?', [idRuta]);
  for (let i = 0; i < rows.length; i++) {
    await conn.query('INSERT INTO detalle_ruta (id_ruta,secuencia,id_pedido,hora_estimada) VALUES (?,?,?,?)',
      [idRuta, i + 1, rows[i].id_pedido, rows[i].hora_entrega.slice(0, 5) + ':00']);
  }
}
async function quitarDeRuta(conn, idPedido) {
  const [[d]] = await conn.query('SELECT id_ruta FROM detalle_ruta WHERE id_pedido=?', [idPedido]);
  if (!d) return;
  await conn.query('DELETE FROM detalle_ruta WHERE id_pedido=?', [idPedido]);
  await reordenarRuta(conn, d.id_ruta);
}

// =====================================================================
//  CUENTAS
// =====================================================================
app.post('/auth/registro', wrap(async (req, res) => {
  const { nombres, telefono, email, password } = req.body;
  if (!nombres?.trim() || !telefono?.trim() || !email?.trim() || !password) return fail(res, 400, 'Completa todos los campos');
  if (!RE_MAIL.test(email)) return fail(res, 400, 'Ingresa un correo válido');
  if (!/^\+?[\d\s]{7,15}$/.test(telefono)) return fail(res, 400, 'Ingresa un número de celular válido');
  if (!RE_PASS.test(password)) return fail(res, 400, 'Esta contraseña no es suficientemente segura. Se pide un mínimo de 8 caracteres, una mayúscula y un carácter especial');
  const [[dup]] = await db.query('SELECT email, telefono FROM usuario WHERE email=? OR telefono=?', [email.toLowerCase(), telefono.trim()]);
  if (dup) return fail(res, 409, dup.email === email.toLowerCase() ? 'Este correo ya pertenece a una cuenta' : 'Este número de celular ya está registrado');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const hash = await bcrypt.hash(password, 10);
    const [r] = await conn.query('INSERT INTO usuario (nombres,email,telefono,password,rol) VALUES (?,?,?,?,"cliente")',
      [nombres.trim(), email.toLowerCase(), telefono.trim(), hash]);
    await conn.query('INSERT INTO cliente (id_usuario) VALUES (?)', [r.insertId]);
    await conn.commit();
    const token = jwt.sign({ id: r.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: r.insertId, nombres: nombres.trim(), email: email.toLowerCase(), telefono: telefono.trim(), rol: 'cliente' } });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return fail(res, 400, 'Ingresa tu correo y contraseña');
  const [[u]] = await db.query('SELECT *, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueado FROM usuario WHERE email=?', [email.toLowerCase().trim()]);
  if (!u) return fail(res, 404, 'Este correo no pertenece a una cuenta existente');
  if (!u.activo) return fail(res, 403, 'Tu cuenta está inhabilitada. Comunícate con el administrador.');
  if (u.bloqueado) return res.status(423).json({ error: 'bloqueado' });
  if (!(await bcrypt.compare(password, u.password))) {
    const n = u.intentos_fallidos + 1;
    if (n >= 3) {
      await db.query('UPDATE usuario SET intentos_fallidos=0, bloqueado_hasta=DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id_usuario=?', [u.id_usuario]);
      return res.status(423).json({ error: 'bloqueado' });
    }
    await db.query('UPDATE usuario SET intentos_fallidos=? WHERE id_usuario=?', [n, u.id_usuario]);
    return fail(res, 401, 'Contraseña incorrecta');
  }
  await db.query('UPDATE usuario SET intentos_fallidos=0, bloqueado_hasta=NULL WHERE id_usuario=?', [u.id_usuario]);
  const token = jwt.sign({ id: u.id_usuario }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: u.id_usuario, nombres: u.nombres, email: u.email, telefono: u.telefono, rol: u.rol } });
}));

app.get('/me', auth(), wrap(async (req, res) => {
  const [[u]] = await db.query('SELECT id_usuario AS id, nombres, email, telefono, rol FROM usuario WHERE id_usuario=?', [req.user.id]);
  if (u.rol === 'repartidor') u.disponible = !!(await db.query('SELECT disponible FROM repartidor WHERE id_usuario=?', [u.id]))[0][0]?.disponible;
  res.json(u);
}));

app.put('/disponibilidad', auth('repartidor'), wrap(async (req, res) => {
  await db.query('UPDATE repartidor SET disponible=? WHERE id_usuario=?', [req.body.disponible ? 1 : 0, req.user.id]);
  res.json({ ok: true });
}));

// =====================================================================
//  CATÁLOGO
// =====================================================================
app.get('/catalogo', auth(), wrap(async (_, res) => {
  const [tipos] = await db.query(
    `SELECT t.id_tipo_hielo, t.descripcion, t.unidad_medida, t.precio, s.saldo_actual AS stock
     FROM tipo_hielo t JOIN v_saldo_inventario s ON s.id_tipo_hielo=t.id_tipo_hielo ORDER BY t.id_tipo_hielo`);
  const [distritos] = await db.query('SELECT * FROM distrito ORDER BY nombre_distrito');
  res.json({ tipos, distritos, bloques: BLOQUES });
}));

// =====================================================================
//  PEDIDOS
// =====================================================================
app.post('/pedidos', auth('cliente'), wrap(async (req, res) => {
  const { items, direccion, referencia, id_distrito, lat, lng, fecha, hora } = req.body;
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Selecciona al menos un producto');
  if (!direccion?.trim()) return fail(res, 400, 'Ingresa la dirección de entrega');
  if (referencia && referencia.length > 180) return fail(res, 400, 'La referencia no puede superar 180 caracteres');
  if (referencia && /[<>{}]/.test(referencia)) return fail(res, 400, 'La referencia contiene caracteres no permitidos');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return fail(res, 400, 'Elige la fecha de entrega');
  const f = new Date(fecha + 'T00:00:00'); const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (f < hoy) return fail(res, 400, 'La fecha de entrega no puede ser anterior a hoy');
  if (f.getDay() === 0) return fail(res, 400, 'Los domingos no hay reparto. Elige otro día');
  if ((f - hoy) / 86400000 > 30) return fail(res, 400, 'Solo se puede programar hasta 30 días');
  if (!BLOQUES.includes(hora)) return fail(res, 400, 'Elige un horario de entrega');

  const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM pedido WHERE fecha_entrega=? AND hora_entrega=? AND estado_pedido<>'Cancelado'", [fecha, hora]);
  if (n >= CUPOS_POR_BLOQUE) return fail(res, 409, 'Este horario ya no tiene cupos. Elige otro.');

  const cid = await idCliente(req.user.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0; const lineas = [];
    for (const it of items) {
      const cant = parseInt(it.cantidad, 10);
      if (!(cant > 0)) throw Object.assign(new Error('La cantidad debe ser mayor a 0'), { http: 400 });
      if (cant > 500) throw Object.assign(new Error('La cantidad solicitada es demasiado alta. Comunícate con la empresa'), { http: 400 });
      const [[t]] = await conn.query('SELECT * FROM tipo_hielo WHERE id_tipo_hielo=? FOR UPDATE', [it.id_tipo_hielo]);
      if (!t) throw Object.assign(new Error('Producto no válido'), { http: 400 });
      const disp = await saldo(conn, t.id_tipo_hielo);
      if (disp < cant) throw Object.assign(new Error(`No hay stock suficiente de ${t.descripcion} (disponible: ${disp})`), { http: 409 });
      total += Number(t.precio) * cant;
      lineas.push([t.id_tipo_hielo, cant, t.precio, t.descripcion]);
    }
    const [r] = await conn.query(
      `INSERT INTO pedido (id_cliente,direccion_entrega,referencia,id_distrito,lat,lng,fecha_entrega,hora_entrega,total)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [cid, direccion.trim(), referencia?.trim() || null, id_distrito || null, lat || null, lng || null, fecha, hora, total]);
    for (let i = 0; i < lineas.length; i++) {
      const [tipo, cant, precio] = lineas[i];
      await conn.query('INSERT INTO detalle_pedido (id_pedido,num_linea,id_tipo_hielo,cantidad,precio_unitario) VALUES (?,?,?,?,?)', [r.insertId, i + 1, tipo, cant, precio]);
      await conn.query("INSERT INTO movimiento_kardex (tipo_movimiento,cantidad,observacion,id_tipo_hielo,id_usuario) VALUES ('SALIDA',?,?,?,?)",
        [cant, `Reserva pedido #${r.insertId}`, tipo, req.user.id]);
    }
    await conn.query('UPDATE cliente SET direccion=COALESCE(direccion,?), id_distrito=COALESCE(id_distrito,?) WHERE id_cliente=?', [direccion.trim(), id_distrito || null, cid]);
    await conn.commit();
    res.json({ id_pedido: r.insertId, total });
  } catch (e) {
    await conn.rollback();
    if (e.http) return fail(res, e.http, e.message);
    throw e;
  } finally { conn.release(); }
}));

app.get('/pedidos', auth(), wrap(async (req, res) => {
  const { vista = 'activos', q = '' } = req.query;
  const where = []; const params = [];
  if (req.user.rol === 'cliente') { where.push('p.id_cliente=?'); params.push(await idCliente(req.user.id)); }
  if (req.user.rol === 'repartidor') { where.push('p.id_repartidor=?'); params.push(await idRepartidor(req.user.id)); }
  where.push(vista === 'activos' ? "p.estado_pedido IN ('Pendiente','Asignado','En camino')" : "p.estado_pedido NOT IN ('Pendiente','Asignado','En camino')");
  if (q.trim()) {
    where.push('(p.id_pedido=? OR u.nombres LIKE ? OR p.direccion_entrega LIKE ?)');
    params.push(parseInt(q, 10) || 0, `%${q}%`, `%${q}%`);
  }
  const [rows] = await db.query(
    `SELECT p.id_pedido, p.estado_pedido AS estado, p.direccion_entrega, p.fecha_entrega, p.hora_entrega, p.total,
            p.lat, p.lng, u.nombres AS cliente, ur.nombres AS repartidor, dr.secuencia
     FROM pedido p JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
     LEFT JOIN repartidor r ON r.id_repartidor=p.id_repartidor LEFT JOIN usuario ur ON ur.id_usuario=r.id_usuario
     LEFT JOIN detalle_ruta dr ON dr.id_pedido=p.id_pedido
     WHERE ${where.join(' AND ')}
     ORDER BY ${vista === 'activos' ? 'p.fecha_entrega, p.hora_entrega, dr.secuencia, p.id_pedido' : 'p.id_pedido DESC'} LIMIT 200`, params);
  res.json(rows);
}));

app.get('/pedidos/:id', auth(), wrap(async (req, res) => {
  const [[p]] = await db.query(
    `SELECT p.*, u.nombres AS cliente, u.telefono AS cliente_telefono, ur.nombres AS repartidor, ur.telefono AS repartidor_telefono,
            d.nombre_distrito AS distrito, f.id_factura, e.receptor, e.fecha_hora_entrega, e.observacion AS obs_entrega,
            cal.puntaje, cal.comentario
     FROM pedido p JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
     LEFT JOIN repartidor r ON r.id_repartidor=p.id_repartidor LEFT JOIN usuario ur ON ur.id_usuario=r.id_usuario
     LEFT JOIN distrito d ON d.id_distrito=p.id_distrito LEFT JOIN factura f ON f.id_pedido=p.id_pedido
     LEFT JOIN entrega e ON e.id_pedido=p.id_pedido LEFT JOIN calificacion cal ON cal.id_pedido=p.id_pedido
     WHERE p.id_pedido=?`, [req.params.id]);
  if (!p) return fail(res, 404, 'Pedido no encontrado');
  if (req.user.rol === 'cliente' && p.id_cliente !== (await idCliente(req.user.id))) return fail(res, 403, 'Este pedido no te pertenece');
  if (req.user.rol === 'repartidor' && p.id_repartidor !== (await idRepartidor(req.user.id))) return fail(res, 403, 'Este pedido no está asignado a ti');
  const [items] = await db.query(
    `SELECT dp.num_linea, t.descripcion, t.unidad_medida, dp.cantidad, dp.precio_unitario
     FROM detalle_pedido dp JOIN tipo_hielo t ON t.id_tipo_hielo=dp.id_tipo_hielo WHERE dp.id_pedido=? ORDER BY dp.num_linea`, [p.id_pedido]);
  let ubicacion = null;
  if (p.estado_pedido === 'En camino' && p.id_repartidor) {
    [[ubicacion]] = await db.query('SELECT lat, lng, actualizado FROM ubicacion_repartidor WHERE id_repartidor=?', [p.id_repartidor]);
  }
  delete p.password;
  if (req.user.rol === 'cliente') delete p.cliente_telefono;
  res.json({ ...p, estado: p.estado_pedido, items, ubicacion: ubicacion || null });
}));

app.put('/pedidos/:id/cancelar', auth('cliente', 'admin'), wrap(async (req, res) => {
  const id = +req.params.id; const motivo = (req.body.motivo || '').trim();
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p) return fail(res, 404, 'Pedido no encontrado');
  if (req.user.rol === 'cliente' && p.id_cliente !== (await idCliente(req.user.id))) return fail(res, 403, 'Este pedido no te pertenece');
  if (req.user.rol === 'admin' && !motivo) return fail(res, 400, 'Escribe el motivo de la cancelación');
  const permitidos = req.user.rol === 'admin' ? ACTIVOS : ['Pendiente', 'Asignado'];
  if (p.estado_pedido === 'Cancelado') return fail(res, 409, 'Este pedido ya fue cancelado');
  if (!permitidos.includes(p.estado_pedido)) {
    return fail(res, 409, p.estado_pedido === 'En camino' ? 'No se puede cancelar: el pedido ya va en camino' : 'No se puede cancelar un pedido finalizado');
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE pedido SET estado_pedido='Cancelado', motivo_cancelacion=? WHERE id_pedido=?",
      [motivo || (req.user.rol === 'cliente' ? 'Cancelado por el cliente' : null), id]);
    await devolverStock(conn, id, req.user.id, 'Liberación por cancelación');
    await quitarDeRuta(conn, id);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put('/pedidos/:id/asignar', auth('admin'), wrap(async (req, res) => {
  const id = +req.params.id; const idRep = +req.body.id_repartidor;
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p) return fail(res, 404, 'Pedido no encontrado');
  if (p.estado_pedido === 'Cancelado') return fail(res, 409, 'Este pedido fue cancelado');
  if (!['Pendiente', 'Asignado'].includes(p.estado_pedido)) return fail(res, 409, 'La entrega ya está en curso o finalizada');
  const [[r]] = await db.query('SELECT * FROM repartidor WHERE id_repartidor=?', [idRep]);
  if (!r) return fail(res, 404, 'Repartidor no encontrado');
  if (!r.disponible) return fail(res, 409, 'El repartidor seleccionado no está disponible');
  if (p.id_repartidor === idRep && p.estado_pedido === 'Asignado') return fail(res, 409, 'El pedido ya está asignado a este repartidor');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await quitarDeRuta(conn, id);
    let [[ruta]] = await conn.query('SELECT id_ruta FROM ruta WHERE id_repartidor=? AND fecha_ruta=?', [idRep, p.fecha_entrega]);
    if (!ruta) {
      const [ins] = await conn.query('INSERT INTO ruta (fecha_ruta,id_repartidor) VALUES (?,?)', [p.fecha_entrega, idRep]);
      ruta = { id_ruta: ins.insertId };
    }
    const [[{ nx }]] = await conn.query('SELECT COALESCE(MAX(secuencia),0)+1 AS nx FROM detalle_ruta WHERE id_ruta=?', [ruta.id_ruta]);
    await conn.query('INSERT INTO detalle_ruta (id_ruta,secuencia,id_pedido) VALUES (?,?,?)', [ruta.id_ruta, nx, id]);
    await reordenarRuta(conn, ruta.id_ruta);
    await conn.query("UPDATE pedido SET id_repartidor=?, estado_pedido='Asignado' WHERE id_pedido=?", [idRep, id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put('/pedidos/:id/iniciar', auth('repartidor'), wrap(async (req, res) => {
  const id = +req.params.id; const rid = await idRepartidor(req.user.id);
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_repartidor !== rid) return fail(res, 403, 'Este pedido no está asignado a ti');
  if (p.estado_pedido === 'Cancelado') return fail(res, 409, 'Este pedido fue cancelado');
  if (p.estado_pedido === 'En camino') return fail(res, 409, 'Esta entrega ya fue iniciada');
  if (p.estado_pedido !== 'Asignado') return fail(res, 409, 'Esta entrega ya fue finalizada');
  await db.query("UPDATE pedido SET estado_pedido='En camino' WHERE id_pedido=?", [id]);
  await db.query("UPDATE ruta SET estado_ruta='En curso' WHERE id_repartidor=? AND fecha_ruta=?", [rid, p.fecha_entrega]);
  res.json({ ok: true });
}));

async function cerrarRutaSiTermino(conn, rid, fecha) {
  const [[{ n }]] = await conn.query(
    "SELECT COUNT(*) n FROM pedido WHERE id_repartidor=? AND fecha_entrega=? AND estado_pedido IN ('Asignado','En camino')", [rid, fecha]);
  if (!n) await conn.query("UPDATE ruta SET estado_ruta='Finalizada' WHERE id_repartidor=? AND fecha_ruta=?", [rid, fecha]);
}

app.put('/pedidos/:id/entregar', auth('repartidor'), wrap(async (req, res) => {
  const id = +req.params.id; const rid = await idRepartidor(req.user.id);
  const receptor = (req.body.receptor || '').trim();
  if (!receptor) return fail(res, 400, 'Escribe el nombre de quien recibe el pedido');
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_repartidor !== rid) return fail(res, 403, 'Este pedido no está asignado a ti');
  if (p.estado_pedido === 'Entregado') return fail(res, 409, 'Esta entrega ya fue confirmada');
  if (p.estado_pedido !== 'En camino') return fail(res, 409, 'Primero debes iniciar la entrega (el pedido no está en camino)');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE pedido SET estado_pedido='Entregado' WHERE id_pedido=?", [id]);
    await conn.query('INSERT INTO entrega (fecha_hora_entrega,receptor,observacion,id_pedido,id_estado) VALUES (NOW(),?,?,?,1)',
      [receptor, (req.body.observacion || '').trim() || null, id]);
    const idf = 'F001-' + String(id).padStart(8, '0');
    await conn.query("INSERT INTO factura (id_factura,fecha_emision,estado,id_cliente,id_pedido) VALUES (?,CURDATE(),'Emitida',?,?)", [idf, p.id_cliente, id]);
    await conn.query(
      `INSERT INTO detalle_factura (id_factura,num_linea,id_concepto,cantidad,precio_unitario)
       SELECT ?, dp.num_linea, t.id_concepto, dp.cantidad, dp.precio_unitario
       FROM detalle_pedido dp JOIN tipo_hielo t ON t.id_tipo_hielo=dp.id_tipo_hielo WHERE dp.id_pedido=?`, [idf, id]);
    await cerrarRutaSiTermino(conn, rid, p.fecha_entrega);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put('/pedidos/:id/incidencia', auth('repartidor'), wrap(async (req, res) => {
  const id = +req.params.id; const rid = await idRepartidor(req.user.id);
  const obs = (req.body.observacion || '').trim();
  if (!obs) return fail(res, 400, 'Describe qué ocurrió con la entrega');
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_repartidor !== rid) return fail(res, 403, 'Este pedido no está asignado a ti');
  if (!['Asignado', 'En camino'].includes(p.estado_pedido)) return fail(res, 409, 'Esta entrega ya fue finalizada o cancelada');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE pedido SET estado_pedido='No entregado' WHERE id_pedido=?", [id]);
    await conn.query('INSERT INTO entrega (observacion,id_pedido,id_estado) VALUES (?,?,3)', [obs, id]);
    await devolverStock(conn, id, req.user.id, 'Retorno por entrega no realizada');
    await cerrarRutaSiTermino(conn, rid, p.fecha_entrega);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.post('/pedidos/:id/calificar', auth('cliente'), wrap(async (req, res) => {
  const id = +req.params.id; const puntaje = parseInt(req.body.puntaje, 10);
  if (!(puntaje >= 1 && puntaje <= 5)) return fail(res, 400, 'Selecciona una puntuación');
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_cliente !== (await idCliente(req.user.id))) return fail(res, 403, 'Este pedido no te pertenece');
  if (p.estado_pedido !== 'Entregado') return fail(res, 409, 'Solo puedes calificar pedidos entregados');
  const [[ya]] = await db.query('SELECT 1 AS x FROM calificacion WHERE id_pedido=?', [id]);
  if (ya) return fail(res, 409, 'Este pedido ya fue calificado');
  await db.query('INSERT INTO calificacion (id_pedido,puntaje,comentario) VALUES (?,?,?)', [id, puntaje, (req.body.comentario || '').slice(0, 180) || null]);
  res.json({ ok: true });
}));

// ---------- GPS ----------
app.post('/ubicacion', auth('repartidor'), wrap(async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return fail(res, 400, 'Ubicación inválida');
  const rid = await idRepartidor(req.user.id);
  await db.query('INSERT INTO ubicacion_repartidor (id_repartidor,lat,lng) VALUES (?,?,?) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng)', [rid, lat, lng]);
  res.json({ ok: true });
}));

// =====================================================================
//  ADMINISTRADOR
// =====================================================================
app.get('/repartidores', auth('admin'), wrap(async (_, res) => {
  const [rows] = await db.query(
    `SELECT r.id_repartidor, u.nombres, u.telefono, r.disponible,
            (SELECT COUNT(*) FROM pedido p WHERE p.id_repartidor=r.id_repartidor AND p.estado_pedido IN ('Asignado','En camino')) AS activos
     FROM repartidor r JOIN usuario u ON u.id_usuario=r.id_usuario WHERE u.activo=1 ORDER BY u.nombres`);
  res.json(rows);
}));

app.get('/resumen', auth('admin'), wrap(async (_, res) => {
  const [rows] = await db.query('SELECT estado_pedido, COUNT(*) AS n FROM pedido GROUP BY estado_pedido');
  const r = {}; rows.forEach((x) => { r[x.estado_pedido] = x.n; });
  const [[v]] = await db.query('SELECT COALESCE(SUM(total),0) AS ventas FROM pedido WHERE estado_pedido=\'Entregado\'');
  res.json({ ...r, ventas: Number(v.ventas) });
}));

app.get('/usuarios', auth('admin'), wrap(async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const [rows] = await db.query(
    'SELECT id_usuario AS id, nombres, email, telefono, rol, activo FROM usuario WHERE nombres LIKE ? OR email LIKE ? ORDER BY nombres LIMIT 100', [q, q]);
  res.json(rows);
}));

async function asegurarPerfil(conn, uid, rol) {
  if (rol === 'repartidor') await conn.query('INSERT IGNORE INTO repartidor (id_usuario) VALUES (?)', [uid]);
  if (rol === 'cliente') await conn.query('INSERT IGNORE INTO cliente (id_usuario) VALUES (?)', [uid]);
}

app.post('/usuarios', auth('admin'), wrap(async (req, res) => {
  const { nombres, telefono, email, password, rol } = req.body;
  if (!nombres?.trim() || !telefono?.trim() || !email?.trim() || !password) return fail(res, 400, 'Completa todos los campos');
  if (!['admin', 'cliente', 'repartidor'].includes(rol)) return fail(res, 400, 'Rol no válido');
  if (!RE_MAIL.test(email)) return fail(res, 400, 'Ingresa un correo válido');
  if (!RE_PASS.test(password)) return fail(res, 400, 'La contraseña necesita 8 caracteres, una mayúscula y un carácter especial');
  const [[dup]] = await db.query('SELECT 1 AS x FROM usuario WHERE email=? OR telefono=?', [email.toLowerCase(), telefono.trim()]);
  if (dup) return fail(res, 409, 'El correo o el celular ya están registrados');
  const hash = await bcrypt.hash(password, 10);
  const [r] = await db.query('INSERT INTO usuario (nombres,email,telefono,password,rol) VALUES (?,?,?,?,?)', [nombres.trim(), email.toLowerCase(), telefono.trim(), hash, rol]);
  await asegurarPerfil(db, r.insertId, rol);
  res.json({ ok: true });
}));

app.put('/usuarios/:id', auth('admin'), wrap(async (req, res) => {
  const id = +req.params.id; const { rol, activo } = req.body;
  if (id === req.user.id) return fail(res, 403, 'No puedes modificar tu propia cuenta por seguridad');
  const [[u]] = await db.query('SELECT * FROM usuario WHERE id_usuario=?', [id]);
  if (!u) return fail(res, 404, 'Usuario no encontrado');
  if (rol !== undefined && !['admin', 'cliente', 'repartidor'].includes(rol)) return fail(res, 400, 'Rol no válido');
  if (rol === u.rol && activo === undefined) return fail(res, 409, 'El usuario ya tiene ese rol');
  const cambiaRol = rol !== undefined && rol !== u.rol;
  if ((cambiaRol && u.rol === 'repartidor') || activo === false || activo === 0) {
    const rid = await idRepartidor(id);
    if (rid) {
      const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM pedido WHERE id_repartidor=? AND estado_pedido IN ('Asignado','En camino')", [rid]);
      if (n) return fail(res, 409, 'Este repartidor tiene entregas activas. Reasígnalas primero.');
    }
  }
  if (cambiaRol) { await db.query('UPDATE usuario SET rol=? WHERE id_usuario=?', [rol, id]); await asegurarPerfil(db, id, rol); }
  if (activo !== undefined) await db.query('UPDATE usuario SET activo=? WHERE id_usuario=?', [activo ? 1 : 0, id]);
  res.json({ ok: true });
}));

// ---------- Inventario ----------
app.get('/inventario', auth('admin'), wrap(async (_, res) => {
  const [saldos] = await db.query('SELECT * FROM v_saldo_inventario ORDER BY id_tipo_hielo');
  const [movs] = await db.query(
    `SELECT m.id_movimiento, m.fecha_movimiento, m.tipo_movimiento, m.cantidad, m.observacion, t.descripcion, u.nombres AS responsable
     FROM movimiento_kardex m JOIN tipo_hielo t ON t.id_tipo_hielo=m.id_tipo_hielo JOIN usuario u ON u.id_usuario=m.id_usuario
     ORDER BY m.id_movimiento DESC LIMIT 25`);
  res.json({ saldos, movimientos: movs });
}));

app.post('/inventario/movimiento', auth('admin'), wrap(async (req, res) => {
  const { id_tipo_hielo, tipo_movimiento, observacion } = req.body; const cant = Number(req.body.cantidad);
  if (!['ENTRADA', 'SALIDA'].includes(tipo_movimiento)) return fail(res, 400, 'Tipo de movimiento no válido');
  if (!Number.isFinite(cant)) return fail(res, 400, 'Ingresa solo números en la cantidad');
  if (cant <= 0) return fail(res, 400, 'La cantidad debe ser mayor a 0');
  if (cant > 5000) return fail(res, 400, 'La cantidad ingresada es demasiado alta');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query('SELECT * FROM tipo_hielo WHERE id_tipo_hielo=? FOR UPDATE', [id_tipo_hielo]);
    if (!t) { await conn.rollback(); return fail(res, 404, 'Producto no encontrado'); }
    if (tipo_movimiento === 'SALIDA' && (await saldo(conn, t.id_tipo_hielo)) < cant) { await conn.rollback(); return fail(res, 409, 'No hay stock suficiente para registrar esta salida'); }
    await conn.query('INSERT INTO movimiento_kardex (tipo_movimiento,cantidad,observacion,id_tipo_hielo,id_usuario) VALUES (?,?,?,?,?)',
      [tipo_movimiento, cant, (observacion || '').slice(0, 180) || (tipo_movimiento === 'ENTRADA' ? 'Ingreso de producción' : 'Salida / merma'), t.id_tipo_hielo, req.user.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.listen(process.env.PORT || 3000, () => console.log('IceRoute API lista en el puerto ' + (process.env.PORT || 3000)));

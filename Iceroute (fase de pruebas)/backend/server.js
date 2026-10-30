require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const migrar = require('./migrate');

const app = express();
app.use(cors(), express.json({ limit: '8mb' })); // 8 MB: la evidencia (foto/PDF) viaja en base64

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
  // 1) Validar el token: si falla, la sesión realmente no es válida (401)
  let d;
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    d = jwt.verify(t, process.env.JWT_SECRET);
  } catch { return fail(res, 401, 'Tu sesión expiró. Inicia sesión nuevamente.'); }
  // 2) Consultar la BD: si falla es un error del servidor (500), NO una sesión vencida
  let u;
  try {
    [[u]] = await db.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario=?', [d.id]);
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'No se pudo conectar con el servidor. Intenta de nuevo en unos momentos.');
  }
  if (!u || !u.activo) return fail(res, 401, 'Tu sesión expiró. Inicia sesión nuevamente.');
  if (roles.length && !roles.includes(u.rol)) return fail(res, 403, 'No tienes permiso para esta acción');
  req.user = { id: u.id_usuario, rol: u.rol };
  next();
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

// ---------- Utilidades nuevas ----------
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const VELOCIDAD_KMH = 25;   // velocidad promedio para estimar tiempos (ciudad)
const MIN_PARADA = 5;       // minutos que se estima por parada
const nro = (id) => '#' + String(id).padStart(5, '0');
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !isNaN(new Date(f + 'T00:00:00'));
const coordOk = (lat, lng) => lat != null && lng != null && isFinite(+lat) && isFinite(+lng)
  && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180 && !(+lat === 0 && +lng === 0);
const km = (a, b) => { // distancia Haversine entre dos puntos {lat,lng}
  const R = 6371, rad = (x) => (+x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const minutos = (distKm) => Math.max(1, Math.round((distKm / VELOCIDAD_KMH) * 60));

// Valida fecha/hora de entrega (misma regla al crear y al reprogramar). Devuelve el mensaje de error o null
function validarFechaHora(fecha, hora) {
  if (!fechaValida(fecha)) return 'Elige la fecha de entrega';
  const f = new Date(fecha + 'T00:00:00'); const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (f < hoy) return 'La fecha de entrega no puede ser anterior a hoy';
  if (f.getDay() === 0) return 'Los domingos no hay reparto. Elige otro día';
  if ((f - hoy) / 86400000 > 30) return 'Solo se puede programar hasta 30 días';
  if (!BLOQUES.includes(hora)) return 'Elige un horario de entrega';
  return null;
}

// ---------- Notificaciones (avisos dentro de la app) ----------
// Si el aviso falla, el cambio de estado se conserva igual (RF35/RF45 - error de envío)
async function notificar(conn, idUsuario, idPedido, mensaje) {
  try { await conn.query('INSERT INTO notificacion (id_usuario,id_pedido,mensaje) VALUES (?,?,?)', [idUsuario, idPedido, mensaje]); }
  catch (e) { console.error('Aviso no registrado (el cambio de estado se conserva):', e.message); }
}
async function notificarCliente(conn, p, mensaje) {
  try {
    const [[c]] = await conn.query('SELECT id_usuario FROM cliente WHERE id_cliente=?', [p.id_cliente]);
    if (c) await notificar(conn, c.id_usuario, p.id_pedido, mensaje);
  } catch (e) { console.error('Aviso no registrado:', e.message); }
}
async function notificarAdmins(conn, idPedido, mensaje) {
  try { await conn.query("INSERT INTO notificacion (id_usuario,id_pedido,mensaje) SELECT id_usuario,?,? FROM usuario WHERE rol='admin' AND activo=1", [idPedido, mensaje]); }
  catch (e) { console.error('Aviso a administradores no registrado:', e.message); }
}

// ---------- Hoja de ruta ----------
// Orden: 1) prioridad (Alta primero) 2) horario 3) dentro del mismo grupo, el destino más cercano al anterior
function ordenarParadas(rows) {
  const peso = (r) => PRIORIDADES.indexOf(r.prioridad);
  const s = [...rows].sort((a, b) => peso(a) - peso(b) || a.hora_entrega.localeCompare(b.hora_entrega) || a.id_pedido - b.id_pedido);
  const out = []; let cur = null; let i = 0;
  while (i < s.length) {
    let j = i; while (j < s.length && peso(s[j]) === peso(s[i]) && s[j].hora_entrega === s[i].hora_entrega) j++;
    const grupo = s.slice(i, j);
    while (grupo.length) {
      let k = 0;
      if (cur && coordOk(cur.lat, cur.lng)) {
        let best = Infinity;
        grupo.forEach((g, idx) => { if (!coordOk(g.lat, g.lng)) return; const d = km(cur, g); if (d < best) { best = d; k = idx; } });
      }
      const [x] = grupo.splice(k, 1); out.push(x); cur = x;
    }
    i = j;
  }
  return out;
}
async function reordenarRuta(conn, idRuta) {
  const [rows] = await conn.query(
    `SELECT dr.id_pedido, p.hora_entrega, p.prioridad, p.lat, p.lng FROM detalle_ruta dr JOIN pedido p ON p.id_pedido=dr.id_pedido
     WHERE dr.id_ruta=?`, [idRuta]);
  const orden = ordenarParadas(rows);
  await conn.query('DELETE FROM detalle_ruta WHERE id_ruta=?', [idRuta]);
  for (let i = 0; i < orden.length; i++) {
    await conn.query('INSERT INTO detalle_ruta (id_ruta,secuencia,id_pedido,hora_estimada) VALUES (?,?,?,?)',
      [idRuta, i + 1, orden[i].id_pedido, orden[i].hora_entrega.slice(0, 5) + ':00']);
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
  const { vista = 'activos', q = '', desde = '', hasta = '', buscar = '', id_repartidor = '' } = req.query;
  // Validaciones de búsqueda (RF40) y de filtros por fecha (RF36/RF37/RF39)
  if (desde && !fechaValida(desde)) return fail(res, 400, 'La fecha "desde" no es válida. Corrige el rango');
  if (hasta && !fechaValida(hasta)) return fail(res, 400, 'La fecha "hasta" no es válida. Corrige el rango');
  if (desde && hasta && desde > hasta) return fail(res, 400, 'El rango de fechas no es válido: "desde" es posterior a "hasta". Corrígelo');
  if (buscar === '1' && !q.trim() && !desde && !hasta) return fail(res, 400, 'Completa al menos un campo o filtro para buscar');
  const where = []; const params = [];
  if (req.user.rol === 'cliente') { where.push('p.id_cliente=?'); params.push(await idCliente(req.user.id)); }
  if (req.user.rol === 'repartidor') { where.push('p.id_repartidor=?'); params.push(await idRepartidor(req.user.id)); }
  if (req.user.rol === 'admin' && +id_repartidor) { where.push('p.id_repartidor=?'); params.push(+id_repartidor); }
  if (vista === 'activos') where.push("p.estado_pedido IN ('Pendiente','Asignado','En camino')");
  else if (vista === 'completadas') where.push("p.estado_pedido = 'Entregado'");
  else where.push("p.estado_pedido NOT IN ('Pendiente','Asignado','En camino')");
  if (desde) { where.push('p.fecha_entrega >= ?'); params.push(desde); }
  if (hasta) { where.push('p.fecha_entrega <= ?'); params.push(hasta); }
  if (q.trim()) {
    where.push('(p.id_pedido=? OR u.nombres LIKE ? OR p.direccion_entrega LIKE ?)');
    params.push(parseInt(q, 10) || 0, `%${q}%`, `%${q}%`);
  }
  // Pendientes: por prioridad y fecha. El repartidor ve su recorrido en el orden planificado.
  const orden = vista === 'activos'
    ? (req.user.rol === 'repartidor'
      ? 'p.fecha_entrega, dr.secuencia IS NULL, dr.secuencia, p.id_pedido'
      : "FIELD(p.prioridad,'Alta','Media','Baja'), p.fecha_entrega, p.hora_entrega, dr.secuencia, p.id_pedido")
    : (vista === 'completadas' ? 'COALESCE(e.fecha_hora_entrega, p.fecha_registro) DESC, p.id_pedido DESC' : 'p.id_pedido DESC');
  const [rows] = await db.query(
    `SELECT p.id_pedido, p.estado_pedido AS estado, p.direccion_entrega, p.fecha_entrega, p.hora_entrega, p.total,
            p.lat, p.lng, p.prioridad, u.nombres AS cliente, ur.nombres AS repartidor, dr.secuencia
     FROM pedido p JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
     LEFT JOIN repartidor r ON r.id_repartidor=p.id_repartidor LEFT JOIN usuario ur ON ur.id_usuario=r.id_usuario
     LEFT JOIN detalle_ruta dr ON dr.id_pedido=p.id_pedido
     LEFT JOIN entrega e ON e.id_pedido=p.id_pedido
     WHERE ${where.join(' AND ')}
     ORDER BY ${orden} LIMIT 200`, params);
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
  // RF34: tiempo estimado de llegada (distancia en línea recta / velocidad promedio)
  let tiempo_estimado = null; let tiempo_msg = null;
  if (p.estado_pedido === 'En camino') {
    if (!coordOk(p.lat, p.lng)) tiempo_msg = 'No se puede calcular el tiempo: el destino no tiene una ubicación válida';
    else if (!ubicacion || !coordOk(ubicacion.lat, ubicacion.lng)) tiempo_msg = 'El tiempo estimado aún no puede calcularse (esperando la ubicación del repartidor)';
    else tiempo_estimado = minutos(km({ lat: +ubicacion.lat, lng: +ubicacion.lng }, { lat: +p.lat, lng: +p.lng }));
  } else if (p.estado_pedido === 'Asignado') tiempo_msg = 'El tiempo estimado se mostrará cuando el repartidor inicie la entrega';
  const [[ev]] = await db.query('SELECT fecha FROM evidencia_entrega WHERE id_pedido=?', [p.id_pedido]);
  res.json({ ...p, estado: p.estado_pedido, items, ubicacion: ubicacion || null, tiempo_estimado, tiempo_msg,
    tiene_evidencia: !!ev, fecha_evidencia: ev ? ev.fecha : null });
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
    if (req.user.rol === 'admin') await notificarCliente(conn, p, `Tu pedido ${nro(id)} fue cancelado. Motivo: ${motivo}`);
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
    await notificarCliente(conn, p, `Tu pedido ${nro(id)} fue asignado a un repartidor.`);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

const iniciarPedido = async (req, res) => {
  const id = +req.params.id; const rid = await idRepartidor(req.user.id);
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_repartidor !== rid) return fail(res, 403, 'Este pedido no está asignado a ti');
  if (p.estado_pedido === 'Cancelado') return fail(res, 409, 'Este pedido fue cancelado');
  if (p.estado_pedido === 'En camino') return fail(res, 409, 'Esta entrega ya fue iniciada');
  if (p.estado_pedido !== 'Asignado') return fail(res, 409, 'Esta entrega ya fue finalizada');
  await db.query("UPDATE pedido SET estado_pedido='En camino' WHERE id_pedido=?", [id]);
  await db.query("UPDATE ruta SET estado_ruta='En curso' WHERE id_repartidor=? AND fecha_ruta=?", [rid, p.fecha_entrega]);
  await notificarCliente(db, p, `Tu pedido ${nro(id)} va en camino.`);
  res.json({ ok: true });
};
app.put('/pedidos/:id/iniciar', auth('repartidor'), wrap(iniciarPedido));

async function cerrarRutaSiTermino(conn, rid, fecha) {
  const [[{ n }]] = await conn.query(
    "SELECT COUNT(*) n FROM pedido WHERE id_repartidor=? AND fecha_entrega=? AND estado_pedido IN ('Asignado','En camino')", [rid, fecha]);
  if (!n) await conn.query("UPDATE ruta SET estado_ruta='Finalizada' WHERE id_repartidor=? AND fecha_ruta=?", [rid, fecha]);
}

const entregarPedido = async (req, res) => {
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
    await notificarCliente(conn, p, `Tu pedido ${nro(id)} fue entregado correctamente.`);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
};
app.put('/pedidos/:id/entregar', auth('repartidor'), wrap(entregarPedido));

// RF28: actualizar estado validando la secuencia Asignado -> En camino -> Entregado
app.put('/pedidos/:id/estado', auth('repartidor'), wrap(async (req, res) => {
  const est = req.body.estado;
  if (est === 'En camino') return iniciarPedido(req, res);
  if (est === 'Entregado') return entregarPedido(req, res);
  return fail(res, 400, 'Estado no permitido. Solo puedes marcar "En camino" o "Entregado" siguiendo la secuencia del proceso');
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
    await conn.query('INSERT INTO entrega (fecha_hora_entrega,observacion,id_pedido,id_estado) VALUES (NOW(),?,?,3)', [obs, id]);
    await devolverStock(conn, id, req.user.id, 'Retorno por entrega no realizada');
    await cerrarRutaSiTermino(conn, rid, p.fecha_entrega);
    await notificarCliente(conn, p, `No se pudo entregar tu pedido ${nro(id)}: ${obs}`);
    await notificarAdmins(conn, id, `Incidencia en el pedido ${nro(id)}: ${obs}`);
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

// =====================================================================
//  FUNCIONES NUEVAS (corrección según casos de prueba RF24 - RF50)
// =====================================================================

// ---------- RF24: Priorización de entregas ----------
app.put('/pedidos/:id/prioridad', auth('admin'), wrap(async (req, res) => {
  const id = +req.params.id; const { prioridad } = req.body;
  if (!PRIORIDADES.includes(prioridad)) return fail(res, 400, 'Selecciona una prioridad válida (Alta, Media o Baja)');
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p) return fail(res, 404, 'La entrega ya no existe o no está disponible. No se puede priorizar');
  if (!ACTIVOS.includes(p.estado_pedido)) return fail(res, 409, 'No se puede modificar la prioridad de una entrega que ya fue finalizada o cancelada');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE pedido SET prioridad=? WHERE id_pedido=?', [prioridad, id]);
    const [[d]] = await conn.query('SELECT id_ruta FROM detalle_ruta WHERE id_pedido=?', [id]);
    if (d) await reordenarRuta(conn, d.id_ruta); // la prioridad se refleja en el recorrido
    await conn.commit();
    res.json({ ok: true, prioridad });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// ---------- RF25: Organización de recorrido (administrador) ----------
app.post('/recorridos/organizar', auth('admin'), wrap(async (req, res) => {
  const idRep = +req.body.id_repartidor;
  const ids = Array.isArray(req.body.pedidos) ? [...new Set(req.body.pedidos.map(Number).filter(Boolean))] : [];
  if (!idRep) return fail(res, 400, 'Selecciona un repartidor');
  const [asignadas] = await db.query("SELECT id_pedido FROM pedido WHERE id_repartidor=? AND estado_pedido='Asignado'", [idRep]);
  if (!asignadas.length) return fail(res, 409, 'No hay entregas asignadas disponibles para organizar el recorrido');
  if (!ids.length) return fail(res, 400, 'Selecciona las entregas que formarán parte del recorrido');
  const [rows] = await db.query(
    "SELECT id_pedido, direccion_entrega, lat, lng, hora_entrega, prioridad, fecha_entrega FROM pedido WHERE id_pedido IN (?) AND id_repartidor=? AND estado_pedido='Asignado'", [ids, idRep]);
  if (rows.length !== ids.length) return fail(res, 409, 'Alguna de las entregas seleccionadas ya no está disponible para el recorrido');
  const malas = rows.filter((r) => !r.direccion_entrega?.trim() || !coordOk(r.lat, r.lng));
  if (malas.length) return fail(res, 400, `El pedido ${malas.map((m) => nro(m.id_pedido)).join(', ')} no cuenta con una dirección o ubicación válida. Corrígelo antes de organizar el recorrido`);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const fechas = [...new Set(rows.map((r) => r.fecha_entrega))];
    const resumen = [];
    for (const fecha of fechas) {
      const [[ruta]] = await conn.query('SELECT id_ruta FROM ruta WHERE id_repartidor=? AND fecha_ruta=?', [idRep, fecha]);
      if (!ruta) throw new Error('El pedido no tiene ruta asociada');
      const sel = ordenarParadas(rows.filter((r) => r.fecha_entrega === fecha));
      const [resto] = await conn.query(
        'SELECT dr.id_pedido, p.hora_entrega FROM detalle_ruta dr JOIN pedido p ON p.id_pedido=dr.id_pedido WHERE dr.id_ruta=? AND dr.id_pedido NOT IN (?) ORDER BY dr.secuencia',
        [ruta.id_ruta, sel.map((x) => x.id_pedido)]);
      await conn.query('DELETE FROM detalle_ruta WHERE id_ruta=?', [ruta.id_ruta]);
      const orden = [...sel, ...resto];
      for (let i = 0; i < orden.length; i++) {
        await conn.query('INSERT INTO detalle_ruta (id_ruta,secuencia,id_pedido,hora_estimada) VALUES (?,?,?,?)',
          [ruta.id_ruta, i + 1, orden[i].id_pedido, orden[i].hora_entrega.slice(0, 5) + ':00']);
      }
      resumen.push(...orden.map((o, i) => ({ id_pedido: o.id_pedido, secuencia: i + 1 })));
    }
    await conn.commit();
    res.json({ ok: true, orden: resumen });
  } catch (e) {
    await conn.rollback(); console.error(e);
    fail(res, 500, 'Ocurrió un error al generar el recorrido. No se guardó ningún cambio');
  } finally { conn.release(); }
}));

// ---------- RF26 + RF34: Consulta de recorrido del repartidor con tiempos estimados ----------
app.get('/mi-recorrido', auth('repartidor'), wrap(async (req, res) => {
  const rid = await idRepartidor(req.user.id);
  const [rows] = await db.query(
    `SELECT p.id_pedido, p.estado_pedido AS estado, p.direccion_entrega, p.referencia, p.lat, p.lng, p.fecha_entrega, p.hora_entrega,
            p.prioridad, dr.secuencia, u.nombres AS cliente, u.telefono AS cliente_telefono
     FROM pedido p JOIN detalle_ruta dr ON dr.id_pedido=p.id_pedido
     JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
     WHERE p.id_repartidor=? AND p.estado_pedido IN ('Asignado','En camino') ORDER BY p.fecha_entrega, dr.secuencia`, [rid]);
  if (!rows.length) return res.json({ paradas: [], advertencias: [], mensaje: 'Aún no tienes un recorrido asignado' });
  const [[ub]] = await db.query('SELECT lat, lng FROM ubicacion_repartidor WHERE id_repartidor=?', [rid]);
  let cur = ub && coordOk(ub.lat, ub.lng) ? { lat: +ub.lat, lng: +ub.lng } : null;
  let acum = 0; const advertencias = [];
  const paradas = rows.map((r) => {
    const faltan = [];
    if (!r.cliente_telefono) faltan.push('teléfono del cliente');
    if (!r.referencia) faltan.push('referencia');
    let eta = null;
    if (coordOk(r.lat, r.lng)) {
      if (cur) { acum += minutos(km(cur, { lat: +r.lat, lng: +r.lng })); eta = acum; acum += MIN_PARADA; }
      cur = { lat: +r.lat, lng: +r.lng };
    } else {
      faltan.push('ubicación en el mapa');
      advertencias.push(`Pedido ${nro(r.id_pedido)}: no se puede calcular el tiempo estimado (sin ubicación válida)`);
    }
    if (faltan.length) advertencias.push(`Pedido ${nro(r.id_pedido)}: información incompleta (falta ${faltan.join(', ')})`);
    return { ...r, eta_min: eta };
  });
  res.json({ paradas, advertencias, mensaje: ub ? null : 'Los tiempos estimados se calculan cuando inicias una entrega y se comparte tu ubicación' });
}));

// ---------- RF49: Reprogramación de entrega ----------
async function ponerEnRuta(conn, idPedido, idRep, fecha) {
  let [[ruta]] = await conn.query('SELECT id_ruta FROM ruta WHERE id_repartidor=? AND fecha_ruta=?', [idRep, fecha]);
  if (!ruta) { const [ins] = await conn.query('INSERT INTO ruta (fecha_ruta,id_repartidor) VALUES (?,?)', [fecha, idRep]); ruta = { id_ruta: ins.insertId }; }
  const [[{ nx }]] = await conn.query('SELECT COALESCE(MAX(secuencia),0)+1 AS nx FROM detalle_ruta WHERE id_ruta=?', [ruta.id_ruta]);
  await conn.query('INSERT INTO detalle_ruta (id_ruta,secuencia,id_pedido) VALUES (?,?,?)', [ruta.id_ruta, nx, idPedido]);
  await reordenarRuta(conn, ruta.id_ruta);
}
app.put('/pedidos/:id/reprogramar', auth('cliente', 'admin'), wrap(async (req, res) => {
  const id = +req.params.id; const { fecha, hora } = req.body;
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p) return fail(res, 404, 'Pedido no encontrado');
  if (req.user.rol === 'cliente' && p.id_cliente !== (await idCliente(req.user.id))) return fail(res, 403, 'Este pedido no te pertenece');
  if (p.estado_pedido === 'Entregado') return fail(res, 409, 'Un pedido entregado no puede reprogramarse');
  if (p.estado_pedido === 'Cancelado') return fail(res, 409, 'Este pedido fue cancelado y no puede reprogramarse');
  if (p.estado_pedido === 'En camino') return fail(res, 409, 'La entrega ya va en camino y no puede reprogramarse');
  const err = validarFechaHora(fecha, hora);
  if (err) return fail(res, 400, err);
  const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM pedido WHERE fecha_entrega=? AND hora_entrega=? AND estado_pedido<>'Cancelado' AND id_pedido<>?", [fecha, hora, id]);
  if (n >= CUPOS_POR_BLOQUE) return fail(res, 409, 'No hay disponibilidad en esa fecha y horario. Elige otra opción');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (p.estado_pedido === 'No entregado') {
      // La incidencia devolvió el stock: se vuelve a reservar al reprogramar
      const [items] = await conn.query('SELECT id_tipo_hielo, cantidad FROM detalle_pedido WHERE id_pedido=?', [id]);
      for (const it of items) {
        await conn.query('SELECT id_tipo_hielo FROM tipo_hielo WHERE id_tipo_hielo=? FOR UPDATE', [it.id_tipo_hielo]);
        if ((await saldo(conn, it.id_tipo_hielo)) < Number(it.cantidad)) { await conn.rollback(); return fail(res, 409, 'No hay stock suficiente para reprogramar este pedido'); }
      }
      for (const it of items) {
        await conn.query("INSERT INTO movimiento_kardex (tipo_movimiento,cantidad,observacion,id_tipo_hielo,id_usuario) VALUES ('SALIDA',?,?,?,?)",
          [it.cantidad, `Reserva por reprogramación pedido #${id}`, it.id_tipo_hielo, req.user.id]);
      }
      await conn.query('DELETE FROM entrega WHERE id_pedido=?', [id]);
      await conn.query("UPDATE pedido SET fecha_entrega=?, hora_entrega=?, estado_pedido='Pendiente', id_repartidor=NULL WHERE id_pedido=?", [fecha, hora, id]);
    } else {
      await quitarDeRuta(conn, id);
      await conn.query('UPDATE pedido SET fecha_entrega=?, hora_entrega=? WHERE id_pedido=?', [fecha, hora, id]);
      if (p.estado_pedido === 'Asignado') await ponerEnRuta(conn, id, p.id_repartidor, fecha);
    }
    await notificarCliente(conn, p, `Tu pedido ${nro(id)} fue reprogramado para el ${fecha.split('-').reverse().join('/')} (${hora}).`);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// ---------- RF43 / RF44: Evidencia de entrega ----------
const TIPOS_EV = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
const FIRMAS = { jpg: 'ffd8ff', png: '89504e47', pdf: '25504446' }; // primeros bytes reales del archivo
const CARPETA_EV = path.join(__dirname, 'uploads');

app.post('/pedidos/:id/evidencia', auth('repartidor'), wrap(async (req, res) => {
  const id = +req.params.id; const rid = await idRepartidor(req.user.id);
  const { archivo, tipo } = req.body;
  if (!archivo) return fail(res, 400, 'Debes adjuntar la evidencia de la entrega para continuar');
  const ext = TIPOS_EV[tipo];
  if (!ext) return fail(res, 400, 'Archivo no válido. Selecciona un formato válido (JPG, PNG o PDF)');
  const buf = Buffer.from(String(archivo), 'base64');
  if (!buf.length || buf.subarray(0, 4).toString('hex').indexOf(FIRMAS[ext]) !== 0) return fail(res, 400, 'Archivo no válido. Selecciona un formato válido (JPG, PNG o PDF)');
  if (buf.length > 5 * 1024 * 1024) return fail(res, 400, 'El archivo supera el máximo de 5 MB');
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p || p.id_repartidor !== rid) return fail(res, 403, 'Este pedido no está asignado a ti');
  if (!['En camino', 'Entregado'].includes(p.estado_pedido)) return fail(res, 409, 'La evidencia solo puede registrarse en una entrega en proceso o ya entregada');
  try {
    fs.mkdirSync(CARPETA_EV, { recursive: true });
    const nombre = `pedido_${id}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(CARPETA_EV, nombre), buf);
    await db.query('REPLACE INTO evidencia_entrega (id_pedido,archivo,tipo) VALUES (?,?,?)', [id, nombre, tipo]);
    await db.query('UPDATE entrega SET evidencia=? WHERE id_pedido=?', [nombre, id]); // si ya hay registro de entrega, queda vinculado
    res.json({ ok: true });
  } catch (e) { console.error(e); fail(res, 500, 'No se guardó la evidencia. Revisa tu conexión e intenta de nuevo'); }
}));

app.get('/pedidos/:id/evidencia', auth(), wrap(async (req, res) => {
  const id = +req.params.id;
  const [[p]] = await db.query('SELECT * FROM pedido WHERE id_pedido=?', [id]);
  if (!p) return fail(res, 404, 'Pedido no encontrado');
  const permitido = req.user.rol === 'admin'
    || (req.user.rol === 'cliente' && p.id_cliente === (await idCliente(req.user.id)))
    || (req.user.rol === 'repartidor' && p.id_repartidor === (await idRepartidor(req.user.id)));
  if (!permitido) return fail(res, 403, 'No tienes permisos suficientes para ver esta evidencia');
  const [[ev]] = await db.query('SELECT archivo, tipo, fecha FROM evidencia_entrega WHERE id_pedido=?', [id]);
  if (!ev) return fail(res, 404, 'Este pedido no posee evidencia disponible');
  try {
    const data = fs.readFileSync(path.join(CARPETA_EV, path.basename(ev.archivo))).toString('base64');
    res.json({ tipo: ev.tipo, fecha: ev.fecha, archivo: data });
  } catch (e) { console.error(e); fail(res, 500, 'No se pudo cargar la evidencia. Intenta de nuevo'); }
}));

// ---------- RF47 (consulta) / RF48: Incidencias de entrega ----------
app.get('/incidencias', auth('admin', 'repartidor'), wrap(async (req, res) => {
  const { desde = '', hasta = '', id_repartidor = '' } = req.query;
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && desde > hasta)) return fail(res, 400, 'Los filtros no son válidos. Corrige el rango de fechas');
  const where = ['e.id_estado=3']; const params = [];
  if (req.user.rol === 'repartidor') { where.push('p.id_repartidor=?'); params.push(await idRepartidor(req.user.id)); }
  else if (+id_repartidor) { where.push('p.id_repartidor=?'); params.push(+id_repartidor); }
  if (desde) { where.push('DATE(COALESCE(e.fecha_hora_entrega,p.fecha_registro)) >= ?'); params.push(desde); }
  if (hasta) { where.push('DATE(COALESCE(e.fecha_hora_entrega,p.fecha_registro)) <= ?'); params.push(hasta); }
  const [rows] = await db.query(
    `SELECT e.id_entrega, p.id_pedido, p.direccion_entrega, e.observacion AS descripcion,
            COALESCE(e.fecha_hora_entrega, p.fecha_registro) AS fecha, ur.nombres AS repartidor, uc.nombres AS cliente
     FROM entrega e JOIN pedido p ON p.id_pedido=e.id_pedido
     JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario uc ON uc.id_usuario=c.id_usuario
     LEFT JOIN repartidor r ON r.id_repartidor=p.id_repartidor LEFT JOIN usuario ur ON ur.id_usuario=r.id_usuario
     WHERE ${where.join(' AND ')} ORDER BY e.id_entrega DESC LIMIT 200`, params);
  res.json(rows);
}));

// ---------- RF50: Reporte de entregas ----------
app.get('/reportes/entregas', auth('admin'), wrap(async (req, res) => {
  const { desde = '', hasta = '' } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) return fail(res, 400, 'Ingresa un rango de fechas válido (AAAA-MM-DD)');
  if (desde > hasta) return fail(res, 400, 'El rango de fechas no es válido: "desde" es posterior a "hasta". Corrígelo');
  const [porEstado] = await db.query('SELECT estado_pedido AS estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS monto FROM pedido WHERE fecha_entrega BETWEEN ? AND ? GROUP BY estado_pedido', [desde, hasta]);
  if (!porEstado.length) return res.json({ vacio: true, mensaje: 'No hay información para mostrar en el período seleccionado' });
  const [porRepartidor] = await db.query(
    `SELECT ur.nombres AS repartidor, COUNT(*) AS entregas FROM pedido p JOIN repartidor r ON r.id_repartidor=p.id_repartidor
     JOIN usuario ur ON ur.id_usuario=r.id_usuario WHERE p.estado_pedido='Entregado' AND p.fecha_entrega BETWEEN ? AND ? GROUP BY ur.nombres ORDER BY entregas DESC`, [desde, hasta]);
  const [[cal]] = await db.query('SELECT ROUND(AVG(c.puntaje),1) AS promedio, COUNT(*) AS n FROM calificacion c JOIN pedido p ON p.id_pedido=c.id_pedido WHERE p.fecha_entrega BETWEEN ? AND ?', [desde, hasta]);
  const [detalle] = await db.query(
    `SELECT p.id_pedido, p.fecha_entrega, p.hora_entrega, p.estado_pedido AS estado, p.total, uc.nombres AS cliente, ur.nombres AS repartidor
     FROM pedido p JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario uc ON uc.id_usuario=c.id_usuario
     LEFT JOIN repartidor r ON r.id_repartidor=p.id_repartidor LEFT JOIN usuario ur ON ur.id_usuario=r.id_usuario
     WHERE p.fecha_entrega BETWEEN ? AND ? ORDER BY p.fecha_entrega DESC, p.id_pedido DESC LIMIT 200`, [desde, hasta]);
  const total = porEstado.reduce((t, x) => t + x.n, 0);
  const ent = porEstado.find((x) => x.estado === 'Entregado');
  res.json({ vacio: false, desde, hasta, total, ventas: Number(ent?.monto || 0), por_estado: porEstado.map((x) => ({ ...x, monto: Number(x.monto) })),
    por_repartidor: porRepartidor, calificacion: { promedio: cal.promedio ? Number(cal.promedio) : null, cantidad: cal.n }, detalle });
}));

// ---------- RF35 / RF45: Avisos de cambio de estado ----------
app.get('/notificaciones', auth(), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT id_notificacion AS id, id_pedido, mensaje, leida, fecha FROM notificacion WHERE id_usuario=? ORDER BY id_notificacion DESC LIMIT 50', [req.user.id]);
  res.json({ no_leidas: rows.filter((r) => !r.leida).length, avisos: rows });
}));
app.put('/notificaciones/leer', auth(), wrap(async (req, res) => {
  await db.query('UPDATE notificacion SET leida=1 WHERE id_usuario=?', [req.user.id]);
  res.json({ ok: true });
}));


// Se prepara la base de datos (tablas/columnas nuevas) y luego se enciende el servidor
migrar(db)
  .then(() => app.listen(process.env.PORT || 3000, () => console.log('IceRoute API lista en el puerto ' + (process.env.PORT || 3000))))
  .catch((e) => { console.error('No se pudo conectar/preparar la base de datos. Revisa que MySQL esté encendido y la clave del .env:', e.message); process.exit(1); });

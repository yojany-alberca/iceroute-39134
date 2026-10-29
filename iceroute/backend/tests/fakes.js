// DAO falsos en memoria: permiten probar las reglas de los servicios sin MySQL.
// Propiedad `falla = true` simula la caída de la base de datos (error de infraestructura).
const UsuarioDao = require('../src/dao/UsuarioDao');
const PedidoDao = require('../src/dao/PedidoDao');
 
class FakeUsuarioDao extends UsuarioDao {
  constructor() { super(); this.usuarios = []; this.falla = false; this.sig = 1; this.repartidores = {}; this.activas = {}; this.bloqueos = []; }
  _chk() { if (this.falla) throw new Error('ECONNREFUSED'); }
  agregar(u) { const x = { id_usuario: this.sig++, activo: 1, bloqueado: false, intentos_fallidos: 0, ...u }; this.usuarios.push(x); return x; }
  async buscarPorEmail(email) { this._chk(); return this.usuarios.find((u) => u.email === email) || null; }
  async buscarPorEmailOTelefono(email, tel) { this._chk(); return this.usuarios.find((u) => u.email === email || u.telefono === tel) || null; }
  async buscarPorId(id) { this._chk(); return this.usuarios.find((u) => u.id_usuario === id) || null; }
  async crear(d) { this._chk(); return this.agregar({ nombres: d.nombres, email: d.email, telefono: d.telefono, passwordHash: d.passwordHash, rol: d.rol }).id_usuario; }
  async actualizarRol(id, rol) { this._chk(); (await this.buscarPorId(id)).rol = rol; }
  async actualizarActivo(id, a) { this._chk(); (await this.buscarPorId(id)).activo = a ? 1 : 0; }
  async registrarIntentoFallido(id, n) { this._chk(); (await this.buscarPorId(id)).intentos_fallidos = n; }
  async bloquear(id, min) { this._chk(); this.bloqueos.push({ id, min }); }
  async reiniciarIntentos(id) { this._chk(); (await this.buscarPorId(id)).intentos_fallidos = 0; }
  async idRepartidor(uid) { this._chk(); return this.repartidores[uid] || null; }
  async contarEntregasActivas(rid) { this._chk(); return this.activas[rid] || 0; }
}
 
class FakePedidoDao extends PedidoDao {
  constructor() {
    super();
    this.falla = false; this.pedidos = {}; this.clientes = {}; this.repartidores = {}; this.reps = {};
    this.calificaciones = {}; this.creados = []; this.devoluciones = []; this.facturas = []; this.incidencias = []; this.sig = 1;
    this.ocupados = {};
  }
  _w() { if (this.falla) throw new Error('ER_LOCK_DEADLOCK'); }
  agregarPedido(p) { const x = { id_pedido: this.sig++, estado_pedido: 'Pendiente', id_cliente: 1, id_repartidor: null, fecha_entrega: '2026-10-30', hora_entrega: '10:00:00', ...p }; this.pedidos[x.id_pedido] = x; return x; }
  async idCliente(uid) { return this.clientes[uid]; }
  async idRepartidor(uid) { return this.repartidores[uid]; }
  async contarPorBloque(fecha, hora) { return this.ocupados[fecha + '|' + hora] || 0; }
  async crearConReserva(d) { this._w(); const p = this.agregarPedido({ id_cliente: d.idCliente, total: d.total }); this.creados.push({ id_pedido: p.id_pedido, ...d }); return p.id_pedido; }
  async obtener(id) { return this.pedidos[id] || null; }
  async cancelarConDevolucion(id, motivo, uid) { this._w(); this.pedidos[id].estado_pedido = 'Cancelado'; this.pedidos[id].motivo = motivo; this.pedidos[id].cancelado_por = uid; this.devoluciones.push(id); }
  async obtenerRepartidor(id) { return this.reps[id] || null; }
  async asignar(id, rid) { this._w(); this.pedidos[id].id_repartidor = rid; this.pedidos[id].estado_pedido = 'Asignado'; }
  async iniciar(id) { this._w(); this.pedidos[id].estado_pedido = 'En camino'; }
  async confirmarEntrega(d) { this._w(); this.pedidos[d.idPedido].estado_pedido = 'Entregado'; this.pedidos[d.idPedido].entregado_en = d.ahora; this.facturas.push(d.id_factura); }
  async registrarIncidencia(d) { this._w(); this.pedidos[d.idPedido].estado_pedido = 'No entregado'; this.incidencias.push(d); }
  async existeCalificacion(id) { return !!this.calificaciones[id]; }
  async guardarCalificacion(id, puntaje, comentario) { this._w(); this.calificaciones[id] = { puntaje, comentario }; }
}
 
class FakeCatalogoDao {
  constructor() { this.tipos = { 1: { id_tipo_hielo: 1, descripcion: 'Bolsa de hielo', precio: 3.5 }, 2: { id_tipo_hielo: 2, descripcion: 'Bloque de hielo', precio: 12 } }; }
  async tipoPorId(id) { return this.tipos[id] || null; }
}
class FakeKardexDao {
  constructor() { this.saldos = { 1: 100, 2: 30 }; }
  async saldo(id) { return this.saldos[id] ?? 0; }
}
 
// Reloj fijo: hoy = jueves 29/10/2026
const reloj = () => ({ hoy: () => new Date('2026-10-29T00:00:00'), ahora: () => new Date('2026-10-29T10:15:00') });
const hasher = { hash: async (p) => 'hash(' + p + ')', compare: async (p, h) => h === 'hash(' + p + ')' };
const tokens = { firmar: (payload) => 'token-' + payload.id };
 
module.exports = { FakeUsuarioDao, FakePedidoDao, FakeCatalogoDao, FakeKardexDao, reloj, hasher, tokens };

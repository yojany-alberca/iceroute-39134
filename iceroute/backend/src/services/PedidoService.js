// Reglas del pedido durante todo su ciclo: registro (RF09, RF13-RF17), cancelación (RF12, RF32),
// asignación (RF19, RF21), entrega (RF27, RF28, RF30, RF31, RF42), calificación (RF46) e incidencias (RF47).
// Depende de INTERFACES DAO (inversión de dependencias): en producción MySQL, en las pruebas un DAO falso.
const { AppError, conInfra } = require('../errors');

const BLOQUES = ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00'];
const CUPOS_POR_BLOQUE = 10;
const MAX_CANTIDAD = 500;
const MAX_DIAS = 30;
const ACTIVOS = ['Pendiente', 'Asignado', 'En camino'];
const TRANSICIONES = {
  Pendiente: ['Asignado', 'Cancelado'],
  Asignado: ['Asignado', 'En camino', 'No entregado', 'Cancelado'],
  'En camino': ['Entregado', 'No entregado', 'Cancelado'],
  Entregado: [], Cancelado: [], 'No entregado': [],
};

class PedidoService {
  // dao: PedidoDao | catalogo: CatalogoDao | kardex: KardexDao | reloj: { hoy(), ahora() }
  constructor(dao, catalogo, kardex, reloj) { this.dao = dao; this.catalogo = catalogo; this.kardex = kardex; this.reloj = reloj; }

  static transicionValida(desde, hacia) { return (TRANSICIONES[desde] || []).includes(hacia); }

  // ---------- RF09, RF13, RF14, RF15, RF16, RF17 ----------
  async crear(usuario, { items, direccion, referencia, id_distrito, lat, lng, fecha, hora } = {}) {
    if (!Array.isArray(items) || !items.length) throw new AppError(400, 'Selecciona al menos un producto');
    if (!direccion?.trim()) throw new AppError(400, 'Ingresa la dirección de entrega');
    if (referencia && referencia.length > 180) throw new AppError(400, 'La referencia no puede superar 180 caracteres');
    if (referencia && /[<>{}]/.test(referencia)) throw new AppError(400, 'La referencia contiene caracteres no permitidos');
    this._validarFecha(fecha);
    if (!BLOQUES.includes(hora)) throw new AppError(400, 'Elige un horario de entrega');

    return conInfra(async () => {
      if ((await this.dao.contarPorBloque(fecha, hora)) >= CUPOS_POR_BLOQUE) throw new AppError(409, 'Este horario ya no tiene cupos. Elige otro.');
      const idCliente = await this.dao.idCliente(usuario.id);
      let total = 0; const lineas = [];
      for (const it of items) {
        const cant = parseInt(it.cantidad, 10);
        if (!(cant > 0)) throw new AppError(400, 'La cantidad debe ser mayor a 0');
        if (cant > MAX_CANTIDAD) throw new AppError(400, 'La cantidad solicitada es demasiado alta. Comunícate con la empresa');
        const t = await this.catalogo.tipoPorId(it.id_tipo_hielo);
        if (!t) throw new AppError(400, 'Producto no válido');
        const disp = await this.kardex.saldo(t.id_tipo_hielo);
        if (disp < cant) throw new AppError(409, `No hay stock suficiente de ${t.descripcion} (disponible: ${disp})`);
        total += Number(t.precio) * cant;
        lineas.push({ id_tipo_hielo: t.id_tipo_hielo, cantidad: cant, precio: Number(t.precio), descripcion: t.descripcion });
      }
      total = Math.round(total * 100) / 100;
      const id_pedido = await this.dao.crearConReserva({
        idCliente, idUsuario: usuario.id, direccion: direccion.trim(), referencia: referencia?.trim() || null,
        id_distrito: id_distrito ?? null, lat: lat ?? null, lng: lng ?? null, fecha, hora, total, lineas,
      });
      return { id_pedido, total };
    });
  }

  _validarFecha(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new AppError(400, 'Elige la fecha de entrega');
    const f = new Date(fecha + 'T00:00:00');
    const hoy = this.reloj.hoy();
    if (f < hoy) throw new AppError(400, 'La fecha de entrega no puede ser anterior a hoy');
    if (f.getDay() === 0) throw new AppError(400, 'Los domingos no hay reparto. Elige otro día');
    if (Math.round((f - hoy) / 86400000) > MAX_DIAS) throw new AppError(400, 'Solo se puede programar hasta 30 días');
  }

  // ---------- RF12 (cliente/admin) y RF32 (admin con motivo) ----------
  async cancelar(actor, id, motivo) {
    const texto = (motivo || '').trim();
    return conInfra(async () => {
      const p = await this.dao.obtener(id);
      if (!p) throw new AppError(404, 'Pedido no encontrado');
      if (actor.rol === 'cliente' && p.id_cliente !== (await this.dao.idCliente(actor.id))) throw new AppError(403, 'Este pedido no te pertenece');
      if (actor.rol === 'admin' && !texto) throw new AppError(400, 'Escribe el motivo de la cancelación');
      const permitidos = actor.rol === 'admin' ? ACTIVOS : ['Pendiente', 'Asignado'];
      if (p.estado_pedido === 'Cancelado') throw new AppError(409, 'Este pedido ya fue cancelado');
      if (!permitidos.includes(p.estado_pedido)) {
        throw new AppError(409, p.estado_pedido === 'En camino' ? 'No se puede cancelar: el pedido ya va en camino' : 'No se puede cancelar un pedido finalizado');
      }
      await this.dao.cancelarConDevolucion(id, texto || (actor.rol === 'cliente' ? 'Cancelado por el cliente' : null), actor.id);
      return { ok: true };
    });
  }

  // ---------- RF19 asignar / RF21 reasignar ----------
  async asignar(id, idRepartidor) {
    return conInfra(async () => {
      const p = await this.dao.obtener(id);
      if (!p) throw new AppError(404, 'Pedido no encontrado');
      if (p.estado_pedido === 'Cancelado') throw new AppError(409, 'Este pedido fue cancelado');
      if (!['Pendiente', 'Asignado'].includes(p.estado_pedido)) throw new AppError(409, 'La entrega ya está en curso o finalizada');
      const r = await this.dao.obtenerRepartidor(idRepartidor);
      if (!r) throw new AppError(404, 'Repartidor no encontrado');
      if (!r.disponible) throw new AppError(409, 'El repartidor seleccionado no está disponible');
      if (p.id_repartidor === idRepartidor && p.estado_pedido === 'Asignado') throw new AppError(409, 'El pedido ya está asignado a este repartidor');
      await this.dao.asignar(id, idRepartidor);
      return { ok: true };
    });
  }

  // ---------- RF27, RF28, RF30 ----------
  async iniciar(usuario, id) {
    return conInfra(async () => {
      const p = await this._propio(usuario, id);
      if (p.estado_pedido === 'Cancelado') throw new AppError(409, 'Este pedido fue cancelado');
      if (p.estado_pedido === 'En camino') throw new AppError(409, 'Esta entrega ya fue iniciada');
      if (!PedidoService.transicionValida(p.estado_pedido, 'En camino')) throw new AppError(409, 'Esta entrega ya fue finalizada');
      await this.dao.iniciar(id);
      return { ok: true };
    });
  }

  // ---------- RF31, RF42 ----------
  async entregar(usuario, id, { receptor, observacion } = {}) {
    const quien = (receptor || '').trim();
    if (!quien) throw new AppError(400, 'Escribe el nombre de quien recibe el pedido');
    return conInfra(async () => {
      const p = await this._propio(usuario, id);
      if (p.estado_pedido === 'Entregado') throw new AppError(409, 'Esta entrega ya fue confirmada');
      if (!PedidoService.transicionValida(p.estado_pedido, 'Entregado')) throw new AppError(409, 'Primero debes iniciar la entrega (el pedido no está en camino)');
      const id_factura = 'F001-' + String(id).padStart(8, '0');
      await this.dao.confirmarEntrega({
        idPedido: id, receptor: quien, observacion: (observacion || '').trim() || null,
        id_factura, ahora: this.reloj.ahora(), idCliente: p.id_cliente, idRepartidor: p.id_repartidor, fechaEntrega: p.fecha_entrega,
      });
      return { ok: true, id_factura };
    });
  }

  // ---------- RF47 ----------
  async registrarIncidencia(usuario, id, { observacion } = {}) {
    const obs = (observacion || '').trim();
    if (!obs) throw new AppError(400, 'Describe qué ocurrió con la entrega');
    return conInfra(async () => {
      const p = await this._propio(usuario, id);
      if (!['Asignado', 'En camino'].includes(p.estado_pedido)) throw new AppError(409, 'Esta entrega ya fue finalizada o cancelada');
      await this.dao.registrarIncidencia({ idPedido: id, observacion: obs, idUsuario: usuario.id, idRepartidor: p.id_repartidor, fechaEntrega: p.fecha_entrega });
      return { ok: true };
    });
  }

  // ---------- RF46 ----------
  async calificar(usuario, id, { puntaje, comentario } = {}) {
    const pts = parseInt(puntaje, 10);
    if (!(pts >= 1 && pts <= 5)) throw new AppError(400, 'Selecciona una puntuación');
    return conInfra(async () => {
      const p = await this.dao.obtener(id);
      if (!p || p.id_cliente !== (await this.dao.idCliente(usuario.id))) throw new AppError(403, 'Este pedido no te pertenece');
      if (p.estado_pedido !== 'Entregado') throw new AppError(409, 'Solo puedes calificar pedidos entregados');
      if (await this.dao.existeCalificacion(id)) throw new AppError(409, 'Este pedido ya fue calificado');
      await this.dao.guardarCalificacion(id, pts, (comentario || '').slice(0, 180) || null);
      return { ok: true };
    });
  }

  // Devuelve el pedido solo si está asignado al repartidor que hace la petición.
  async _propio(usuario, id) {
    const rid = await this.dao.idRepartidor(usuario.id);
    const p = await this.dao.obtener(id);
    if (!p || p.id_repartidor !== rid) throw new AppError(403, 'Este pedido no está asignado a ti');
    return p;
  }
}
module.exports = PedidoService;

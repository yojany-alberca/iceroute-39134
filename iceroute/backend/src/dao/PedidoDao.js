// Interfaz DAO de pedidos (tablas PEDIDO, DETALLE_PEDIDO, ENTREGA, FACTURA, CALIFICACION, MOVIMIENTO_KARDEX).
// Los métodos que cambian varias tablas (crearConReserva, cancelarConDevolucion, confirmarEntrega,
// registrarIncidencia) deben ejecutarse en UNA transacción: o se aplica todo o nada.
class PedidoDao {
  async idCliente(idUsuario) { throw new Error('No implementado'); }
  async idRepartidor(idUsuario) { throw new Error('No implementado'); }
  async contarPorBloque(fecha, hora) { throw new Error('No implementado'); }
  async crearConReserva(datos) { throw new Error('No implementado'); }
  async obtener(idPedido) { throw new Error('No implementado'); }
  async cancelarConDevolucion(idPedido, motivo, idUsuario) { throw new Error('No implementado'); }
  async obtenerRepartidor(idRepartidor) { throw new Error('No implementado'); }
  async asignar(idPedido, idRepartidor) { throw new Error('No implementado'); }
  async iniciar(idPedido) { throw new Error('No implementado'); }
  async confirmarEntrega(datos) { throw new Error('No implementado'); }
  async registrarIncidencia(datos) { throw new Error('No implementado'); }
  async existeCalificacion(idPedido) { throw new Error('No implementado'); }
  async guardarCalificacion(idPedido, puntaje, comentario) { throw new Error('No implementado'); }
}
module.exports = PedidoDao;

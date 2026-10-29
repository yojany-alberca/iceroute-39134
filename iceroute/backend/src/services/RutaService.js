// Reglas de la hoja de ruta (RF25): orden de las paradas del repartidor.
class RutaService {
  // pedidos: [{ id_pedido, hora_entrega }]. Ordena por hora y luego por número de pedido
  // y numera las paradas desde 1. No modifica el arreglo recibido.
  static ordenarParadas(pedidos) {
    return [...pedidos]
      .sort((a, b) => a.hora_entrega.localeCompare(b.hora_entrega) || a.id_pedido - b.id_pedido)
      .map((p, i) => ({ secuencia: i + 1, id_pedido: p.id_pedido, hora_estimada: p.hora_entrega.slice(0, 5) + ':00' }));
  }
}
module.exports = RutaService;

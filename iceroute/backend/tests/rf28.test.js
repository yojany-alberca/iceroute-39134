// Tests TDD del RF28 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const PedidoService = require('../src/services/PedidoService');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF28 Actualización del estado de entrega', () => {
  test('RF28-CP01 Asignado puede pasar a En camino', () => {
    // ACT + ASSERT
    expect(PedidoService.transicionValida('Asignado', 'En camino')).toBe(true);
  });
 
  test('RF28-CP02 En camino puede pasar a Entregado o No entregado', () => {
    // ACT + ASSERT
    expect(PedidoService.transicionValida('En camino', 'Entregado')).toBe(true);
    expect(PedidoService.transicionValida('En camino', 'No entregado')).toBe(true);
  });
 
  test('RF28-CP03 un estado fuera de la secuencia es rechazado', () => {
    // ACT + ASSERT
    expect(PedidoService.transicionValida('Pendiente', 'Entregado')).toBe(false);
    expect(PedidoService.transicionValida('Asignado', 'Entregado')).toBe(false);
  });
 
  test('RF28-CP04 un pedido finalizado o cancelado no cambia de estado', () => {
    // ACT + ASSERT
    expect(PedidoService.transicionValida('Entregado', 'En camino')).toBe(false);
    expect(PedidoService.transicionValida('Cancelado', 'Asignado')).toBe(false);
  });
 
  test('RF28-CP05 si falla el guardado el estado anterior se conserva', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('Asignado');
  });
});

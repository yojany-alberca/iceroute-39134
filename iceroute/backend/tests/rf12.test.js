// Tests TDD del RF12 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF12 Eliminación (cancelación) de pedidos', () => {
  test('RF12-CP01 el cliente cancela un pedido pendiente', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT
    const r = await svc.cancelar(cliente, p.id_pedido, '');
    // ASSERT
    expect(r).toEqual({ ok: true });
    expect(p.estado_pedido).toBe('Cancelado');
    expect(p.motivo).toBe('Cancelado por el cliente');
  });
 
  test('RF12-CP02 al cancelar se libera el stock y queda quién canceló', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT
    await svc.cancelar(cliente, p.id_pedido, '');
    // ASSERT
    expect(dao.devoluciones).toContain(p.id_pedido);
    expect(p.cancelado_por).toBe(10);
  });
 
  test('RF12-CP03 un pedido en camino o entregado no se puede cancelar', async () => {
    // ARRANGE
    const enCamino = nuevo('En camino', 5);
    const entregado = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.cancelar(cliente, enCamino.id_pedido, ''), 409, 'No se puede cancelar: el pedido ya va en camino');
    await esperarError(svc.cancelar(cliente, entregado.id_pedido, ''), 409, 'No se puede cancelar un pedido finalizado');
    expect(enCamino.estado_pedido).toBe('En camino');
    expect(dao.devoluciones).toHaveLength(0);
  });
 
  test('RF12-CP05 si falla la devolución de stock la cancelación no se aplica a medias', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    dao.falla = true; // el DAO transaccional falla (rollback)
    // ACT + ASSERT
    await esperarError(svc.cancelar(cliente, p.id_pedido, ''), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('Pendiente');
  });
});

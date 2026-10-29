// Tests TDD del RF31 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF31 Estado entregado', () => {
  test('RF31-CP01 el repartidor marca como entregado un pedido En camino', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT
    const r = await svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' });
    // ASSERT
    expect(r).toEqual({ ok: true, id_factura: 'F001-00000001' });
  });
 
  test('RF31-CP02 el pedido queda Entregado con la factura emitida', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT
    await svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' });
    // ASSERT
    expect(p.estado_pedido).toBe('Entregado');
    expect(dao.facturas).toEqual(['F001-00000001']);
  });
 
  test('RF31-CP03 un pedido que no está En camino no se puede entregar', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 409, 'Primero debes iniciar la entrega (el pedido no está en camino)');
  });
 
  test('RF31-CP04 una entrega ya confirmada no se registra dos veces', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 409, 'Esta entrega ya fue confirmada');
    expect(dao.facturas).toHaveLength(0);
  });
 
  test('RF31-CP05 si falla el registro se conserva el estado En camino', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('En camino');
  });
});

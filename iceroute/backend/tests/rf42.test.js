// Tests TDD del RF42 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF42 Confirmación de entrega', () => {
  test('RF42-CP01 la confirmación registra la fecha y hora exactas', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT
    await svc.entregar(repartidor, p.id_pedido, { receptor: 'María López', observacion: 'Recepción conforme' });
    // ASSERT
    expect(p.estado_pedido).toBe('Entregado');
    expect(p.entregado_en).toEqual(new Date('2026-10-29T10:15:00'));
  });
 
  test('RF42-CP02 un pedido que no está en camino bloquea la confirmación', async () => {
    // ARRANGE
    const p = nuevo('Pendiente', 5);
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 409, 'Primero debes iniciar la entrega (el pedido no está en camino)');
  });
 
  test('RF42-CP03 una entrega ya confirmada informa que fue realizada', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 409, 'Esta entrega ya fue confirmada');
  });
 
  test('RF42-CP04 si falla el registro el pedido conserva el estado En camino', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.entregar(repartidor, p.id_pedido, { receptor: 'María López' }), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('En camino');
  });
});

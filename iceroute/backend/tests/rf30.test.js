// Tests TDD del RF30 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF30 Estado en camino', () => {
  test('RF30-CP01 el repartidor registra la entrega como En camino', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    const r = await svc.iniciar(repartidor, p.id_pedido);
    // ASSERT
    expect(r.ok).toBe(true);
  });
 
  test('RF30-CP02 el estado registrado es En camino', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    await svc.iniciar(repartidor, p.id_pedido);
    // ASSERT
    expect(p.estado_pedido).toBe('En camino');
  });
 
  test('RF30-CP03 un pedido pendiente sin asignar no puede ponerse En camino', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 403, 'Este pedido no está asignado a ti');
  });
 
  test('RF30-CP04 un pedido ya entregado no puede ponerse En camino', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 409, 'Esta entrega ya fue finalizada');
  });
 
  test('RF30-CP05 si falla al guardar se mantiene el estado anterior', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('Asignado');
  });
});

// Tests TDD del RF27 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF27 Inicio de entrega', () => {
  test('RF27-CP01 el repartidor inicia una entrega asignada', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    const r = await svc.iniciar(repartidor, p.id_pedido);
    // ASSERT
    expect(r).toEqual({ ok: true });
  });
 
  test('RF27-CP02 el pedido pasa a estado En camino', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    await svc.iniciar(repartidor, p.id_pedido);
    // ASSERT
    expect(p.estado_pedido).toBe('En camino');
  });
 
  test('RF27-CP03 una entrega ya iniciada no se vuelve a iniciar', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 409, 'Esta entrega ya fue iniciada');
  });
 
  test('RF27-CP04 un repartidor no puede iniciar la entrega de otro', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 6);
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 403, 'Este pedido no está asignado a ti');
    expect(p.estado_pedido).toBe('Asignado');
  });
 
  test('RF27-CP05 si falla la actualización se conserva el estado anterior', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.iniciar(repartidor, p.id_pedido), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('Asignado');
  });
});

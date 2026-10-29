// Tests TDD del RF21 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF21 Reasignación de entregas', () => {
  test('RF21-CP01 se reasigna una entrega a otro repartidor disponible', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    const r = await svc.asignar(p.id_pedido, 6);
    // ASSERT
    expect(r).toEqual({ ok: true });
    expect(p.id_repartidor).toBe(6);
  });
 
  test('RF21-CP02 tras reasignar el pedido sigue en estado Asignado', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    await svc.asignar(p.id_pedido, 6);
    // ASSERT
    expect(p.estado_pedido).toBe('Asignado');
  });
 
  test('RF21-CP03 sin otro repartidor disponible no se reasigna', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 7), 409, 'El repartidor seleccionado no está disponible');
    expect(p.id_repartidor).toBe(5);
  });
 
  test('RF21-CP04 una entrega ya completada no se puede reasignar', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 6), 409, 'La entrega ya está en curso o finalizada');
    expect(p.id_repartidor).toBe(5);
  });
 
  test('RF21-CP05 si el nuevo repartidor deja de estar disponible se rechaza', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.reps[6].disponible = 0;
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 6), 409, 'El repartidor seleccionado no está disponible');
  });
 
  test('RF21-CP06 si falla la actualización se mantiene la asignación anterior', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 6), 500, MSG_SERVIDOR);
    expect(p.id_repartidor).toBe(5);
  });
});

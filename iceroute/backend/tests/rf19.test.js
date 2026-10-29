// Tests TDD del RF19 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF19 Asignación de pedidos', () => {
  test('RF19-CP01 el administrador asigna un pedido pendiente', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT
    const r = await svc.asignar(p.id_pedido, 5);
    // ASSERT
    expect(r).toEqual({ ok: true });
    expect(p.estado_pedido).toBe('Asignado');
  });
 
  test('RF19-CP02 el pedido queda asociado al repartidor elegido', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT
    await svc.asignar(p.id_pedido, 5);
    // ASSERT
    expect(p.id_repartidor).toBe(5);
  });
 
  test('RF19-CP03 un repartidor no disponible no recibe pedidos', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 7), 409, 'El repartidor seleccionado no está disponible');
    expect(p.estado_pedido).toBe('Pendiente');
  });
 
  test('RF19-CP04 asignar de nuevo al mismo repartidor es rechazado', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 5), 409, 'El pedido ya está asignado a este repartidor');
  });
 
  test('RF19-CP05 si el repartidor deja de estar disponible antes de confirmar se rechaza', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    dao.reps[5].disponible = 0;
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 5), 409, 'El repartidor seleccionado no está disponible');
  });
 
  test('RF19-CP06 si falla el registro el pedido sigue sin asignar', async () => {
    // ARRANGE
    const p = nuevo('Pendiente');
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.asignar(p.id_pedido, 5), 500, MSG_SERVIDOR);
    expect(p.id_repartidor).toBeNull();
  });
});

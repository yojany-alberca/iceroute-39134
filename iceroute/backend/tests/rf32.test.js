// Tests TDD del RF32 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF32 Estado cancelado', () => {
  test('RF32-CP01 el administrador cancela una entrega activa con motivo', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT
    await svc.cancelar(admin, p.id_pedido, 'Cliente no disponible');
    // ASSERT
    expect(p.estado_pedido).toBe('Cancelado');
  });
 
  test('RF32-CP02 el motivo queda registrado', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT
    await svc.cancelar(admin, p.id_pedido, '  Cliente no disponible  ');
    // ASSERT
    expect(p.motivo).toBe('Cliente no disponible');
  });
 
  test('RF32-CP03 sin motivo no se puede cancelar', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    // ACT + ASSERT
    await esperarError(svc.cancelar(admin, p.id_pedido, '   '), 400, 'Escribe el motivo de la cancelación');
    expect(p.estado_pedido).toBe('Asignado');
  });
 
  test('RF32-CP04 una entrega ya finalizada no se puede cancelar', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.cancelar(admin, p.id_pedido, 'Error'), 409, 'No se puede cancelar un pedido finalizado');
  });
 
  test('RF32-CP05 si falla la cancelación se conserva el estado anterior', async () => {
    // ARRANGE
    const p = nuevo('Asignado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.cancelar(admin, p.id_pedido, 'Cliente no disponible'), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('Asignado');
  });
});

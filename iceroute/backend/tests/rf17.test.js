// Tests TDD del RF17 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF17 Registro de horario de entrega', () => {
  test('RF17-CP01 un bloque con cupo agenda el pedido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ hora: '14:00-16:00' }));
    // ASSERT
    expect(dao.creados[0].hora).toBe('14:00-16:00');
  });
 
  test('RF17-CP02 con 9 cupos ocupados todavía se reserva el décimo', async () => {
    // ARRANGE
    dao.ocupados['2026-10-30|10:00-12:00'] = 9;
    // ACT
    await svc.crear(cliente, pedido());
    // ASSERT
    expect(dao.creados).toHaveLength(1);
  });
 
  test('RF17-CP03 un bloque con 10 pedidos ya no tiene cupos', async () => {
    // ARRANGE
    dao.ocupados['2026-10-30|10:00-12:00'] = 10;
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido()), 409, 'Este horario ya no tiene cupos. Elige otro.');
    expect(dao.creados).toHaveLength(0);
  });
 
  test.todo('RF17-CP04 ocultar bloques que ya expiraron el día actual (la app no filtra por hora actual)');
  test.todo('RF17-CP05 conflicto de reserva simultánea por el último cupo (requiere prueba de concurrencia con MySQL)');
});

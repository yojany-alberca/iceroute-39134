// Tests TDD del RF16 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF16 Registro de fecha de entrega', () => {
  test('RF16-CP01 una fecha hábil futura se asigna al pedido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ fecha: '2026-10-30' }));
    // ASSERT
    expect(dao.creados[0].fecha).toBe('2026-10-30');
  });
 
  test('RF16-CP02 el día 30 de anticipación todavía es válido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ fecha: '2026-11-28' }));
    // ASSERT
    expect(dao.creados).toHaveLength(1);
  });
 
  test('RF16-CP03 una fecha pasada es rechazada', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ fecha: '2026-10-28' })), 400, 'La fecha de entrega no puede ser anterior a hoy');
  });
 
  test('RF16-CP04 un domingo es rechazado', async () => {
    // ACT + ASSERT (01/11/2026 es domingo)
    await esperarError(svc.crear(cliente, pedido({ fecha: '2026-11-01' })), 400, 'Los domingos no hay reparto. Elige otro día');
  });
 
  test('RF16-CP05 una fecha a más de 30 días es rechazada', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ fecha: '2026-12-05' })), 400, 'Solo se puede programar hasta 30 días');
  });
});

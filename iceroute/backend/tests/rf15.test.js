// Tests TDD del RF15 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF15 Registro de cantidad de hielo', () => {
  const una = (cantidad) => pedido({ items: [{ id_tipo_hielo: 1, cantidad }] });
 
  test('RF15-CP01 el total se actualiza según la cantidad', async () => {
    // ACT
    const r = await svc.crear(cliente, una(3));
    // ASSERT: 3 x 3.50
    expect(r.total).toBe(10.5);
  });
 
  test('RF15-CP02 una cantidad válida queda registrada en la línea', async () => {
    // ACT
    await svc.crear(cliente, una(10));
    // ASSERT
    expect(dao.creados[0].lineas[0].cantidad).toBe(10);
  });
 
  test('RF15-CP03 una entrada no numérica es rechazada', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, una('abc')), 400, 'La cantidad debe ser mayor a 0');
  });
 
  test('RF15-CP04 cantidad cero o negativa es rechazada', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, una(0)), 400, 'La cantidad debe ser mayor a 0');
    await esperarError(svc.crear(cliente, una(-3)), 400, 'La cantidad debe ser mayor a 0');
  });
 
  test('RF15-CP05 una cantidad sobre el límite logístico (500) es rechazada', async () => {
    // ARRANGE
    kardex.saldos[1] = 1000;
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, una(501)), 400, 'La cantidad solicitada es demasiado alta. Comunícate con la empresa');
    await svc.crear(cliente, una(500)); // el límite exacto sí se acepta
    expect(dao.creados).toHaveLength(1);
  });
});

// Tests TDD del RF14 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF14 Registro de referencia del destino', () => {
  test('RF14-CP01 la referencia se guarda vinculada al pedido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ referencia: 'Frente al parque' }));
    // ASSERT
    expect(dao.creados[0].referencia).toBe('Frente al parque');
  });
 
  test('RF14-CP02 los espacios sobrantes se eliminan al guardar', async () => {
    // ACT
    await svc.crear(cliente, pedido({ referencia: '  Portón negro  ' }));
    // ASSERT
    expect(dao.creados[0].referencia).toBe('Portón negro');
  });
 
  test('RF14-CP03 una referencia de más de 180 caracteres es rechazada', async () => {
    // ARRANGE
    const larga = 'a'.repeat(181);
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ referencia: larga })), 400, 'La referencia no puede superar 180 caracteres');
    await svc.crear(cliente, pedido({ referencia: 'a'.repeat(180) })); // el límite exacto sí se acepta
    expect(dao.creados).toHaveLength(1);
  });
 
  test('RF14-CP04 caracteres no permitidos son rechazados', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ referencia: 'Casa <script>' })), 400, 'La referencia contiene caracteres no permitidos');
  });
 
  test('RF14-CP05 sin referencia el pedido se guarda igualmente', async () => {
    // ACT
    await svc.crear(cliente, pedido({ referencia: undefined }));
    // ASSERT
    expect(dao.creados[0].referencia).toBeNull();
  });
});

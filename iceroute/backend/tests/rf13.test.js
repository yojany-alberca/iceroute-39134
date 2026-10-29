// Tests TDD del RF13 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF13 Registro de dirección de entrega', () => {
  test('RF13-CP01 la dirección se guarda limpia y vinculada al pedido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ direccion: '  Av. Central 120  ' }));
    // ASSERT
    expect(dao.creados[0].direccion).toBe('Av. Central 120');
  });
 
  test('RF13-CP02 el pedido queda vinculado al distrito elegido', async () => {
    // ACT
    await svc.crear(cliente, pedido({ id_distrito: 2 }));
    // ASSERT
    expect(dao.creados[0].id_distrito).toBe(2);
  });
 
  test.todo('RF13-CP03 distrito fuera de la zona de cobertura (la app no valida cobertura)');
 
  test('RF13-CP04 dirección vacía no guarda el pedido', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ direccion: '' })), 400, 'Ingresa la dirección de entrega');
    expect(dao.creados).toHaveLength(0);
  });
 
  test('RF13-CP05 sin geolocalización (mapa caído) se guarda solo como texto', async () => {
    // ARRANGE: el pedido llega sin lat/lng
    // ACT
    await svc.crear(cliente, pedido());
    // ASSERT
    expect(dao.creados[0].lat).toBeNull();
    expect(dao.creados[0].lng).toBeNull();
  });
});

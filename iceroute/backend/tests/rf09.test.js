// Tests TDD del RF09 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });

describe('RF09 Registro de pedidos', () => {
  test('RF09-CP01 registro exitoso calcula el total y reserva el stock', async () => {
    // ARRANGE: 10 bolsas x S/ 3.50 + 2 bloques x S/ 12.00
    // ACT
    const r = await svc.crear(cliente, pedido());
    // ASSERT
    expect(r).toEqual({ id_pedido: 1, total: 59 });
    expect(dao.creados[0].lineas).toHaveLength(2);
    expect(dao.pedidos[1].estado_pedido).toBe('Pendiente');
  });
 
  test('RF09-CP02 stock insuficiente bloquea el registro', async () => {
    // ARRANGE: solo quedan 5 bolsas
    kardex.saldos[1] = 5;
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido()), 409, 'No hay stock suficiente de Bolsa de hielo (disponible: 5)');
    expect(dao.creados).toHaveLength(0);
  });
 
  test('RF09-CP03 datos del pedido incompletos son rechazados', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ items: [] })), 400, 'Selecciona al menos un producto');
    await esperarError(svc.crear(cliente, pedido({ direccion: '   ' })), 400, 'Ingresa la dirección de entrega');
    await esperarError(svc.crear(cliente, pedido({ fecha: '' })), 400, 'Elige la fecha de entrega');
    expect(dao.creados).toHaveLength(0);
  });
 
  test('RF09-CP04 horario fuera de los bloques configurados es rechazado', async () => {
    // ACT + ASSERT
    await esperarError(svc.crear(cliente, pedido({ hora: '07:00-08:00' })), 400, 'Elige un horario de entrega');
  });
});

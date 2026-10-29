// Tests TDD del RF46 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF46 Calificación del servicio de entrega', () => {
  test('RF46-CP01 el cliente califica un pedido entregado', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT
    await svc.calificar(cliente, p.id_pedido, { puntaje: 5, comentario: 'Excelente servicio' });
    // ASSERT
    expect(dao.calificaciones[p.id_pedido]).toEqual({ puntaje: 5, comentario: 'Excelente servicio' });
  });
 
  test('RF46-CP02 sin puntuación no se envía la calificación', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    // ACT + ASSERT
    await esperarError(svc.calificar(cliente, p.id_pedido, {}), 400, 'Selecciona una puntuación');
    expect(dao.calificaciones[p.id_pedido]).toBeUndefined();
  });
 
  test('RF46-CP03 un pedido ya calificado no acepta otra calificación', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    dao.calificaciones[p.id_pedido] = { puntaje: 4, comentario: null };
    // ACT + ASSERT
    await esperarError(svc.calificar(cliente, p.id_pedido, { puntaje: 5 }), 409, 'Este pedido ya fue calificado');
  });
 
  test('RF46-CP04 si falla el guardado no se registra la calificación', async () => {
    // ARRANGE
    const p = nuevo('Entregado', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.calificar(cliente, p.id_pedido, { puntaje: 5 }), 500, MSG_SERVIDOR);
    expect(dao.calificaciones[p.id_pedido]).toBeUndefined();
  });
});

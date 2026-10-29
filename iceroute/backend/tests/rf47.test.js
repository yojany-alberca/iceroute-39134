// Tests TDD del RF47 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoPedidos, actores, pedido } = require('./entorno');
const { cliente, admin, repartidor } = actores;
let dao, kardex, svc;
beforeEach(() => { ({ dao, kardex, svc } = crearEntornoPedidos()); });
// Crea un pedido en el estado indicado, asignado (o no) a un repartidor
const nuevo = (estado, rid = null) => dao.agregarPedido({ estado_pedido: estado, id_repartidor: rid });

describe('RF47 Registro de incidencias de entrega', () => {
  test('RF47-CP01 la incidencia se registra y el pedido pasa a No entregado', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT
    await svc.registrarIncidencia(repartidor, p.id_pedido, { observacion: 'Cliente no disponible; requiere nueva coordinación' });
    // ASSERT
    expect(p.estado_pedido).toBe('No entregado');
    expect(dao.incidencias).toHaveLength(1);
  });
 
  test('RF47-CP02 una descripción vacía es rechazada', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    // ACT + ASSERT
    await esperarError(svc.registrarIncidencia(repartidor, p.id_pedido, { observacion: '  ' }), 400, 'Describe qué ocurrió con la entrega');
  });
 
  test('RF47-CP03 no se puede registrar incidencia sobre un pedido de otro repartidor', async () => {
    // ARRANGE
    const p = nuevo('En camino', 6);
    // ACT + ASSERT
    await esperarError(svc.registrarIncidencia(repartidor, p.id_pedido, { observacion: 'Cliente ausente' }), 403, 'Este pedido no está asignado a ti');
  });
 
  test('RF47-CP04 si falla el registro el pedido conserva su estado', async () => {
    // ARRANGE
    const p = nuevo('En camino', 5);
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.registrarIncidencia(repartidor, p.id_pedido, { observacion: 'Cliente ausente' }), 500, MSG_SERVIDOR);
    expect(p.estado_pedido).toBe('En camino');
  });
});

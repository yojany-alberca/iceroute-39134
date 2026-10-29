// Entornos de prueba: arman el servicio con DAO falsos y datos base (patrón ARRANGE compartido).
const { FakeUsuarioDao, FakePedidoDao, FakeCatalogoDao, FakeKardexDao, reloj, hasher, tokens } = require('./fakes');
const AuthService = require('../src/services/AuthService');
const UsuarioService = require('../src/services/UsuarioService');
const PedidoService = require('../src/services/PedidoService');

// Usuarios de la sesión simulada (id = id_usuario)
const actores = {
  cliente: { id: 10, rol: 'cliente' },
  repartidor: { id: 20, rol: 'repartidor' },
  admin: { id: 99, rol: 'admin' },
};

function crearEntornoUsuarios() {
  const dao = new FakeUsuarioDao();
  return { dao, auth: new AuthService(dao, hasher, tokens), usuarios: new UsuarioService(dao) };
}

function crearEntornoPedidos() {
  const dao = new FakePedidoDao();
  dao.clientes[actores.cliente.id] = 1;        // el usuario 10 es el cliente 1
  dao.repartidores[actores.repartidor.id] = 5; // el usuario 20 es el repartidor 5
  dao.reps = {
    5: { id_repartidor: 5, disponible: 1 },
    6: { id_repartidor: 6, disponible: 1 },
    7: { id_repartidor: 7, disponible: 0 },    // repartidor no disponible
  };
  const kardex = new FakeKardexDao();          // saldos: 100 bolsas, 30 bloques
  const svc = new PedidoService(dao, new FakeCatalogoDao(), kardex, reloj());
  return { dao, kardex, svc };
}

// Pedido válido: 10 bolsas x S/ 3.50 + 2 bloques x S/ 12.00 = S/ 59.00, viernes 30/10/2026, bloque 10:00-12:00
const pedido = (cambios = {}) => ({
  items: [{ id_tipo_hielo: 1, cantidad: 10 }, { id_tipo_hielo: 2, cantidad: 2 }],
  direccion: 'Av. Central 120', id_distrito: 1, fecha: '2026-10-30', hora: '10:00-12:00', ...cambios,
});

module.exports = { actores, crearEntornoUsuarios, crearEntornoPedidos, pedido };

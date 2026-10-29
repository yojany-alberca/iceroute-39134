// Tests TDD del RF05 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoUsuarios, actores } = require('./entorno');
const { hasher, tokens } = require('./fakes');
const AuthService = require('../src/services/AuthService');
const UsuarioService = require('../src/services/UsuarioService');
const { admin } = actores;
let dao, svc;
beforeEach(() => { ({ dao, usuarios: svc } = crearEntornoUsuarios()); });

describe('RF05 Asignación de roles', () => {
  test('RF05-CP01 asignar un nuevo rol actualiza los privilegios', async () => {
    // ARRANGE
    const u = dao.agregar({ rol: 'cliente' });
    // ACT
    await svc.actualizar(admin, u.id_usuario, { rol: 'admin' });
    // ASSERT
    expect(u.rol).toBe('admin');
  });
 
  test('RF05-CP02 asignar el rol que ya posee es rechazado', async () => {
    // ARRANGE
    const u = dao.agregar({ rol: 'repartidor' });
    // ACT + ASSERT
    await esperarError(svc.actualizar(admin, u.id_usuario, { rol: 'repartidor' }), 409, 'El usuario ya tiene ese rol');
  });
 
  test.todo('RF05-CP03 faltan datos obligatorios para el nuevo rol (la app no pide datos adicionales por rol)');
  test.todo('RF05-CP04 restricción de jerarquía al asignar roles críticos (la app solo tiene un nivel de administrador)');
});

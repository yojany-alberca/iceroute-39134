// Tests TDD del RF06 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoUsuarios } = require('./entorno');
let dao, svc;
const { hasher, tokens } = require('./fakes');
const AuthService = require('../src/services/AuthService');
beforeEach(() => { ({ dao, auth: svc } = crearEntornoUsuarios()); });

describe('RF06 Registro de clientes', () => {
  const auth = () => new AuthService(dao, hasher, tokens);
  const cliente = { nombres: 'Bodega La Esquina', telefono: '912345678', email: 'bodega@correo.com', password: 'Hielo2026!' };
 
  test('RF06-CP01 se registra un cliente nuevo', async () => {
    // ACT
    const r = await auth().registrar(cliente);
    // ASSERT
    expect(r.user.rol).toBe('cliente');
    expect(dao.usuarios).toHaveLength(1);
  });
 
  test('RF06-CP02 teléfono ya registrado es rechazado', async () => {
    // ARRANGE
    dao.agregar({ email: 'otro@correo.com', telefono: '912345678' });
    // ACT + ASSERT
    await esperarError(auth().registrar(cliente), 409, 'Este número de celular ya está registrado');
  });
 
  test.todo('RF06-CP03 dirección de entrega incompleta (la dirección se captura al pedir, no al registrar)');
  test.todo('RF06-CP04 dirección fuera de la zona de cobertura (la app no valida cobertura)');
});

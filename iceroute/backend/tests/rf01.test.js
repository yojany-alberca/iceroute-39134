// Tests TDD del RF01 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoUsuarios } = require('./entorno');
const datosValidos = { nombres: 'Ana Torres', telefono: '999111222', email: 'ana@correo.com', password: 'Hielo2026!' };
let dao, svc;
beforeEach(() => { ({ dao, auth: svc } = crearEntornoUsuarios()); });

describe('RF01 Registro de usuarios', () => {
  test('RF01-CP01 registro exitoso crea cuenta de cliente con contraseña cifrada', async () => {
    // ARRANGE: DAO vacío y datos válidos (datos de datosValidos)
    // ACT
    const r = await svc.registrar(datosValidos);
    // ASSERT
    expect(r.user.rol).toBe('cliente');
    expect(r.user.email).toBe('ana@correo.com');
    expect(r.token).toBe('token-1');
    expect(dao.usuarios).toHaveLength(1);
    expect(dao.usuarios[0].passwordHash).toBe('hash(Hielo2026!)');
  });
 
  test('RF01-CP02 correo ya registrado es rechazado', async () => {
    // ARRANGE
    dao.agregar({ email: 'ana@correo.com', telefono: '999111222' });
    // ACT + ASSERT
    await esperarError(svc.registrar(datosValidos), 409, 'Este correo ya pertenece a una cuenta');
    expect(dao.usuarios).toHaveLength(1);
  });
 
  test('RF01-CP03 campos incompletos o con formato inválido son rechazados', async () => {
    // ARRANGE + ACT + ASSERT (tres variantes del mismo escenario)
    await esperarError(svc.registrar({ ...datosValidos, nombres: '' }), 400, 'Completa todos los campos');
    await esperarError(svc.registrar({ ...datosValidos, email: 'ana@correo' }), 400, 'Ingresa un correo válido');
    await esperarError(svc.registrar({ ...datosValidos, password: 'hielo' }), 400,
      'Esta contraseña no es suficientemente segura. Se pide un mínimo de 8 caracteres, una mayúscula y un carácter especial');
    expect(dao.usuarios).toHaveLength(0);
  });
 
  test('RF01-CP04 caída de la base de datos devuelve error genérico y no registra', async () => {
    // ARRANGE
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.registrar(datosValidos), 500, MSG_SERVIDOR);
  });
});

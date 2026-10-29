// Tests TDD del RF02 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { MSG_SERVIDOR } = require('../src/errors');
const { crearEntornoUsuarios } = require('./entorno');
let dao, svc;
beforeEach(() => { ({ dao, auth: svc } = crearEntornoUsuarios()); });

describe('RF02 Inicio de sesión', () => {
  const alta = () => dao.agregar({ nombres: 'Carlos Rojas', email: 'repartidor@iceroute.com', telefono: '900000002', passwordHash: 'hash(Hielo2026!)', rol: 'repartidor' });
 
  test('RF02-CP01 credenciales válidas entregan token y rol', async () => {
    // ARRANGE
    alta();
    // ACT
    const r = await svc.login({ email: 'Repartidor@iceroute.com ', password: 'Hielo2026!' });
    // ASSERT
    expect(r.token).toBe('token-1');
    expect(r.user.rol).toBe('repartidor');
  });
 
  test('RF02-CP02 contraseña incorrecta se rechaza y cuenta el intento', async () => {
    // ARRANGE
    const u = alta();
    // ACT + ASSERT
    await esperarError(svc.login({ email: 'repartidor@iceroute.com', password: 'Mala123!' }), 401, 'Contraseña incorrecta');
    expect(u.intentos_fallidos).toBe(1);
  });
 
  test('RF02-CP03 campos vacíos no consultan la base de datos', async () => {
    // ARRANGE
    dao.falla = true; // si el servicio consultara el DAO, devolvería 500
    // ACT + ASSERT
    await esperarError(svc.login({ email: '', password: '' }), 400, 'Ingresa tu correo y contraseña');
  });
 
  test('RF02-CP04 correo no registrado se informa', async () => {
    // ACT + ASSERT
    await esperarError(svc.login({ email: 'nadie@iceroute.com', password: 'Hielo2026!' }), 404, 'Este correo no pertenece a una cuenta existente');
  });
 
  test('RF02-CP05 caída de la base de datos devuelve error genérico', async () => {
    // ARRANGE
    dao.falla = true;
    // ACT + ASSERT
    await esperarError(svc.login({ email: 'repartidor@iceroute.com', password: 'Hielo2026!' }), 500, MSG_SERVIDOR);
  });
});

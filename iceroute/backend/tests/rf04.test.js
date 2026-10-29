// Tests TDD del RF04 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const { esperarError } = require('./helpers');
const { crearEntornoUsuarios, actores } = require('./entorno');
const { hasher, tokens } = require('./fakes');
const AuthService = require('../src/services/AuthService');
const UsuarioService = require('../src/services/UsuarioService');
const { admin } = actores;
let dao, svc;
beforeEach(() => { ({ dao, usuarios: svc } = crearEntornoUsuarios()); });

describe('RF04 Gestión de usuarios', () => {
  test('RF04-CP02 el administrador edita el rol de un usuario', async () => {
    // ARRANGE
    const u = dao.agregar({ email: 'cliente@iceroute.com', rol: 'cliente' });
    // ACT
    const r = await svc.actualizar(admin, u.id_usuario, { rol: 'repartidor' });
    // ASSERT
    expect(r).toEqual({ ok: true });
    expect(u.rol).toBe('repartidor');
  });
 
  test('RF04-CP03 una cuenta desactivada ya no puede iniciar sesión', async () => {
    // ARRANGE
    const u = dao.agregar({ email: 'cliente@iceroute.com', passwordHash: 'hash(Hielo2026!)', rol: 'cliente' });
    // ACT
    await svc.actualizar(admin, u.id_usuario, { activo: false });
    // ASSERT
    expect(u.activo).toBe(0);
    const auth = new AuthService(dao, hasher, tokens);
    await esperarError(auth.login({ email: 'cliente@iceroute.com', password: 'Hielo2026!' }), 403, 'Tu cuenta está inhabilitada. Comunícate con el administrador.');
  });
 
  test('RF04-CP04 un rol sin privilegios no accede al módulo', () => {
    // ARRANGE + ACT + ASSERT
    expect(() => UsuarioService.autorizar('cliente', ['admin'])).toThrow('No tienes permiso para esta acción');
    expect(UsuarioService.autorizar('admin', ['admin'])).toBe(true);
  });
});

// Reglas de cuentas: registro (RF01, RF06) e inicio de sesión (RF02, RF04-CP03).
const { AppError, conInfra } = require('../errors');

const RE_PASS = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_TEL = /^\+?[\d\s]{7,15}$/;
const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 15;

class AuthService {
  // dao: UsuarioDao | hasher: { hash, compare } (bcryptjs) | tokens: { firmar } (jsonwebtoken)
  constructor(dao, hasher, tokens) { this.dao = dao; this.hasher = hasher; this.tokens = tokens; }

  async registrar({ nombres, telefono, email, password } = {}) {
    if (!nombres?.trim() || !telefono?.trim() || !email?.trim() || !password) throw new AppError(400, 'Completa todos los campos');
    if (!RE_MAIL.test(email)) throw new AppError(400, 'Ingresa un correo válido');
    if (!RE_TEL.test(telefono)) throw new AppError(400, 'Ingresa un número de celular válido');
    if (!RE_PASS.test(password)) {
      throw new AppError(400, 'Esta contraseña no es suficientemente segura. Se pide un mínimo de 8 caracteres, una mayúscula y un carácter especial');
    }
    const mail = email.toLowerCase();
    return conInfra(async () => {
      const dup = await this.dao.buscarPorEmailOTelefono(mail, telefono.trim());
      if (dup) throw new AppError(409, dup.email === mail ? 'Este correo ya pertenece a una cuenta' : 'Este número de celular ya está registrado');
      const passwordHash = await this.hasher.hash(password);
      const id = await this.dao.crear({ nombres: nombres.trim(), email: mail, telefono: telefono.trim(), passwordHash, rol: 'cliente' });
      const user = { id, nombres: nombres.trim(), email: mail, telefono: telefono.trim(), rol: 'cliente' };
      return { token: this.tokens.firmar({ id }), user };
    });
  }

  async login({ email, password } = {}) {
    if (!email || !password) throw new AppError(400, 'Ingresa tu correo y contraseña');
    return conInfra(async () => {
      const u = await this.dao.buscarPorEmail(email.toLowerCase().trim());
      if (!u) throw new AppError(404, 'Este correo no pertenece a una cuenta existente');
      if (!u.activo) throw new AppError(403, 'Tu cuenta está inhabilitada. Comunícate con el administrador.');
      if (u.bloqueado) throw new AppError(423, 'bloqueado');
      if (!(await this.hasher.compare(password, u.passwordHash))) {
        const n = (u.intentos_fallidos || 0) + 1;
        if (n >= MAX_INTENTOS) {
          await this.dao.reiniciarIntentos(u.id_usuario);
          await this.dao.bloquear(u.id_usuario, MINUTOS_BLOQUEO);
          throw new AppError(423, 'bloqueado');
        }
        await this.dao.registrarIntentoFallido(u.id_usuario, n);
        throw new AppError(401, 'Contraseña incorrecta');
      }
      await this.dao.reiniciarIntentos(u.id_usuario);
      return { token: this.tokens.firmar({ id: u.id_usuario }), user: { id: u.id_usuario, nombres: u.nombres, email: u.email, telefono: u.telefono, rol: u.rol } };
    });
  }
}
module.exports = AuthService;

// Reglas de gestión de usuarios y roles (RF04, RF05).
const { AppError, conInfra } = require('../errors');

const ROLES = ['admin', 'cliente', 'repartidor'];

class UsuarioService {
  constructor(dao) { this.dao = dao; }

  // Verifica que el rol del usuario esté entre los permitidos para la acción.
  static autorizar(rol, rolesPermitidos) {
    if (!rolesPermitidos.includes(rol)) throw new AppError(403, 'No tienes permiso para esta acción');
    return true;
  }

  // actor: { id, rol } del administrador que ejecuta | cambios: { rol?, activo? }
  async actualizar(actor, id, { rol, activo } = {}) {
    if (id === actor.id) throw new AppError(403, 'No puedes modificar tu propia cuenta por seguridad');
    return conInfra(async () => {
      const u = await this.dao.buscarPorId(id);
      if (!u) throw new AppError(404, 'Usuario no encontrado');
      if (rol !== undefined && !ROLES.includes(rol)) throw new AppError(400, 'Rol no válido');
      if (rol === u.rol && activo === undefined) throw new AppError(409, 'El usuario ya tiene ese rol');
      const cambiaRol = rol !== undefined && rol !== u.rol;
      if ((cambiaRol && u.rol === 'repartidor') || activo === false || activo === 0) {
        const rid = await this.dao.idRepartidor(id);
        if (rid && (await this.dao.contarEntregasActivas(rid)) > 0) {
          throw new AppError(409, 'Este repartidor tiene entregas activas. Reasígnalas primero.');
        }
      }
      if (cambiaRol) await this.dao.actualizarRol(id, rol);
      if (activo !== undefined) await this.dao.actualizarActivo(id, activo);
      return { ok: true };
    });
  }
}
module.exports = UsuarioService;

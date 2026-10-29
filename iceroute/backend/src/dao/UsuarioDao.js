// Interfaz DAO de usuarios (tabla USUARIO / REPARTIDOR). Las implementaciones concretas
// (MySQL) y los DAO falsos de las pruebas extienden esta clase. Siempre con consultas parametrizadas.
class UsuarioDao {
  async buscarPorEmail(email) { throw new Error('No implementado'); }
  async buscarPorEmailOTelefono(email, telefono) { throw new Error('No implementado'); }
  async buscarPorId(id) { throw new Error('No implementado'); }
  async crear(datos) { throw new Error('No implementado'); }
  async actualizarRol(id, rol) { throw new Error('No implementado'); }
  async actualizarActivo(id, activo) { throw new Error('No implementado'); }
  async registrarIntentoFallido(id, intentos) { throw new Error('No implementado'); }
  async bloquear(id, minutos) { throw new Error('No implementado'); }
  async reiniciarIntentos(id) { throw new Error('No implementado'); }
  async idRepartidor(idUsuario) { throw new Error('No implementado'); }
  async contarEntregasActivas(idRepartidor) { throw new Error('No implementado'); }
}
module.exports = UsuarioDao;

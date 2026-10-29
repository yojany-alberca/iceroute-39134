// ESQUELETO de la fase ROJA (TDD): mismas clases y métodos que src/services/UsuarioService.js, pero SIN lógica.
// Los tests se ejecutan contra este archivo (npm run test:red) y deben fallar todos.
const NO = () => { throw new Error('No implementado'); };
class UsuarioService {
  constructor(dao) {}
  static autorizar() { NO(); }
  async actualizar() { NO(); }
}
module.exports = UsuarioService;

// ESQUELETO de la fase ROJA (TDD): mismas clases y métodos que src/services/AuthService.js, pero SIN lógica.
// Los tests se ejecutan contra este archivo (npm run test:red) y deben fallar todos.
const NO = () => { throw new Error('No implementado'); };
class AuthService {
  constructor(dao, hasher, tokens) {}
  async registrar() { NO(); }
  async login() { NO(); }
}
module.exports = AuthService;

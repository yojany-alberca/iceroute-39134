// ESQUELETO de la fase ROJA (TDD): mismas clases y métodos que src/services/RutaService.js, pero SIN lógica.
// Los tests se ejecutan contra este archivo (npm run test:red).
const NO = () => { throw new Error('No implementado'); };
class RutaService {
  static ordenarParadas() { NO(); }
}
module.exports = RutaService;

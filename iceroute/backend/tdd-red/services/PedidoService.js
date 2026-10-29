// ESQUELETO de la fase ROJA (TDD): mismas clases y métodos que src/services/PedidoService.js, pero SIN lógica.
// Los tests se ejecutan contra este archivo (npm run test:red).
const NO = () => { throw new Error('No implementado'); };
class PedidoService {
  constructor(dao, catalogo, kardex, reloj) {}
  static transicionValida() { NO(); }
  async crear() { NO(); }
  async cancelar() { NO(); }
  async asignar() { NO(); }
  async iniciar() { NO(); }
  async entregar() { NO(); }
  async registrarIncidencia() { NO(); }
  async calificar() { NO(); }
}
module.exports = PedidoService;

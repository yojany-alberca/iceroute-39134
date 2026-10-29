// Errores de negocio y manejo de fallas de infraestructura.
const MSG_SERVIDOR = 'Ocurrió un error en el servidor. Intenta de nuevo.';

class AppError extends Error {
  constructor(status, message, opciones) {
    super(message, opciones);
    this.name = 'AppError';
    this.status = status;
  }
}

// Ejecuta una operación de servicio. Los AppError (reglas de negocio) pasan tal cual;
// cualquier otro error (caída de MySQL, deadlock, red) se convierte en un 500 genérico
// sin exponer detalles internos al cliente. La causa original queda en error.cause.
async function conInfra(operacion) {
  try {
    return await operacion();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(500, MSG_SERVIDOR, { cause: e });
  }
}

module.exports = { AppError, MSG_SERVIDOR, conInfra };

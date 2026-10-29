const { AppError } = require('../src/errors');
 
// Verifica que la promesa falle con un AppError de cierto código HTTP y mensaje exacto.
async function esperarError(promesa, status, mensaje) {
  let error = null;
  try { await promesa; } catch (e) { error = e; }
  expect(error).toBeInstanceOf(AppError);
  expect(error.status).toBe(status);
  expect(error.message).toBe(mensaje);
}
module.exports = { esperarError };

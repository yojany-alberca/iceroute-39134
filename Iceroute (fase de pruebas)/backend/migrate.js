// Prepara la base de datos al encender el servidor: agrega lo nuevo SIN borrar datos existentes.
// Así quien ya tenía la BD creada no necesita volver a importar el .sql.
module.exports = async function migrar(db) {
  const existeColumna = async (tabla, col) => (await db.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [tabla, col]))[0].length > 0;

  // RF24: prioridad de la entrega
  if (!(await existeColumna('pedido', 'prioridad'))) {
    await db.query("ALTER TABLE pedido ADD COLUMN prioridad VARCHAR(10) NOT NULL DEFAULT 'Media'");
  }
  // RF35/RF45: avisos para el cliente / administrador
  await db.query(`CREATE TABLE IF NOT EXISTS notificacion (
    id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_pedido INT NULL,
    mensaje VARCHAR(250) NOT NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);
  // RF43/RF44: evidencia de entrega (el archivo se guarda en backend/uploads)
  await db.query(`CREATE TABLE IF NOT EXISTS evidencia_entrega (
    id_pedido INT PRIMARY KEY,
    archivo VARCHAR(255) NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evid_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
  )`);
};

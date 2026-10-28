-- =====================================================================
--  IceRoute - Hielos "La Nevada"  |  Base de datos unificada (MySQL 8)
--  Basada en las 5 vistas normalizadas (pedido, inventario, factura,
--  ruta, entrega) + tablas de acceso (usuario) y calificación.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS iceroute CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE iceroute;

-- ---------- Acceso ----------
CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  telefono VARCHAR(15) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol ENUM('admin','cliente','repartidor') NOT NULL DEFAULT 'cliente',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  intentos_fallidos TINYINT NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Catálogos ----------
CREATE TABLE distrito (
  id_distrito INT AUTO_INCREMENT PRIMARY KEY,
  nombre_distrito VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE concepto_facturable (
  id_concepto INT AUTO_INCREMENT PRIMARY KEY,
  descripcion VARCHAR(100) NOT NULL,
  precio_lista DECIMAL(10,2) NOT NULL,
  CONSTRAINT ck_concepto_precio CHECK (precio_lista >= 0)
);

CREATE TABLE tipo_hielo (
  id_tipo_hielo INT AUTO_INCREMENT PRIMARY KEY,
  descripcion VARCHAR(80) NOT NULL UNIQUE,
  unidad_medida VARCHAR(20) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  id_concepto INT NOT NULL,
  CONSTRAINT ck_tipo_precio CHECK (precio >= 0),
  CONSTRAINT fk_tipo_concepto FOREIGN KEY (id_concepto) REFERENCES concepto_facturable(id_concepto)
);

CREATE TABLE estado_entrega (
  id_estado INT AUTO_INCREMENT PRIMARY KEY,
  descripcion_estado VARCHAR(40) NOT NULL UNIQUE
);

-- ---------- Personas ----------
CREATE TABLE cliente (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  direccion VARCHAR(180) NULL,
  referencias VARCHAR(180) NULL,
  id_distrito INT NULL,
  CONSTRAINT fk_cliente_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
  CONSTRAINT fk_cliente_distrito FOREIGN KEY (id_distrito) REFERENCES distrito(id_distrito)
);

CREATE TABLE repartidor (
  id_repartidor INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  disponible TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_repartidor_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

CREATE TABLE vehiculo (
  id_vehiculo INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(10) NOT NULL UNIQUE,
  modelo VARCHAR(60) NOT NULL
);

CREATE TABLE ubicacion_repartidor (
  id_repartidor INT PRIMARY KEY,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ubic_repartidor FOREIGN KEY (id_repartidor) REFERENCES repartidor(id_repartidor)
);

-- ---------- Vista 1: Pedidos ----------
CREATE TABLE pedido (
  id_pedido INT AUTO_INCREMENT PRIMARY KEY,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado_pedido VARCHAR(25) NOT NULL DEFAULT 'Pendiente',
  id_cliente INT NOT NULL,
  id_repartidor INT NULL,
  direccion_entrega VARCHAR(180) NOT NULL,
  referencia VARCHAR(180) NULL,
  id_distrito INT NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  fecha_entrega DATE NOT NULL,
  hora_entrega VARCHAR(11) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  motivo_cancelacion VARCHAR(180) NULL,
  CONSTRAINT ck_pedido_estado CHECK (estado_pedido IN ('Pendiente','Asignado','En camino','Entregado','Cancelado','No entregado')),
  CONSTRAINT fk_pedido_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
  CONSTRAINT fk_pedido_repartidor FOREIGN KEY (id_repartidor) REFERENCES repartidor(id_repartidor),
  CONSTRAINT fk_pedido_distrito FOREIGN KEY (id_distrito) REFERENCES distrito(id_distrito)
);

CREATE TABLE detalle_pedido (
  id_pedido INT NOT NULL,
  num_linea SMALLINT NOT NULL,
  id_tipo_hielo INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id_pedido, num_linea),
  CONSTRAINT ck_detalle_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_detalle_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_tipo FOREIGN KEY (id_tipo_hielo) REFERENCES tipo_hielo(id_tipo_hielo)
);

-- ---------- Vista 2: Inventario (kardex) ----------
CREATE TABLE movimiento_kardex (
  id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
  fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo_movimiento VARCHAR(10) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  observacion VARCHAR(180) NULL,
  id_tipo_hielo INT NOT NULL,
  id_usuario INT NOT NULL,
  CONSTRAINT ck_mov_tipo CHECK (tipo_movimiento IN ('ENTRADA','SALIDA')),
  CONSTRAINT ck_mov_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_mov_tipo FOREIGN KEY (id_tipo_hielo) REFERENCES tipo_hielo(id_tipo_hielo),
  CONSTRAINT fk_mov_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

-- ---------- Vista 3: Factura ----------
CREATE TABLE factura (
  id_factura VARCHAR(15) PRIMARY KEY,
  fecha_emision DATE NOT NULL,
  estado VARCHAR(20) NOT NULL,
  id_cliente INT NOT NULL,
  id_pedido INT NOT NULL UNIQUE,
  CONSTRAINT fk_factura_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
  CONSTRAINT fk_factura_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

CREATE TABLE detalle_factura (
  id_factura VARCHAR(15) NOT NULL,
  num_linea SMALLINT NOT NULL,
  id_concepto INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id_factura, num_linea),
  CONSTRAINT ck_fact_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_fact_precio CHECK (precio_unitario >= 0),
  CONSTRAINT fk_df_factura FOREIGN KEY (id_factura) REFERENCES factura(id_factura) ON DELETE CASCADE,
  CONSTRAINT fk_df_concepto FOREIGN KEY (id_concepto) REFERENCES concepto_facturable(id_concepto)
);

-- ---------- Vista 4: Hoja de ruta ----------
CREATE TABLE ruta (
  id_ruta INT AUTO_INCREMENT PRIMARY KEY,
  fecha_ruta DATE NOT NULL,
  estado_ruta VARCHAR(25) NOT NULL DEFAULT 'Planificada',
  id_repartidor INT NOT NULL,
  id_vehiculo INT NULL,
  UNIQUE KEY uq_ruta_dia (id_repartidor, fecha_ruta),
  CONSTRAINT fk_ruta_repartidor FOREIGN KEY (id_repartidor) REFERENCES repartidor(id_repartidor),
  CONSTRAINT fk_ruta_vehiculo FOREIGN KEY (id_vehiculo) REFERENCES vehiculo(id_vehiculo)
);

CREATE TABLE detalle_ruta (
  id_ruta INT NOT NULL,
  secuencia SMALLINT NOT NULL,
  id_pedido INT NOT NULL UNIQUE,
  hora_estimada TIME NULL,
  PRIMARY KEY (id_ruta, secuencia),
  CONSTRAINT ck_ruta_secuencia CHECK (secuencia > 0),
  CONSTRAINT fk_dr_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE,
  CONSTRAINT fk_dr_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

-- ---------- Vista 5: Entrega ----------
CREATE TABLE entrega (
  id_entrega INT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora_entrega DATETIME NULL,
  receptor VARCHAR(120) NULL,
  evidencia VARCHAR(255) NULL,
  observacion VARCHAR(180) NULL,
  id_pedido INT NOT NULL UNIQUE,
  id_estado INT NOT NULL,
  CONSTRAINT fk_entrega_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
  CONSTRAINT fk_entrega_estado FOREIGN KEY (id_estado) REFERENCES estado_entrega(id_estado)
);

CREATE TABLE calificacion (
  id_pedido INT PRIMARY KEY,
  puntaje TINYINT NOT NULL,
  comentario VARCHAR(180) NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_calif CHECK (puntaje BETWEEN 1 AND 5),
  CONSTRAINT fk_calif_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

-- ---------- Vistas de consulta ----------
CREATE VIEW v_saldo_inventario AS
SELECT t.id_tipo_hielo, t.descripcion, t.unidad_medida,
       COALESCE(SUM(CASE WHEN m.tipo_movimiento='ENTRADA' THEN m.cantidad
                         WHEN m.tipo_movimiento='SALIDA' THEN -m.cantidad END),0) AS saldo_actual
FROM tipo_hielo t LEFT JOIN movimiento_kardex m ON m.id_tipo_hielo=t.id_tipo_hielo
GROUP BY t.id_tipo_hielo, t.descripcion, t.unidad_medida;

CREATE VIEW v_resumen_pedido AS
SELECT p.id_pedido, p.fecha_registro, p.estado_pedido, u.nombres AS cliente, u.telefono,
       p.direccion_entrega, SUM(dp.cantidad) AS cantidad_total, p.total
FROM pedido p JOIN cliente c ON c.id_cliente=p.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
JOIN detalle_pedido dp ON dp.id_pedido=p.id_pedido
GROUP BY p.id_pedido, p.fecha_registro, p.estado_pedido, u.nombres, u.telefono, p.direccion_entrega, p.total;

CREATE VIEW v_total_factura AS
SELECT f.id_factura, f.fecha_emision, u.nombres AS cliente,
       SUM(d.cantidad*d.precio_unitario) AS subtotal,
       ROUND(SUM(d.cantidad*d.precio_unitario)*0.18,2) AS igv_referencial,
       ROUND(SUM(d.cantidad*d.precio_unitario)*1.18,2) AS total_referencial
FROM factura f JOIN cliente c ON c.id_cliente=f.id_cliente JOIN usuario u ON u.id_usuario=c.id_usuario
JOIN detalle_factura d ON d.id_factura=f.id_factura
GROUP BY f.id_factura, f.fecha_emision, u.nombres;

CREATE VIEW v_hoja_ruta AS
SELECT r.id_ruta, r.fecha_ruta, r.estado_ruta, ur.nombres AS repartidor, v.placa, v.modelo,
       dr.secuencia, p.id_pedido, p.direccion_entrega, dr.hora_estimada
FROM ruta r JOIN repartidor rep ON rep.id_repartidor=r.id_repartidor
JOIN usuario ur ON ur.id_usuario=rep.id_usuario
LEFT JOIN vehiculo v ON v.id_vehiculo=r.id_vehiculo
JOIN detalle_ruta dr ON dr.id_ruta=r.id_ruta JOIN pedido p ON p.id_pedido=dr.id_pedido;

CREATE VIEW v_control_entrega AS
SELECT e.id_entrega, p.id_pedido, p.direccion_entrega, ee.descripcion_estado,
       e.fecha_hora_entrega, e.receptor, e.evidencia, e.observacion
FROM entrega e JOIN pedido p ON p.id_pedido=e.id_pedido JOIN estado_entrega ee ON ee.id_estado=e.id_estado;

-- ---------- Datos iniciales ----------
INSERT INTO distrito(nombre_distrito) VALUES
 ('Veintiséis de Octubre'),('Piura'),('Castilla'),('Catacaos'),('Las Lomas');

INSERT INTO concepto_facturable(descripcion,precio_lista) VALUES
 ('Bolsa de hielo',3.50),('Bloque de hielo',12.00),('Barra de hielo',8.00),('Servicio de entrega',5.00);

INSERT INTO tipo_hielo(descripcion,unidad_medida,precio,id_concepto) VALUES
 ('Bolsa de hielo','bolsa',3.50,1),('Bloque de hielo','unidad',12.00,2),('Barra de hielo','unidad',8.00,3);

INSERT INTO estado_entrega(descripcion_estado) VALUES ('Confirmada'),('Observada'),('No entregada');
INSERT INTO vehiculo(placa,modelo) VALUES ('ABC-123','Furgón'),('DEF-456','Camioneta');

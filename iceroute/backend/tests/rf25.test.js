// Tests TDD del RF25 (capítulo 2, sección 2.5). Un test por CP de tipo Regla o Infraestructura.
const RutaService = require('../src/services/RutaService');

describe('RF25 Organización de recorrido', () => {
  const pedidos = [
    { id_pedido: 3, hora_entrega: '14:00:00' },
    { id_pedido: 2, hora_entrega: '08:00:00' },
    { id_pedido: 1, hora_entrega: '08:00:00' },
  ];
 
  test('RF25-CP01 se genera un recorrido con secuencia consecutiva', () => {
    // ACT
    const ruta = RutaService.ordenarParadas(pedidos);
    // ASSERT
    expect(ruta.map((p) => p.secuencia)).toEqual([1, 2, 3]);
  });
 
  test('RF25-CP02 las paradas se ordenan por hora y luego por número de pedido', () => {
    // ACT
    const ruta = RutaService.ordenarParadas(pedidos);
    // ASSERT
    expect(ruta.map((p) => p.id_pedido)).toEqual([1, 2, 3]);
    expect(ruta[0].hora_estimada).toBe('08:00:00');
  });
 
  test.todo('RF25-CP03 destino sin ubicación válida (la app no valida coordenadas al armar la ruta)');
 
  test('RF25-CP04 sin entregas asignadas el recorrido queda vacío', () => {
    // ACT + ASSERT
    expect(RutaService.ordenarParadas([])).toEqual([]);
  });
 
  test.todo('RF25-CP05 error al procesar ubicaciones (la ruta se ordena por hora, no usa servicio externo)');
});

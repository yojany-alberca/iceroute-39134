# Capítulo 2 – Pruebas TDD (backend IceRoute)

Esta carpeta contiene lo que el capítulo 2 del APF3 describe y que faltaba en el repositorio.

## Qué copiar y dónde (dentro de `iceroute/backend`)
| Archivo / carpeta | Qué es |
|---|---|
| `src/errors.js` | `AppError`, mensaje genérico `MSG_SERVIDOR` y `conInfra` (convierte fallas de BD en error 500 genérico) |
| `src/dao/*.js` | Interfaces DAO (UsuarioDao, PedidoDao, CatalogoDao, KardexDao) |
| `src/services/*.js` | Clases Service con las reglas de negocio (AuthService, UsuarioService, PedidoService, RutaService) |
| `tests/` | DAO falsos (`fakes.js`), ayudante `helpers.js`, entornos y 23 archivos `rfNN.test.js` (98 tests + 9 `test.todo`) |
| `tdd-red/services/` | Esqueletos sin lógica para la **fase roja** |
| `jest.red.config.js` | Configuración que apunta los tests a los esqueletos |
| `package.json` | Es el tuyo + scripts `test`, `test:red`, `test:cobertura`, `devDependencies.jest` y la clave `jest`. **Si ya modificaste tu package.json, solo copia esas partes.** |
| `scripts/capturas.ps1` | Guía para tomar las 46 capturas |

## Pasos
```
cd backend
npm install            # instala Jest (necesita internet)
npm run test:red       # esperado: 98 failed, 9 todo
npm test               # esperado: 98 passed, 9 todo
.\scripts\capturas.ps1 # recorre los 23 RF para capturar rojo y verde
```
Asegúrate de que `.gitignore` incluya `node_modules/` y `.env`.

## Para que el control de versiones muestre TDD de verdad (capítulo 3)
1. Primer commit: `tests/`, `tdd-red/`, `jest.red.config.js`, `src/errors.js`, `src/dao/` → mensaje `test: escribe tests TDD (fase roja)`.
2. Segundo commit: `src/services/` → mensaje `feat: implementa servicios (fase verde)`.

## Importante
- `server.js` **todavía no usa** estos servicios: tiene las mismas reglas escritas dentro de las rutas. Los servicios reproducen esas reglas y mensajes.
  Falta conectar `server.js` con los servicios y una implementación MySQL de los DAO (refactor del capítulo 1.3/1.5).
- Reglas con código pero sin test (no están en los 98): bloqueo al 3.er intento fallido de login y la prohibición de modificar tu propia cuenta.

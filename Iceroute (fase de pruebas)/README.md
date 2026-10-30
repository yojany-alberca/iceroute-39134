# IceRoute — Hielos "La Nevada"

App móvil con 3 roles (Administrador, Usuario, Repartidor).
- `database/iceroute.sql` → base de datos para MySQL Workbench
- `backend/` → servidor (Node.js)
- `app/` → aplicación React Native (Expo)

## PASO 1 — Base de datos
1. Abre MySQL Workbench y entra a tu servidor (Local instance MySQL80).
2. Menú File → Open SQL Script → elige `database/iceroute.sql`.
3. Pulsa el rayito ⚡. Actualiza SCHEMAS (flechitas): debe aparecer `iceroute`.

## PASO 2 — Servidor (backend)
Abre la carpeta `iceroute` en Visual Studio Code, abre una terminal y escribe:
```
cd backend
copy .env.example .env
```
Abre el archivo `.env` y en `DB_PASS=` escribe la contraseña de root de tu MySQL. Luego:
```
npm install
npm run seed
npm start
```
Debe salir: "IceRoute API lista en el puerto 3000". Deja esa terminal abierta.

## PASO 3 — App móvil
Abre una SEGUNDA terminal (fuera de la carpeta backend):
```
npx create-expo-app iceroute-app
cd iceroute-app
npx expo install react-native-maps expo-location @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context @react-native-async-storage/async-storage
```
Copia `App.js` y la carpeta `src` (de `iceroute/app`) dentro de `iceroute-app`.
(Reemplaza el App.js que ya existe.)

Abre `src/api.js` y cambia `TU_IP_LOCAL` por la IP de tu PC
(en Windows: escribe `ipconfig` y copia "Dirección IPv4", ej. 192.168.1.10).
Celular y PC deben estar en el mismo WiFi.

```
npx expo start
```
Escanea el QR con la app Expo Go.

## Usuarios de prueba (clave: Hielo2026!)
| Rol | Correo |
|---|---|
| Administrador | admin@iceroute.com |
| Repartidor | repartidor@iceroute.com |
| Usuario | cliente@iceroute.com (o crea una cuenta con "Regístrate") |

## Cómo probar el flujo completo
1. Entra como **Usuario** → pestaña "Pedir hielo" → haz un pedido (usa "Usar mi ubicación actual" para ver el mapa).
2. Cierra sesión y entra como **Administrador** → abre el pedido → "Asignar repartidor".
3. Entra como **Repartidor** → abre la entrega → "Iniciar entrega" → luego "Confirmar entrega".
4. Vuelve a entrar como **Usuario**: verás el estado (En espera → Asignado → En camino → Entregado) y el mapa cuando va en camino.

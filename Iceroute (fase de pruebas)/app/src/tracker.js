// Envía el GPS del repartidor al servidor mientras tenga entregas "En camino"
import * as Location from 'expo-location';
import { api } from './api';

let sub = null;
let iniciando = false;

export async function startTracking() {
  if (sub || iniciando) return;
  iniciando = true;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (p) => api('/ubicacion', 'POST', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => {})
    );
  } finally { iniciando = false; }
}
export function stopTracking() {
  if (sub) { sub.remove(); sub = null; }
}

// IMPORTANTE: cambia TU_IP_LOCAL por la IP de tu computadora (ej: 192.168.1.10)
export const BASE_URL = 'http://192.168.1.36:3000';

let token = null;
let onExpired = () => {};
export const setToken = (t) => { token = t; };
export const setExpiredHandler = (fn) => { onExpired = fn; };

export async function api(path, method = 'GET', body) {
  let r;
  try {
    r = await fetch(BASE_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'), { offline: true });
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { onExpired(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
  if (!r.ok) throw Object.assign(new Error(data.error || 'Ocurrió un error. Intenta de nuevo.'), { status: r.status });
  return data;
}

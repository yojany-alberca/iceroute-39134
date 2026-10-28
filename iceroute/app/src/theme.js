export const C = {
  primary: '#3D14E5', dark: '#1A0F6E', bg: '#FFFFFF', card: '#F1F1F6', border: '#D9D9E3',
  text: '#15151F', muted: '#6B6B80', error: '#D92D20', ok: '#12B76A', warn: '#F79009',
};
export const ESTADOS = {
  'Pendiente': { t: 'En espera', c: '#F79009' },
  'Asignado': { t: 'Asignado', c: '#3D14E5' },
  'En camino': { t: 'En camino', c: '#0E9384' },
  'Entregado': { t: 'Entregado', c: '#12B76A' },
  'Cancelado': { t: 'Cancelado', c: '#D92D20' },
  'No entregado': { t: 'No entregado', c: '#B54708' },
};
export const ROLES = { admin: 'Administrador', cliente: 'Usuario', repartidor: 'Repartidor' };
export const soles = (n) => 'S/ ' + Number(n || 0).toFixed(2);
export const nroPedido = (id) => '#' + String(id).padStart(5, '0');
export const fechaCorta = (f) => { if (!f) return ''; const [y, m, d] = f.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

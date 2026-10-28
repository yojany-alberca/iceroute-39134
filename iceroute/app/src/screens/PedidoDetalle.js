import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Btn, Field, Row, Section, Sheet, ErrorView } from '../components';
import { C, soles, nroPedido, fechaCorta } from '../theme';

export default function PedidoDetalle({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const rol = user.rol;
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // asignar | cancelar | entregar | incidencia
  const [reps, setReps] = useState([]);
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [formErr, setFormErr] = useState('');
  const [stars, setStars] = useState(0);

  const load = useCallback(async () => {
    try { setP(await api('/pedidos/' + id)); setError(''); } catch (e) { setError(e.message); }
  }, [id]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]));

  const cerrar = () => { setSheet(null); setT1(''); setT2(''); setFormErr(''); };

  const ejecutar = async (fn, ok) => {
    setBusy(true);
    try { await fn(); cerrar(); await load(); if (ok) Alert.alert(ok); }
    catch (e) { sheet ? setFormErr(e.message) : Alert.alert('Aviso', e.message); load(); }
    setBusy(false);
  };

  const abrirAsignar = async () => {
    setSheet('asignar'); setFormErr('');
    try { setReps(await api('/repartidores')); } catch (e) { setFormErr(e.message); }
  };

  const cancelarCliente = () => Alert.alert('Cancelar pedido', '¿Seguro que quieres cancelar este pedido?', [
    { text: 'No, volver', style: 'cancel' },
    { text: 'Sí, cancelar', style: 'destructive', onPress: () => ejecutar(() => api(`/pedidos/${id}/cancelar`, 'PUT', {}), 'Tu pedido fue cancelado') },
  ]);

  if (error && !p) return <ErrorView msg={error} onRetry={load} />;
  if (!p) return <Text style={{ padding: 24, color: C.muted }}>Cargando...</Text>;

  const e = p.estado;
  const tel = (n) => n && <Ionicons name="call" size={18} color={C.primary} onPress={() => Linking.openURL('tel:' + n)} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>Pedido {nroPedido(p.id_pedido)}</Text>
          <Badge estado={e} />
        </View>

        {e === 'Cancelado' && (
          <View style={{ backgroundColor: '#FEE4E2', padding: 12, borderRadius: 12, marginBottom: 14 }}>
            <Text style={{ color: C.error, fontWeight: '800' }}>
              {rol === 'repartidor' ? 'Este pedido fue cancelado. Ya no debes entregarlo.' : 'Este pedido fue cancelado'}
            </Text>
            {!!p.motivo_cancelacion && <Text style={{ color: C.error }}>Motivo: {p.motivo_cancelacion}</Text>}
          </View>
        )}
        {e === 'En camino' && rol === 'cliente' && (
          <View style={{ backgroundColor: '#CCFBEF', padding: 12, borderRadius: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="bicycle" size={22} color="#0E9384" />
            <Text style={{ color: '#0E9384', fontWeight: '700', marginLeft: 8, flex: 1 }}>Tu pedido va en camino. Puedes seguirlo en el mapa.</Text>
          </View>
        )}
        {e === 'Pendiente' && rol === 'cliente' && (
          <Text style={{ color: C.muted, marginBottom: 14 }}>Tu pedido está en espera. Pronto se asignará un repartidor.</Text>
        )}

        {!!p.lat && !!p.lng && (
          <View style={{ height: 210, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <MapView style={{ flex: 1 }} initialRegion={{ latitude: +p.lat, longitude: +p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
              <Marker coordinate={{ latitude: +p.lat, longitude: +p.lng }} title="Destino" pinColor="green" />
              {p.ubicacion && <Marker coordinate={{ latitude: +p.ubicacion.lat, longitude: +p.ubicacion.lng }} title="Repartidor" pinColor={C.primary} />}
            </MapView>
          </View>
        )}

        <Section title="Entrega">
          <Row label="Dirección" value={p.direccion_entrega} />
          {!!p.distrito && <Row label="Distrito" value={p.distrito} />}
          {!!p.referencia && <Row label="Referencia" value={p.referencia} />}
          <Row label="Fecha" value={fechaCorta(p.fecha_entrega)} />
          <Row label="Horario" value={p.hora_entrega} />
        </Section>

        {rol !== 'cliente' && (
          <Section title="Cliente">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View><Text style={{ fontWeight: '700' }}>{p.cliente}</Text><Text style={{ color: C.muted }}>{p.cliente_telefono}</Text></View>
              {tel(p.cliente_telefono)}
            </View>
          </Section>
        )}

        {rol !== 'repartidor' && !!p.repartidor && (
          <Section title="Repartidor">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View><Text style={{ fontWeight: '700' }}>{p.repartidor}</Text><Text style={{ color: C.muted }}>{p.repartidor_telefono}</Text></View>
              {rol === 'cliente' && e === 'En camino' && tel(p.repartidor_telefono)}
            </View>
          </Section>
        )}

        <Section title="Productos">
          {p.items.map((i) => (
            <View key={i.num_linea} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text>{Number(i.cantidad)} × {i.descripcion}</Text>
              <Text style={{ fontWeight: '600' }}>{soles(i.cantidad * i.precio_unitario)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: C.border, marginVertical: 6 }} />
          <Row label="Total" value={soles(p.total)} color={C.primary} />
        </Section>

        {(e === 'Entregado' || e === 'No entregado') && (
          <Section title={e === 'Entregado' ? 'Entrega confirmada' : 'Entrega no realizada'}>
            {e === 'Entregado' && <Row label="Recibió" value={p.receptor} />}
            {e === 'Entregado' && <Row label="Fecha y hora" value={p.fecha_hora_entrega} />}
            {!!p.obs_entrega && <Row label="Observación" value={p.obs_entrega} />}
            {!!p.id_factura && <Row label="Comprobante" value={p.id_factura} />}
          </Section>
        )}

        {/* ---------- Usuario ---------- */}
        {rol === 'cliente' && ['Pendiente', 'Asignado'].includes(e) && <Btn title="Cancelar pedido" variant="danger" onPress={cancelarCliente} loading={busy} />}
        {rol === 'cliente' && e === 'Entregado' && (p.puntaje ? (
          <Text style={{ textAlign: 'center', fontWeight: '700' }}>Tu calificación: {'★'.repeat(p.puntaje)}{'☆'.repeat(5 - p.puntaje)}</Text>
        ) : (
          <Section title="Califica el servicio">
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setStars(n)}>
                  <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color="#F5B301" />
                </TouchableOpacity>
              ))}
            </View>
            <Btn title="Enviar calificación" onPress={() => stars ? ejecutar(() => api(`/pedidos/${id}/calificar`, 'POST', { puntaje: stars }), '¡Gracias por tu calificación!') : Alert.alert('Selecciona una puntuación')} />
          </Section>
        ))}

        {/* ---------- Administrador ---------- */}
        {rol === 'admin' && ['Pendiente', 'Asignado'].includes(e) && (
          <Btn title={e === 'Pendiente' ? 'Asignar repartidor' : 'Reasignar repartidor'} icon="person-add" onPress={abrirAsignar} style={{ marginBottom: 10 }} />
        )}
        {rol === 'admin' && ['Pendiente', 'Asignado', 'En camino'].includes(e) && (
          <Btn title="Cancelar pedido" variant="danger" onPress={() => setSheet('cancelar')} />
        )}

        {/* ---------- Repartidor ---------- */}
        {rol === 'repartidor' && e === 'Asignado' && (
          <Btn title="Iniciar entrega" icon="navigate" onPress={() => ejecutar(() => api(`/pedidos/${id}/iniciar`, 'PUT'), 'Entrega iniciada. Tu ubicación se compartirá con el cliente.')} loading={busy} />
        )}
        {rol === 'repartidor' && e === 'En camino' && (
          <>
            <Btn title="Confirmar entrega" variant="ok" icon="checkmark-circle" onPress={() => setSheet('entregar')} style={{ marginBottom: 10 }} />
            <Btn title="No se pudo entregar" variant="outline" onPress={() => setSheet('incidencia')} />
          </>
        )}
      </ScrollView>

      <Sheet visible={sheet === 'asignar'} onClose={cerrar} title="Elige un repartidor">
        {!!formErr && <Text style={{ color: C.error, marginBottom: 8 }}>{formErr}</Text>}
        {reps.length === 0 && !formErr && <Text style={{ color: C.muted }}>No hay repartidores disponibles. Crea uno en la pestaña Usuarios.</Text>}
        {reps.map((r) => (
          <TouchableOpacity key={r.id_repartidor} disabled={!r.disponible}
            onPress={() => ejecutar(() => api(`/pedidos/${id}/asignar`, 'PUT', { id_repartidor: r.id_repartidor }), 'Pedido asignado')}
            style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, opacity: r.disponible ? 1 : 0.5 }}>
            <Text style={{ fontWeight: '700' }}>{r.nombres}</Text>
            <Text style={{ color: C.muted }}>{r.disponible ? `Disponible · ${r.activos} entrega(s) activa(s)` : 'No disponible'}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet visible={sheet === 'cancelar'} onClose={cerrar} title="Cancelar pedido">
        <Field label="Motivo de la cancelación" value={t1} onChangeText={setT1} multiline error={formErr} placeholder="Ej: el cliente no contesta" />
        <Btn title="Confirmar cancelación" variant="danger" loading={busy}
          onPress={() => t1.trim() ? ejecutar(() => api(`/pedidos/${id}/cancelar`, 'PUT', { motivo: t1 }), 'Pedido cancelado') : setFormErr('Escribe el motivo de la cancelación*')} />
      </Sheet>

      <Sheet visible={sheet === 'entregar'} onClose={cerrar} title="Confirmar entrega">
        <Field label="¿Quién recibió el pedido?" value={t1} onChangeText={setT1} error={formErr} placeholder="Nombre del receptor" />
        <Field label="Observación (opcional)" value={t2} onChangeText={setT2} placeholder="Recepción conforme" />
        <Btn title="Confirmar entrega" variant="ok" loading={busy}
          onPress={() => t1.trim() ? ejecutar(() => api(`/pedidos/${id}/entregar`, 'PUT', { receptor: t1, observacion: t2 }), 'Entrega confirmada') : setFormErr('Escribe el nombre de quien recibe*')} />
      </Sheet>

      <Sheet visible={sheet === 'incidencia'} onClose={cerrar} title="Entrega no realizada">
        <Field label="¿Qué ocurrió?" value={t1} onChangeText={setT1} multiline error={formErr} placeholder="Ej: cliente no disponible" />
        <Btn title="Registrar incidencia" variant="danger" loading={busy}
          onPress={() => t1.trim() ? ejecutar(() => api(`/pedidos/${id}/incidencia`, 'PUT', { observacion: t1 }), 'Incidencia registrada') : setFormErr('Describe qué ocurrió*')} />
      </Sheet>
    </View>
  );
}

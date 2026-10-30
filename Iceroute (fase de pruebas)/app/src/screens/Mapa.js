import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorView } from '../components';
import { C, nroPedido } from '../theme';

// ---------------- Repartidor: "Mi recorrido" (RF26) con tiempos estimados (RF34) ----------------
function MapaRepartidor({ navigation }) {
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const mapa = useRef(null);

  const load = useCallback(async () => {
    try { setRec(await api('/mi-recorrido')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]));

  if (error && !rec) return <ErrorView msg={error} onRetry={load} />;
  if (!rec) return <Text style={{ padding: 24, color: C.muted }}>Cargando recorrido...</Text>;
  if (!rec.paradas.length) return <Empty icon="map-outline" text={rec.mensaje || 'Aún no tienes un recorrido asignado'} />;

  const conCoord = rec.paradas.filter((p) => p.lat && p.lng);
  const pts = conCoord.map((p) => ({ latitude: +p.lat, longitude: +p.lng }));

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {!!error && <Text style={{ backgroundColor: '#FEE4E2', color: C.error, padding: 8, fontSize: 12 }}>{error} · <Text style={{ fontWeight: '700' }} onPress={load}>Reintentar</Text></Text>}
      {pts.length > 0 && (
        <MapView ref={mapa} style={{ flex: 1 }} showsUserLocation initialRegion={{ ...pts[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onMapReady={() => pts.length > 1 && mapa.current?.fitToCoordinates(pts, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 } })}>
          {conCoord.map((p, i) => (
            <Marker key={p.id_pedido} coordinate={pts[i]} title={`Parada ${p.secuencia} · Pedido ${nroPedido(p.id_pedido)}`} description={p.direccion_entrega}
              pinColor={p.estado === 'En camino' ? 'green' : C.primary} onCalloutPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })} />
          ))}
          {pts.length > 1 && <Polyline coordinates={pts} strokeColor={C.primary} strokeWidth={4} />}
        </MapView>
      )}
      <ScrollView style={{ maxHeight: '45%' }} contentContainerStyle={{ padding: 12 }}>
        <Text style={{ fontWeight: '800', marginBottom: 6 }}>Mi recorrido · {rec.paradas.length} parada(s)</Text>
        {rec.paradas.map((p) => (
          <View key={p.id_pedido} style={{ backgroundColor: C.card, borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <Text style={{ fontWeight: '800' }} onPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })}>
              Parada {p.secuencia} · Pedido {nroPedido(p.id_pedido)} ›
            </Text>
            <Text>{p.direccion_entrega}</Text>
            <Text style={{ color: C.muted }}>{p.hora_entrega} · Prioridad {p.prioridad}{p.eta_min != null ? ` · Llegada estimada: ${p.eta_min} min` : ''}</Text>
          </View>
        ))}
        {rec.advertencias.map((a, i) => <Text key={i} style={{ color: C.warn, fontSize: 12, marginBottom: 2 }}>⚠ {a}</Text>)}
        {!!rec.mensaje && <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{rec.mensaje}</Text>}
      </ScrollView>
    </View>
  );
}

// ---------------- Administrador: mapa de todas las entregas en curso ----------------
function MapaAdmin({ navigation }) {
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState('');
  const mapa = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = (await api('/pedidos?vista=activos')).filter((p) => p.lat && p.lng);
      setPedidos(d); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]));

  if (error && !pedidos) return <ErrorView msg={error} onRetry={load} />;
  if (!pedidos) return <Text style={{ padding: 24, color: C.muted }}>Cargando mapa...</Text>;
  if (!pedidos.length) return <Empty icon="map-outline" text="No hay entregas con ubicación para mostrar en el mapa" />;

  const pts = pedidos.map((p) => ({ latitude: +p.lat, longitude: +p.lng }));
  return (
    <View style={{ flex: 1 }}>
      <MapView ref={mapa} style={{ flex: 1 }} initialRegion={{ ...pts[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onMapReady={() => pts.length > 1 && mapa.current?.fitToCoordinates(pts, { edgePadding: { top: 80, right: 60, bottom: 160, left: 60 } })}>
        {pedidos.map((p, i) => (
          <Marker key={p.id_pedido} coordinate={pts[i]} title={`Pedido ${nroPedido(p.id_pedido)}`} description={`${p.direccion_entrega} · Prioridad ${p.prioridad}`}
            pinColor={p.estado === 'En camino' ? 'green' : C.primary} onCalloutPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })} />
        ))}
      </MapView>
      <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 4 }}>
        <Text style={{ fontWeight: '800' }}>{pedidos.length} entrega(s) en el mapa</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>Toca un marcador y luego su globo para ver el detalle. Verde = en camino.</Text>
      </View>
    </View>
  );
}

export default function Mapa(props) {
  const { user } = useAuth();
  return user.rol === 'repartidor' ? <MapaRepartidor {...props} /> : <MapaAdmin {...props} />;
}

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorView } from '../components';
import { C, nroPedido } from '../theme';

export default function Mapa({ navigation }) {
  const { user } = useAuth();
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
  const ruta = user.rol === 'repartidor';

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapa} style={{ flex: 1 }} showsUserLocation={ruta}
        initialRegion={{ ...pts[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onMapReady={() => pts.length > 1 && mapa.current?.fitToCoordinates(pts, { edgePadding: { top: 80, right: 60, bottom: 160, left: 60 } })}>
        {pedidos.map((p, i) => (
          <Marker key={p.id_pedido} coordinate={pts[i]} title={`${ruta && p.secuencia ? 'Parada ' + p.secuencia + ' · ' : ''}Pedido ${nroPedido(p.id_pedido)}`}
            description={p.direccion_entrega} pinColor={p.estado === 'En camino' ? 'green' : C.primary} onCalloutPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })} />
        ))}
        {ruta && pts.length > 1 && <Polyline coordinates={pts} strokeColor={C.primary} strokeWidth={4} />}
      </MapView>
      <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 4 }}>
        <Text style={{ fontWeight: '800' }}>{pedidos.length} entrega(s) en el mapa</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>Toca un marcador y luego su globo para ver el detalle. Verde = en camino.</Text>
      </View>
    </View>
  );
}

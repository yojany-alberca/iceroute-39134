import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { startTracking, stopTracking } from '../tracker';
import { Card, Badge, Chip, Empty, ErrorView, Btn } from '../components';
import { C, soles, nroPedido, fechaCorta } from '../theme';

export default function Pedidos({ navigation }) {
  const { user } = useAuth();
  const rol = user.rol;
  const [vista, setVista] = useState('activos');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/pedidos?vista=${vista}&q=${encodeURIComponent(q)}`);
      setData(d); setError('');
      if (rol === 'repartidor' && vista === 'activos') (d.some((p) => p.estado === 'En camino') ? startTracking() : stopTracking());
      if (rol === 'admin') setRes(await api('/resumen'));
    } catch (e) { setError(e.message); }
  }, [vista, q]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 10000); // se actualiza solo cada 10 s
    return () => clearInterval(t);
  }, [load]));

  const titulo = rol === 'repartidor' ? 'entregas' : 'pedidos';

  const header = (
    <View style={{ marginBottom: 6 }}>
      {rol === 'admin' && res && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {[['En espera', res.Pendiente], ['Asignados', res.Asignado], ['En camino', res['En camino']], ['Entregados', res.Entregado], ['Cancelados', res.Cancelado]].map(([l, n]) => (
            <View key={l} style={{ backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginRight: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.primary }}>{n || 0}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>{l}</Text>
            </View>
          ))}
          <View style={{ backgroundColor: C.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{soles(res.ventas)}</Text>
            <Text style={{ fontSize: 11, color: '#fff' }}>Ventas entregadas</Text>
          </View>
        </ScrollView>
      )}
      {rol !== 'repartidor' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 }}>
          <TextInput style={{ flex: 1, paddingVertical: 9 }} placeholder={rol === 'admin' ? 'Buscar por N° de pedido, cliente o dirección' : 'Buscar por N° de pedido o dirección'} value={q} onChangeText={setQ} />
          <Ionicons name="search" size={18} color={C.muted} />
        </View>
      )}
      <View style={{ flexDirection: 'row' }}>
        <Chip label="En curso" active={vista === 'activos'} onPress={() => setVista('activos')} />
        <Chip label="Historial" active={vista === 'historial'} onPress={() => setVista('historial')} />
      </View>
    </View>
  );

  if (error && !data) return <ErrorView msg={error} onRetry={load} />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}
      data={data || []} keyExtractor={(p) => String(p.id_pedido)}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      ListHeaderComponent={header}
      ListEmptyComponent={data && (
        <Empty text={q ? 'No se encontraron coincidencias' : vista === 'activos'
          ? (rol === 'repartidor' ? 'No tienes entregas asignadas por ahora' : rol === 'cliente' ? 'No tienes pedidos en curso. Toca el botón + para pedir hielo.' : 'No hay pedidos en curso')
          : `Tu historial de ${titulo} está vacío`} />
      )}
      renderItem={({ item: p }) => (
        <Card style={{ marginBottom: 12 }} onPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>Pedido {nroPedido(p.id_pedido)}</Text>
            <Badge estado={p.estado} />
          </View>
          {rol === 'repartidor' && p.secuencia && p.estado !== 'Cancelado' ? <Text style={{ color: C.primary, fontWeight: '700' }}>Parada {p.secuencia}</Text> : null}
          <Text style={{ fontWeight: '600', marginTop: 2 }}>{p.direccion_entrega}</Text>
          {rol !== 'cliente' && <Text style={{ color: C.muted }}>Cliente: {p.cliente}</Text>}
          {rol === 'admin' && <Text style={{ color: C.muted }}>Repartidor: {p.repartidor || 'sin asignar'}</Text>}
          <Text style={{ color: C.muted }}>Entrega: {fechaCorta(p.fecha_entrega)} · {p.hora_entrega}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontWeight: '700' }}>Importe: {soles(p.total)}</Text>
            <Text style={{ color: C.primary, fontWeight: '700' }}>Detalles ›</Text>
          </View>
        </Card>
      )}
    />
  );
}

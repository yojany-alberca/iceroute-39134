// RF35 / RF45: avisos de cambio de estado y de entrega completada (dentro de la app)
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { Card, Empty, ErrorView } from '../components';
import { C, nroPedido } from '../theme';

export default function Avisos({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api('/notificaciones');
      setData(d.avisos); setError('');
      if (d.no_leidas) api('/notificaciones/leer', 'PUT', {}).catch(() => {}); // quedan marcados como leídos al abrir
    } catch (e) { setError(e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]));

  if (error && !data) return <ErrorView msg={error} onRetry={load} />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}
      data={data || []} keyExtractor={(a) => String(a.id)}
      ListEmptyComponent={data && <Empty icon="notifications-off-outline" text="Aún no tienes avisos" />}
      renderItem={({ item: a }) => (
        <Card style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: a.leida ? C.border : C.primary }}
          onPress={a.id_pedido ? () => navigation.navigate('PedidoDetalle', { id: a.id_pedido }) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="notifications" size={20} color={a.leida ? C.muted : C.primary} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: a.leida ? '500' : '800' }}>{a.mensaje}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{a.fecha}{a.id_pedido ? ` · Pedido ${nroPedido(a.id_pedido)}` : ''}</Text>
            </View>
          </View>
        </Card>
      )}
    />
  );
}

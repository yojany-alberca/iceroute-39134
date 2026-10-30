// RF48: consulta de incidencias de entrega (administrador y repartidor)
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Btn, Card, Empty, ErrorView } from '../components';
import { C, nroPedido } from '../theme';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default function Incidencias({ navigation }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [errFiltro, setErrFiltro] = useState('');

  const consultar = useCallback(async (d = desde, h = hasta) => {
    if ((d && !RE_FECHA.test(d)) || (h && !RE_FECHA.test(h)) || (d && h && d > h)) {
      setErrFiltro('Los filtros no son válidos. Corrige el rango de fechas (AAAA-MM-DD)*'); return;
    }
    try { setData(await api(`/incidencias?desde=${d}&hasta=${h}`)); setError(''); setErrFiltro(''); }
    catch (e) { e.status === 400 ? setErrFiltro(e.message + '*') : setError(e.message); }
  }, [desde, hasta]);

  useFocusEffect(useCallback(() => { consultar(); }, []));

  const limpiar = () => { setDesde(''); setHasta(''); consultar('', ''); };
  const input = { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 };

  if (error && !data) return <ErrorView msg={error} onRetry={() => consultar()} />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}
      data={data || []} keyExtractor={(i) => String(i.id_entrega)}
      ListHeaderComponent={(
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <TextInput style={[input, { marginRight: 8 }]} placeholder="Desde AAAA-MM-DD" value={desde} onChangeText={setDesde} maxLength={10} />
            <TextInput style={input} placeholder="Hasta AAAA-MM-DD" value={hasta} onChangeText={setHasta} maxLength={10} />
          </View>
          {!!errFiltro && <Text style={{ color: C.error, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{errFiltro}</Text>}
          <View style={{ flexDirection: 'row' }}>
            <Btn title="Filtrar" onPress={() => consultar()} style={{ flex: 1, marginRight: 8, paddingVertical: 8 }} />
            <Btn title="Limpiar" variant="outline" onPress={limpiar} style={{ flex: 1, paddingVertical: 8 }} />
          </View>
        </View>
      )}
      ListEmptyComponent={data && <Empty text="No existen incidencias para los filtros seleccionados" />}
      renderItem={({ item: i }) => (
        <Card style={{ marginBottom: 10 }} onPress={() => navigation.navigate('PedidoDetalle', { id: i.id_pedido })}>
          <Text style={{ fontWeight: '800' }}>Pedido {nroPedido(i.id_pedido)}</Text>
          <Text style={{ color: C.muted }}>Repartidor: {i.repartidor || '—'} · Cliente: {i.cliente}</Text>
          <Text style={{ color: C.muted }}>Fecha: {i.fecha}</Text>
          <Text style={{ marginTop: 4 }}>{i.descripcion}</Text>
        </Card>
      )}
    />
  );
}

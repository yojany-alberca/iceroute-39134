import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { startTracking, stopTracking } from '../tracker';
import { Card, Badge, Chip, Empty, ErrorView, Btn } from '../components';
import { C, soles, nroPedido, fechaCorta } from '../theme';

const COLOR_PRIO = { Alta: '#D92D20', Media: '#F79009', Baja: '#12B76A' };
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default function Pedidos({ navigation }) {
  const { user } = useAuth();
  const rol = user.rol;
  const [vista, setVista] = useState('activos');       // activos | historial | completadas
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtros, setFiltros] = useState(null);         // filtros ya aplicados {q, desde, hasta}
  const [errBusq, setErrBusq] = useState('');
  const [data, setData] = useState(null);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const query = (f) => {
    let s = `vista=${vista}`;
    if (f) s += `&buscar=1&q=${encodeURIComponent(f.q)}&desde=${f.desde}&hasta=${f.hasta}`;
    return s;
  };

  const load = useCallback(async () => {
    try {
      const d = await api('/pedidos?' + query(filtros));
      setData(d); setError('');
      if (rol === 'repartidor' && vista === 'activos') (d.some((p) => p.estado === 'En camino') ? startTracking() : stopTracking());
      if (rol === 'admin') setRes(await api('/resumen'));
    } catch (e) { setError(e.message); }
  }, [vista, filtros]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 10000); // se actualiza solo cada 10 s (también retira lo que otra sesión completó)
    return () => clearInterval(t);
  }, [load]));

  // RF40: búsqueda por N° de pedido / cliente / dirección y rango de fechas
  const buscar = async () => {
    if (!q.trim() && !desde && !hasta) return setErrBusq('Completa al menos un campo o filtro para buscar*');
    if ((desde && !RE_FECHA.test(desde)) || (hasta && !RE_FECHA.test(hasta))) return setErrBusq('Las fechas deben tener el formato AAAA-MM-DD*');
    if (desde && hasta && desde > hasta) return setErrBusq('El rango de fechas no es válido: corrige "desde" y "hasta"*');
    const f = { q: q.trim(), desde, hasta };
    try { await api('/pedidos?' + query(f)); setErrBusq(''); setFiltros(f); }
    catch (e) { setErrBusq(e.message + '*'); }
  };
  const limpiar = () => { setQ(''); setDesde(''); setHasta(''); setErrBusq(''); setFiltros(null); };
  const cambiarVista = (v) => { setVista(v); setData(null); };

  const titulo = rol === 'repartidor' ? 'entregas' : 'pedidos';

  const msgVacio = () => {
    if (filtros) return vista === 'completadas' ? 'No se encontraron entregas completadas con esos filtros' : 'No se encontraron pedidos';
    if (vista === 'completadas') return 'No se encontraron entregas completadas';
    if (vista === 'historial') return rol === 'cliente' ? 'No cuentas con pedidos anteriores registrados' : 'No se encontraron entregas en el historial';
    return rol === 'repartidor' ? 'No tienes entregas asignadas por ahora' : rol === 'cliente' ? 'No tienes pedidos en curso. Toca el botón + para pedir hielo.' : 'No hay entregas pendientes en este momento';
  };

  const inputFecha = { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 };

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
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, marginBottom: 8 }}>
        <TextInput style={{ flex: 1, paddingVertical: 9 }} placeholder={rol === 'cliente' ? 'Buscar por N° de pedido o dirección' : 'Buscar por N° de pedido, cliente o dirección'} value={q} onChangeText={setQ} onSubmitEditing={buscar} returnKeyType="search" />
        <Ionicons name="search" size={18} color={C.muted} onPress={buscar} />
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <TextInput style={[inputFecha, { marginRight: 8 }]} placeholder="Desde AAAA-MM-DD" value={desde} onChangeText={setDesde} maxLength={10} />
        <TextInput style={inputFecha} placeholder="Hasta AAAA-MM-DD" value={hasta} onChangeText={setHasta} maxLength={10} />
      </View>
      {!!errBusq && <Text style={{ color: C.error, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{errBusq}</Text>}
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <Btn title="Buscar" onPress={buscar} style={{ flex: 1, marginRight: 8, paddingVertical: 8 }} />
        <Btn title="Limpiar filtros" variant="outline" onPress={limpiar} style={{ flex: 1, paddingVertical: 8 }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Chip label="En curso" active={vista === 'activos'} onPress={() => cambiarVista('activos')} />
        {rol !== 'cliente' && <Chip label="Completadas" active={vista === 'completadas'} onPress={() => cambiarVista('completadas')} />}
        <Chip label="Historial" active={vista === 'historial'} onPress={() => cambiarVista('historial')} />
      </View>
      {!!error && !!data && (
        <View style={{ backgroundColor: '#FEE4E2', padding: 10, borderRadius: 10, marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: C.error, flex: 1, fontSize: 12 }}>{error}</Text>
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={load}>Reintentar</Text>
        </View>
      )}
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
        <View>
          <Empty text={msgVacio()} />
          {!!filtros && <Btn title="Limpiar filtros" variant="outline" onPress={limpiar} />}
        </View>
      )}
      renderItem={({ item: p }) => (
        <Card style={{ marginBottom: 12 }} onPress={() => navigation.navigate('PedidoDetalle', { id: p.id_pedido })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>Pedido {nroPedido(p.id_pedido)}</Text>
            <Badge estado={p.estado} />
          </View>
          {rol === 'repartidor' && p.secuencia && ['Asignado', 'En camino'].includes(p.estado) ? <Text style={{ color: C.primary, fontWeight: '700' }}>Parada {p.secuencia}</Text> : null}
          <Text style={{ fontWeight: '600', marginTop: 2 }}>{p.direccion_entrega}</Text>
          {rol !== 'cliente' && <Text style={{ color: C.muted }}>Cliente: {p.cliente}</Text>}
          {rol === 'admin' && <Text style={{ color: C.muted }}>Repartidor: {p.repartidor || 'sin asignar'}</Text>}
          <Text style={{ color: C.muted }}>Entrega: {fechaCorta(p.fecha_entrega)} · {p.hora_entrega}</Text>
          {rol !== 'cliente' && vista === 'activos' && <Text style={{ color: COLOR_PRIO[p.prioridad] || C.muted, fontWeight: '700' }}>Prioridad: {p.prioridad}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontWeight: '700' }}>Importe: {soles(p.total)}</Text>
            <Text style={{ color: C.primary, fontWeight: '700' }}>Detalles ›</Text>
          </View>
        </Card>
      )}
    />
  );
}

// RF25: el administrador selecciona entregas asignadas y el sistema organiza el recorrido
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { Btn, Card, Chip, Empty, ErrorView } from '../components';
import { C, nroPedido, fechaCorta } from '../theme';

export default function Recorridos() {
  const [reps, setReps] = useState(null);
  const [rep, setRep] = useState(null);
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargarReps = useCallback(async () => {
    try { setReps(await api('/repartidores')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { cargarReps(); }, [cargarReps]));

  const cargarLista = async (id) => {
    setRep(id); setMsg(''); setLista(null);
    try {
      const d = await api(`/pedidos?vista=activos&id_repartidor=${id}`);
      const asignadas = d.filter((p) => p.estado === 'Asignado');
      setLista(d);
      setSel(Object.fromEntries(asignadas.map((p) => [p.id_pedido, true])));
    } catch (e) { setMsg(e.message); setLista([]); }
  };

  const organizar = async () => {
    const pedidos = Object.keys(sel).filter((k) => sel[k]).map(Number);
    setBusy(true); setMsg('');
    try {
      await api('/recorridos/organizar', 'POST', { id_repartidor: rep, pedidos });
      Alert.alert('Recorrido generado', 'El recorrido se organizó y se guardó correctamente.');
      await cargarLista(rep);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  if (error && !reps) return <ErrorView msg={error} onRetry={cargarReps} />;
  if (!reps) return <Text style={{ padding: 24, color: C.muted }}>Cargando...</Text>;

  const asignadas = (lista || []).filter((p) => p.estado === 'Asignado');
  const validas = (p) => !!p.lat && !!p.lng;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontWeight: '800', marginBottom: 8 }}>1. Elige un repartidor</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {reps.map((r) => <Chip key={r.id_repartidor} label={`${r.nombres} (${r.activos})`} active={rep === r.id_repartidor} onPress={() => cargarLista(r.id_repartidor)} />)}
      </ScrollView>

      {rep && lista && (
        <>
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>2. Selecciona las entregas del recorrido</Text>
          {!asignadas.length && <Empty text="No hay entregas asignadas disponibles para organizar el recorrido" />}
          {(lista || []).map((p) => (
            <Card key={p.id_pedido} style={{ marginBottom: 10, opacity: p.estado === 'Asignado' ? 1 : 0.6 }}
              onPress={p.estado === 'Asignado' ? () => setSel({ ...sel, [p.id_pedido]: !sel[p.id_pedido] }) : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {p.estado === 'Asignado'
                  ? <Ionicons name={sel[p.id_pedido] ? 'checkbox' : 'square-outline'} size={24} color={C.primary} style={{ marginRight: 10 }} />
                  : <Ionicons name="navigate" size={22} color={C.muted} style={{ marginRight: 10 }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800' }}>Pedido {nroPedido(p.id_pedido)} {p.secuencia ? `· Parada ${p.secuencia}` : ''}</Text>
                  <Text>{p.direccion_entrega}</Text>
                  <Text style={{ color: C.muted }}>{fechaCorta(p.fecha_entrega)} · {p.hora_entrega} · Prioridad {p.prioridad}</Text>
                  {!validas(p) && <Text style={{ color: C.error, fontWeight: '700' }}>Sin ubicación válida: corrígela antes de organizar*</Text>}
                  {p.estado !== 'Asignado' && <Text style={{ color: C.muted }}>Ya va en camino (no se reorganiza)</Text>}
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
      {!!msg && <Text style={{ color: C.error, fontWeight: '700', marginVertical: 8 }}>{msg}</Text>}
      {rep && asignadas.length > 0 && <Btn title="Organizar y guardar recorrido" icon="git-network" onPress={organizar} loading={busy} />}
    </ScrollView>
  );
}

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Btn, Card, Chip, ErrorView, Field } from '../components';
import { C } from '../theme';

export default function Inventario() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState(null);
  const [mov, setMov] = useState('ENTRADA');
  const [cantidad, setCantidad] = useState('');
  const [obs, setObs] = useState('');
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api('/inventario')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const guardar = async () => {
    const e = {};
    if (!tipo) e.tipo = 'Elige un producto*';
    if (!cantidad.trim()) e.cantidad = 'Completar este campo es obligatorio*';
    else if (!/^\d+(\.\d+)?$/.test(cantidad)) e.cantidad = 'Ingresa solo números*';
    else if (Number(cantidad) <= 0) e.cantidad = 'La cantidad debe ser mayor a 0*';
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await api('/inventario/movimiento', 'POST', { id_tipo_hielo: tipo, tipo_movimiento: mov, cantidad, observacion: obs });
      setCantidad(''); setObs('');
      await load();
      Alert.alert('Listo', mov === 'ENTRADA' ? 'Ingreso registrado' : 'Salida registrada');
    } catch (err) { setErrs({ cantidad: err.message + '*' }); }
    setLoading(false);
  };

  if (error && !d) return <ErrorView msg={error} onRetry={load} />;
  if (!d) return <Text style={{ padding: 24, color: C.muted }}>Cargando...</Text>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Stock actual</Text>
      <View style={{ flexDirection: 'row', marginBottom: 18 }}>
        {d.saldos.map((s) => (
          <View key={s.id_tipo_hielo} style={{ flex: 1, backgroundColor: Number(s.saldo_actual) < 20 ? '#FEE4E2' : C.card, borderRadius: 14, padding: 12, marginRight: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: Number(s.saldo_actual) < 20 ? C.error : C.primary }}>{Number(s.saldo_actual)}</Text>
            <Text style={{ fontSize: 11, textAlign: 'center', color: C.muted }}>{s.descripcion}</Text>
          </View>
        ))}
      </View>

      <Card style={{ marginBottom: 18 }}>
        <Text style={{ fontWeight: '800', marginBottom: 8 }}>Registrar movimiento</Text>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Chip label="Ingreso" active={mov === 'ENTRADA'} onPress={() => setMov('ENTRADA')} />
          <Chip label="Salida / merma" active={mov === 'SALIDA'} onPress={() => setMov('SALIDA')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {d.saldos.map((s) => <Chip key={s.id_tipo_hielo} label={s.descripcion} active={tipo === s.id_tipo_hielo} onPress={() => setTipo(s.id_tipo_hielo)} />)}
        </ScrollView>
        {!!errs.tipo && <Text style={{ color: C.error, fontSize: 11, fontWeight: '700' }}>{errs.tipo}</Text>}
        <View style={{ height: 10 }} />
        <Field value={cantidad} onChangeText={setCantidad} keyboardType="decimal-pad" placeholder="Cantidad" error={errs.cantidad} />
        <Field value={obs} onChangeText={setObs} placeholder="Observación (opcional)" />
        <Btn title="Guardar" onPress={guardar} loading={loading} />
      </Card>

      <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Últimos movimientos</Text>
      {d.movimientos.map((m) => (
        <View key={m.id_movimiento} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{m.descripcion}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{m.observacion} · {m.fecha_movimiento.slice(0, 16)}</Text>
          </View>
          <Text style={{ fontWeight: '800', color: m.tipo_movimiento === 'ENTRADA' ? C.ok : C.error }}>
            {m.tipo_movimiento === 'ENTRADA' ? '+' : '−'}{Number(m.cantidad)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

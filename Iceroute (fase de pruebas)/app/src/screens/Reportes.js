// RF50: reporte de entregas por período (administrador)
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { api } from '../api';
import { Btn, Card, Empty } from '../components';
import { C, soles, nroPedido, fechaCorta, ESTADOS } from '../theme';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function Reportes() {
  const hoy = new Date();
  const [desde, setDesde] = useState(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(iso(hoy));
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');
  const [fallo, setFallo] = useState(false);
  const [busy, setBusy] = useState(false);

  const generar = async () => {
    setFallo(false); setRep(null);
    if (!RE_FECHA.test(desde) || !RE_FECHA.test(hasta) || desde > hasta) return setErr('Rango de fechas inválido: corrígelo (AAAA-MM-DD)*');
    setErr(''); setBusy(true);
    try { setRep(await api(`/reportes/entregas?desde=${desde}&hasta=${hasta}`)); }
    catch (e) { if (e.status === 400) setErr(e.message + '*'); else { setErr(e.message); setFallo(true); } }
    setBusy(false);
  };
  const input = { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <TextInput style={[input, { marginRight: 8 }]} placeholder="Desde AAAA-MM-DD" value={desde} onChangeText={setDesde} maxLength={10} />
        <TextInput style={input} placeholder="Hasta AAAA-MM-DD" value={hasta} onChangeText={setHasta} maxLength={10} />
      </View>
      {!!err && <Text style={{ color: C.error, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{err}</Text>}
      <Btn title={fallo ? 'Reintentar' : 'Generar reporte'} icon="bar-chart" onPress={generar} loading={busy} style={{ marginBottom: 16 }} />

      {rep?.vacio && <Empty text={rep.mensaje} />}
      {rep && !rep.vacio && (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Card style={{ flex: 1, marginRight: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary }}>{rep.total}</Text><Text style={{ color: C.muted, fontSize: 12 }}>Pedidos</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary }}>{soles(rep.ventas)}</Text><Text style={{ color: C.muted, fontSize: 12 }}>Ventas entregadas</Text>
            </Card>
          </View>
          <Text style={{ fontWeight: '800', marginBottom: 6 }}>Por estado</Text>
          <Card style={{ marginBottom: 12 }}>
            {rep.por_estado.map((e) => (
              <View key={e.estado} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: (ESTADOS[e.estado] || {}).c || C.text, fontWeight: '700' }}>{(ESTADOS[e.estado] || {}).t || e.estado}</Text>
                <Text>{e.n} · {soles(e.monto)}</Text>
              </View>
            ))}
          </Card>
          {rep.por_repartidor.length > 0 && (
            <>
              <Text style={{ fontWeight: '800', marginBottom: 6 }}>Entregas por repartidor</Text>
              <Card style={{ marginBottom: 12 }}>
                {rep.por_repartidor.map((r) => (
                  <View key={r.repartidor} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                    <Text>{r.repartidor}</Text><Text style={{ fontWeight: '700' }}>{r.entregas}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
          <Text style={{ marginBottom: 12, color: C.muted }}>
            Calificación promedio: {rep.calificacion.promedio ? `${rep.calificacion.promedio} ★ (${rep.calificacion.cantidad})` : 'sin calificaciones'}
          </Text>
          <Text style={{ fontWeight: '800', marginBottom: 6 }}>Detalle</Text>
          {rep.detalle.map((d) => (
            <Card key={d.id_pedido} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700' }}>Pedido {nroPedido(d.id_pedido)} · {(ESTADOS[d.estado] || {}).t || d.estado}</Text>
              <Text style={{ color: C.muted }}>{fechaCorta(d.fecha_entrega)} · {d.hora_entrega} · {d.cliente} · {soles(d.total)}</Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

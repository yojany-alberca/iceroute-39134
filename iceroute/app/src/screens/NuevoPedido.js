import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { Btn, Chip, Field, ErrorView } from '../components';
import { C, soles } from '../theme';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pad = (n) => String(n).padStart(2, '0');
function proximosDias() {
  const out = []; const d = new Date();
  for (let i = 0; out.length < 14; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if (x.getDay() === 0) continue; // domingo no hay reparto
    out.push({ v: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, l: `${DIAS[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}` });
  }
  return out;
}

export default function NuevoPedido({ navigation }) {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState('');
  const [cant, setCant] = useState({});
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [distrito, setDistrito] = useState(null);
  const [fecha, setFecha] = useState(null);
  const [hora, setHora] = useState(null);
  const [coords, setCoords] = useState(null);
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);
  const dias = proximosDias();

  const cargar = useCallback(async () => {
    try { setCat(await api('/catalogo')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (error && !cat) return <ErrorView msg={error} onRetry={cargar} />;
  if (!cat) return <Text style={{ padding: 24, color: C.muted }}>Cargando...</Text>;

  const total = cat.tipos.reduce((t, p) => t + p.precio * (cant[p.id_tipo_hielo] || 0), 0);
  const setN = (id, v) => setCant({ ...cant, [id]: Math.max(0, Math.min(500, v)) });

  const ubicar = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permiso necesario', 'Activa el permiso de ubicación o escribe tu dirección manualmente.');
      const pos = await Location.getCurrentPositionAsync({});
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { Alert.alert('Ubicación', 'No pudimos obtener tu ubicación. Intenta de nuevo.'); }
  };

  const enviar = async () => {
    const e = {};
    const items = cat.tipos.filter((t) => cant[t.id_tipo_hielo] > 0).map((t) => ({ id_tipo_hielo: t.id_tipo_hielo, cantidad: cant[t.id_tipo_hielo] }));
    if (!items.length) e.items = 'Selecciona al menos un producto*';
    cat.tipos.forEach((t) => { if ((cant[t.id_tipo_hielo] || 0) > t.stock) e.items = `No hay stock suficiente de ${t.descripcion} (disponible: ${Number(t.stock)})*`; });
    if (!direccion.trim()) e.direccion = 'Ingresa la dirección de entrega*';
    if (referencia.length > 180) e.referencia = 'Máximo 180 caracteres*';
    if (/[<>{}]/.test(referencia)) e.referencia = 'La referencia contiene caracteres no permitidos*';
    if (!fecha) e.fecha = 'Elige la fecha de entrega*';
    if (!hora) e.hora = 'Elige un horario*';
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const r = await api('/pedidos', 'POST', { items, direccion, referencia, id_distrito: distrito, lat: coords?.lat, lng: coords?.lng, fecha, hora });
      setCant({}); setDireccion(''); setReferencia(''); setFecha(null); setHora(null); setCoords(null); setDistrito(null);
      cargar();
      Alert.alert('¡Pedido registrado!', `Tu pedido por ${soles(r.total)} quedó en espera. Te avisaremos cuando salga a reparto.`,
        [{ text: 'Ver mis pedidos', onPress: () => navigation.navigate('Inicio') }]);
    } catch (err) { Alert.alert('No se pudo registrar el pedido', err.message); cargar(); }
    setLoading(false);
  };

  const Err = ({ k }) => (errs[k] ? <Text style={{ color: C.error, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{errs[k]}</Text> : null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>¿Qué hielo necesitas?</Text>
      {cat.tipos.map((t) => (
        <View key={t.id_tipo_hielo} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, opacity: t.stock > 0 ? 1 : 0.5 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700' }}>{t.descripcion}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{soles(t.precio)} por {t.unidad_medida} · {t.stock > 0 ? `${Number(t.stock)} disponibles` : 'Agotado'}</Text>
          </View>
          <Ionicons name="remove-circle" size={32} color={C.primary} onPress={() => setN(t.id_tipo_hielo, (cant[t.id_tipo_hielo] || 0) - 1)} />
          <TextInput
            style={{ width: 46, textAlign: 'center', fontSize: 17, fontWeight: '700' }} keyboardType="number-pad"
            value={String(cant[t.id_tipo_hielo] || 0)} onChangeText={(v) => setN(t.id_tipo_hielo, parseInt(v.replace(/\D/g, ''), 10) || 0)} />
          <Ionicons name="add-circle" size={32} color={C.primary} onPress={() => setN(t.id_tipo_hielo, (cant[t.id_tipo_hielo] || 0) + 1)} />
        </View>
      ))}
      <Err k="items" />

      <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 14, marginBottom: 8 }}>Dirección de entrega</Text>
      <Field value={direccion} onChangeText={setDireccion} placeholder="Calle / Av. y número" error={errs.direccion} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {cat.distritos.map((d) => <Chip key={d.id_distrito} label={d.nombre_distrito} active={distrito === d.id_distrito} onPress={() => setDistrito(distrito === d.id_distrito ? null : d.id_distrito)} />)}
      </ScrollView>
      <Field value={referencia} onChangeText={setReferencia} placeholder="Referencia (ej: frente al parque, puerta azul)" error={errs.referencia} />
      <TouchableOpacity onPress={ubicar} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Ionicons name={coords ? 'checkmark-circle' : 'locate'} size={20} color={coords ? C.ok : C.primary} />
        <Text style={{ color: coords ? C.ok : C.primary, fontWeight: '700', marginLeft: 6 }}>
          {coords ? 'Ubicación guardada' : 'Usar mi ubicación actual (recomendado para el mapa)'}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 14, marginBottom: 8 }}>Fecha de entrega</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
        {dias.map((d) => <Chip key={d.v} label={d.l} active={fecha === d.v} onPress={() => setFecha(d.v)} />)}
      </ScrollView>
      <Err k="fecha" />

      <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 10, marginBottom: 8 }}>Horario</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cat.bloques.map((b) => <Chip key={b} label={b} active={hora === b} onPress={() => setHora(b)} />)}
      </View>
      <Err k="hora" />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 18 }}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>Total</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.primary }}>{soles(total)}</Text>
      </View>
      <Btn title="Hacer pedido" onPress={enviar} loading={loading} />
    </ScrollView>
  );
}

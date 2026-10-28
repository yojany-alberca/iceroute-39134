import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TextInput, Alert, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { Btn, Card, Chip, Empty, ErrorView, Field, Sheet } from '../components';
import { C, ROLES } from '../theme';

const VACIO = { nombres: '', telefono: '', email: '', password: '', rol: 'repartidor' };

export default function Usuarios() {
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [sel, setSel] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState(VACIO);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setLista(await api('/usuarios?q=' + encodeURIComponent(q))); setError(''); } catch (e) { setError(e.message); }
  }, [q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const actualizar = async (cambios) => {
    setBusy(true);
    try { await api('/usuarios/' + sel.id, 'PUT', cambios); setSel(null); await load(); Alert.alert('Cambios guardados'); }
    catch (e) { Alert.alert('No se pudo guardar', e.message); }
    setBusy(false);
  };

  const crear = async () => {
    if (Object.values({ a: f.nombres, b: f.telefono, c: f.email, d: f.password }).some((v) => !v.trim())) return setFormErr('Completa todos los campos*');
    setBusy(true);
    try { await api('/usuarios', 'POST', f); setNuevo(false); setF(VACIO); setFormErr(''); await load(); Alert.alert('Usuario creado'); }
    catch (e) { setFormErr(e.message + '*'); }
    setBusy(false);
  };

  if (error && !lista) return <ErrorView msg={error} onRetry={load} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 }}>
          <TextInput style={{ flex: 1, paddingVertical: 9 }} placeholder="Buscar usuario por nombre o correo" value={q} onChangeText={setQ} />
          <Ionicons name="search" size={18} color={C.muted} />
        </View>
        <Btn title="Nuevo usuario" icon="person-add" onPress={() => setNuevo(true)} />
      </View>
      <FlatList
        data={lista || []} keyExtractor={(u) => String(u.id)} contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={lista && <Empty icon="people-outline" text="No se encontraron coincidencias" />}
        renderItem={({ item: u }) => (
          <Card style={{ marginBottom: 10, opacity: u.activo ? 1 : 0.55 }} onPress={() => setSel(u)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800' }}>{u.nombres}</Text>
              <Text style={{ color: C.primary, fontWeight: '700' }}>{ROLES[u.rol]}</Text>
            </View>
            <Text style={{ color: C.muted }}>{u.email} · {u.telefono}</Text>
            {!u.activo && <Text style={{ color: C.error, fontWeight: '700' }}>Cuenta inhabilitada</Text>}
          </Card>
        )}
      />

      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.nombres || ''}>
        <Text style={{ color: C.muted, marginBottom: 12 }}>{sel?.email}</Text>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>Rol</Text>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {Object.keys(ROLES).map((r) => <Chip key={r} label={ROLES[r]} active={sel?.rol === r} onPress={() => sel.rol !== r ? actualizar({ rol: r }) : Alert.alert('Sin cambios', 'El usuario ya tiene ese rol')} />)}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>Cuenta activa</Text>
          <Switch value={!!sel?.activo} disabled={busy} onValueChange={(v) => actualizar({ activo: v })} trackColor={{ true: C.primary }} />
        </View>
      </Sheet>

      <Sheet visible={nuevo} onClose={() => { setNuevo(false); setFormErr(''); }} title="Nuevo usuario">
        <Field label="Nombres y apellidos" value={f.nombres} onChangeText={(v) => setF({ ...f, nombres: v })} />
        <Field label="Celular" value={f.telefono} onChangeText={(v) => setF({ ...f, telefono: v })} keyboardType="phone-pad" />
        <Field label="Correo" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Contraseña" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secure />
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          {Object.keys(ROLES).map((r) => <Chip key={r} label={ROLES[r]} active={f.rol === r} onPress={() => setF({ ...f, rol: r })} />)}
        </View>
        {!!formErr && <Text style={{ color: C.error, fontWeight: '700', marginBottom: 8 }}>{formErr}</Text>}
        <Btn title="Crear usuario" onPress={crear} loading={busy} />
      </Sheet>
    </View>
  );
}

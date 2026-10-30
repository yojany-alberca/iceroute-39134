import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { Btn, Row } from '../components';
import { C, ROLES } from '../theme';

export default function Perfil() {
  const { user, salir } = useAuth();
  const [disp, setDisp] = useState(true);

  useEffect(() => {
    if (user.rol === 'repartidor') api('/me').then((m) => setDisp(!!m.disponible)).catch(() => {});
  }, []);

  const cambiarDisp = async (v) => {
    setDisp(v);
    try { await api('/disponibilidad', 'PUT', { disponible: v }); } catch (e) { setDisp(!v); Alert.alert('Aviso', e.message); }
  };

  const cerrarSesion = () => Alert.alert('Cerrar sesión', '¿Quieres cerrar tu sesión?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: salir },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      <View style={{ alignItems: 'center', marginVertical: 20 }}>
        <View style={{ backgroundColor: C.primary, borderRadius: 50, padding: 20 }}>
          <Ionicons name="person" size={44} color="#fff" />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', marginTop: 10 }}>{user.nombres}</Text>
        <Text style={{ color: C.primary, fontWeight: '700' }}>{ROLES[user.rol]}</Text>
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <Row label="Correo" value={user.email} />
        <Row label="Celular" value={user.telefono} />
      </View>
      {user.rol === 'repartidor' && (
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700' }}>Disponible para entregas</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>Si lo desactivas, no te asignarán nuevos pedidos.</Text>
          </View>
          <Switch value={disp} onValueChange={cambiarDisp} trackColor={{ true: C.primary }} />
        </View>
      )}
      <Btn title="Cerrar sesión" variant="outline" icon="log-out-outline" onPress={cerrarSesion} />
    </View>
  );
}

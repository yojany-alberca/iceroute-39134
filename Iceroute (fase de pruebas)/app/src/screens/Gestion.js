// Menú del administrador: accesos a las funciones de gestión
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components';
import { C } from '../theme';

const ITEMS = [
  ['Recorridos', 'Organizar el recorrido de un repartidor', 'git-network-outline', 'Recorridos'],
  ['Incidencias', 'Consultar incidencias de entrega', 'alert-circle-outline', 'Incidencias'],
  ['Reportes', 'Reporte de entregas por período', 'bar-chart-outline', 'Reportes'],
  ['Avisos', 'Avisos e incidencias recientes', 'notifications-outline', 'AvisosLista'],
];

export default function Gestion({ navigation }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      {ITEMS.map(([t, d, icon, ruta]) => (
        <Card key={t} style={{ marginBottom: 12 }} onPress={() => navigation.navigate(ruta)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={icon} size={28} color={C.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 16 }}>{t}</Text>
              <Text style={{ color: C.muted }}>{d}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </View>
        </Card>
      ))}
    </View>
  );
}

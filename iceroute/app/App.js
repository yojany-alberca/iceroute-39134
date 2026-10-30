   // Casos de prueba y documentación a cargo de Lorena
   
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './src/auth';
import { Logo } from './src/components';
import { C } from './src/theme';
import Login from './src/screens/Login';
import Registro from './src/screens/Registro';
import Pedidos from './src/screens/Pedidos';
import PedidoDetalle from './src/screens/PedidoDetalle';
import NuevoPedido from './src/screens/NuevoPedido';
import Mapa from './src/screens/Mapa';
import Inventario from './src/screens/Inventario';
import Usuarios from './src/screens/Usuarios';
import Perfil from './src/screens/Perfil';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const header = {
  headerStyle: { backgroundColor: C.dark },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

const icono = (name) => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;

// Renderiza la barra de navegación inferior adaptada a los permisos del usuario (cliente, repartidor o administrador)
function Tabs() {
  const { user } = useAuth();
  const screenOptions = { ...header, tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: '#9A9AAE' };

  if (user.rol === 'cliente') {
    return (
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen name="Inicio" component={Pedidos} options={{ title: 'Mis pedidos', tabBarIcon: icono('home-outline') }} />
        <Tab.Screen name="Nuevo" component={NuevoPedido} options={{ title: 'Nuevo pedido', tabBarLabel: 'Pedir hielo', tabBarIcon: icono('add-circle') }} />
        <Tab.Screen name="Perfil" component={Perfil} options={{ tabBarIcon: icono('person-outline') }} />
      </Tab.Navigator>
    );
  }
  if (user.rol === 'repartidor') {
    return (
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen name="Entregas" component={Pedidos} options={{ title: 'Entregas asignadas', tabBarIcon: icono('cube-outline') }} />
        <Tab.Screen name="Mapa" component={Mapa} options={{ title: 'Mi recorrido', tabBarIcon: icono('map-outline') }} />
        <Tab.Screen name="Perfil" component={Perfil} options={{ tabBarIcon: icono('person-outline') }} />
      </Tab.Navigator>
    );
  }
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Pedidos" component={Pedidos} options={{ title: 'Pedidos', tabBarIcon: icono('list-outline') }} />
      <Tab.Screen name="Mapa" component={Mapa} options={{ title: 'Mapa de entregas', tabBarIcon: icono('map-outline') }} />
      <Tab.Screen name="Inventario" component={Inventario} options={{ tabBarIcon: icono('snow-outline') }} />
      <Tab.Screen name="Usuarios" component={Usuarios} options={{ tabBarIcon: icono('people-outline') }} />
      <Tab.Screen name="Perfil" component={Perfil} options={{ tabBarIcon: icono('person-outline') }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <Logo size={44} />
        <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={header}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="PedidoDetalle" component={PedidoDetalle} options={{ title: 'Detalle del pedido' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
            <Stack.Screen name="Registro" component={Registro} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
// Contenedor principal de la aplicación: inicializa la autenticación global y la navegación condicional por roles
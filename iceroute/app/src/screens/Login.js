import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Logo, Field, Btn } from '../components';
import { useAuth } from '../auth';
import { C } from '../theme';

export default function Login({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);

  const enviar = async () => {
    const e = {};
    if (!email.trim()) e.email = 'Completar este campo es obligatorio*';
    if (!password) e.password = 'Completar este campo es obligatorio*';
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err.status === 423) setBloqueado(true);
      else if (err.status === 404) setErrs({ email: 'Este correo no pertenece a una cuenta existente*' });
      else if (err.status === 401) setErrs({ password: 'Contraseña incorrecta*' });
      else Alert.alert('No se pudo iniciar sesión', err.message);
    }
    setLoading(false);
  };

  if (bloqueado) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' }}>
        <Logo />
        <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 50 }}>
          Usted ha agotado los <Text style={{ color: C.primary }}>(3)</Text> intentos de inicio de sesión
        </Text>
        <View style={{ backgroundColor: C.primary, padding: 22, borderRadius: 60, marginVertical: 28 }}>
          <Ionicons name="lock-closed" size={44} color="#fff" />
        </View>
        <Text style={{ color: C.muted, textAlign: 'center', marginBottom: 24 }}>
          Su usuario ha sido temporalmente bloqueado por seguridad. Inténtelo de nuevo en 15 minutos.
        </Text>
        <Btn title="Volver" variant="outline" onPress={() => { setBloqueado(false); setPassword(''); setErrs({}); }} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }} keyboardShouldPersistTaps="handled">
        <Logo size={42} />
        <Text style={{ fontSize: 22, textAlign: 'center', color: C.text, marginBottom: 32, marginTop: 4 }}>Iniciar sesión</Text>
        <Field label="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={errs.email} placeholder="correo@ejemplo.com" />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secure error={errs.password} placeholder="••••••••" />
        <Btn title="Iniciar" onPress={enviar} loading={loading} style={{ marginTop: 10, alignSelf: 'center', paddingHorizontal: 50 }} />
        <Text style={{ textAlign: 'center', color: C.muted, marginTop: 22 }}>¿Olvidaste tu contraseña?</Text>
        <Text style={{ textAlign: 'center', fontWeight: '700', marginTop: 2 }}
          onPress={() => Alert.alert('Recuperar contraseña', 'Comunícate con el administrador de Hielos La Nevada para restablecer tu clave.')}>
          Encuentra ayuda
        </Text>
        <Text style={{ textAlign: 'center', color: C.muted, marginTop: 22 }}>
          ¿No tienes una cuenta?{' '}
          <Text style={{ color: C.text, fontWeight: '800' }} onPress={() => navigation.navigate('Registro')}>Regístrate</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

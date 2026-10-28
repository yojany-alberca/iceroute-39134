import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Logo, Field, Btn } from '../components';
import { useAuth } from '../auth';
import { C } from '../theme';

const OBLIG = 'Completar este campo es obligatorio*';

export default function Registro({ navigation }) {
  const { registro } = useAuth();
  const [f, setF] = useState({ nombres: '', telefono: '', email: '', password: '' });
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  const enviar = async () => {
    const e = {};
    Object.keys(f).forEach((k) => { if (!f[k].trim()) e[k] = OBLIG; });
    if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Ingresa un correo válido*';
    if (!e.telefono && !/^\+?[\d\s]{7,15}$/.test(f.telefono)) e.telefono = 'Ingresa un número de celular válido*';
    if (!e.password && !/^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(f.password))
      e.password = 'Esta contraseña no es suficientemente segura*\nSe pide un mínimo de 8 caracteres, una mayúscula y un carácter especial';
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      setExito(true);
      await new Promise((r) => setTimeout(r, 1800));
      await registro(f); // al guardar la sesión, la app entra sola
    } catch (err) {
      setExito(false);
      if (/correo/i.test(err.message)) setErrs({ email: err.message + '*' });
      else if (/celular/i.test(err.message)) setErrs({ telefono: err.message + '*' });
      else Alert.alert('No se pudo registrar', err.message);
    }
    setLoading(false);
  };

  if (exito) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 30 }}>
        <Logo />
        <Text style={{ fontSize: 24, marginTop: 8 }}>Bienvenido, {f.nombres.trim().split(' ')[0]}</Text>
        <View style={{ backgroundColor: C.primary, padding: 30, borderRadius: 100, marginVertical: 50 }}>
          <Ionicons name="checkmark" size={80} color="#fff" />
        </View>
        <Text style={{ fontSize: 18, textAlign: 'center' }}>Tu cuenta se ha registrado con éxito</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }} keyboardShouldPersistTaps="handled">
        <Logo size={42} />
        <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 24, marginTop: 4 }}>Registrarse</Text>
        <Field label="Nombres y apellidos" value={f.nombres} onChangeText={set('nombres')} error={errs.nombres} placeholder="Pedro Álvarez" />
        <Field label="Número de celular" value={f.telefono} onChangeText={set('telefono')} keyboardType="phone-pad" error={errs.telefono} placeholder="987 654 321" />
        <Field label="Correo electrónico" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={errs.email} placeholder="correo@ejemplo.com" />
        <Field label="Contraseña" value={f.password} onChangeText={set('password')} secure error={errs.password} placeholder="••••••••" />
        <Btn title="Registrarse" onPress={enviar} loading={loading} style={{ marginTop: 8, alignSelf: 'center', paddingHorizontal: 50 }} />
        <Text style={{ textAlign: 'center', color: C.muted, marginTop: 22 }}>
          ¿Ya tienes una cuenta?{' '}
          <Text style={{ color: C.text, fontWeight: '800' }} onPress={() => navigation.goBack()}>Inicia sesión</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

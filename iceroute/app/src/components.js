import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, ESTADOS } from './theme';

export const Logo = ({ size = 36 }) => (
  <Text style={{ fontSize: size, fontWeight: '800', color: '#000', textAlign: 'center' }}>
    Ice<Text style={{ color: C.primary }}>Route</Text>
  </Text>
);

export function Field({ label, error, secure, ...p }) {
  const [hide, setHide] = useState(!!secure);
  return (
    <View style={{ marginBottom: 14 }}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <View style={[s.inputWrap, !!error && { borderColor: C.error }]}>
        <TextInput style={s.input} placeholderTextColor="#A0A0B0" secureTextEntry={hide} {...p} />
        {secure && <Ionicons name={hide ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} onPress={() => setHide(!hide)} />}
      </View>
      {!!error && <Text style={s.err}>{error}</Text>}
    </View>
  );
}

export function Btn({ title, onPress, loading, variant = 'primary', disabled, style, icon }) {
  const bg = variant === 'primary' ? C.primary : variant === 'danger' ? C.error : variant === 'ok' ? C.ok : '#fff';
  const fg = variant === 'outline' ? C.primary : '#fff';
  return (
    <TouchableOpacity
      activeOpacity={0.8} disabled={disabled || loading} onPress={onPress}
      style={[s.btn, { backgroundColor: bg, borderColor: variant === 'outline' ? C.primary : bg, opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon && <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} />}
          <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export const Badge = ({ estado }) => {
  const e = ESTADOS[estado] || { t: estado, c: C.muted };
  return (
    <View style={{ backgroundColor: e.c + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ color: e.c, fontWeight: '700', fontSize: 12 }}>{e.t}</Text>
    </View>
  );
};

export const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[s.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
    <Text style={{ color: active ? '#fff' : C.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
  </TouchableOpacity>
);

export const Card = ({ children, style, onPress }) => {
  const Wrap = onPress ? TouchableOpacity : View;
  return <Wrap activeOpacity={0.8} onPress={onPress} style={[s.card, style]}>{children}</Wrap>;
};

export const Empty = ({ icon = 'file-tray-outline', text }) => (
  <View style={{ alignItems: 'center', padding: 40 }}>
    <Ionicons name={icon} size={52} color={C.border} />
    <Text style={{ color: C.muted, marginTop: 10, textAlign: 'center' }}>{text}</Text>
  </View>
);

export const ErrorView = ({ msg, onRetry }) => (
  <View style={{ alignItems: 'center', padding: 32 }}>
    <Ionicons name="close-circle" size={64} color={C.error} />
    <Text style={{ color: C.error, fontWeight: '700', fontSize: 18, marginTop: 8 }}>Error de consulta</Text>
    <Text style={{ color: C.muted, textAlign: 'center', marginVertical: 10 }}>{msg || 'Ocurrió un error. Intenta más tarde.'}</Text>
    <Btn title="Reintentar" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
  </View>
);

export const Row = ({ label, value, color }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
    <Text style={{ color: C.muted, flex: 1 }}>{label}</Text>
    <Text style={{ color: color || C.text, fontWeight: '600', flex: 2, textAlign: 'right' }}>{value}</Text>
  </View>
);

export const Section = ({ title, children }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={{ fontWeight: '800', fontSize: 15, marginBottom: 6 }}>{title}</Text>
    <View style={s.card}>{children}</View>
  </View>
);

export function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}><View style={{ flex: 1, backgroundColor: '#0008' }} /></Pressable>
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <Ionicons name="close" size={24} onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, color: C.text, marginBottom: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff' },
  input: { flex: 1, paddingVertical: 11, fontSize: 15, color: C.text },
  err: { color: C.error, fontSize: 11, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  btn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '85%' },
});

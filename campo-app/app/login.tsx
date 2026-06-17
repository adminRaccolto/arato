import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { C } from '../constants/colors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail]     = useState('');
  const [senha, setSenha]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !senha) {
      Alert.alert('Campos obrigatórios', 'Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    const err = await signIn(email.trim().toLowerCase(), senha);
    setLoading(false);
    if (err) Alert.alert('Acesso negado', 'E-mail ou senha incorretos.');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.primary }}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.card}>
          <Image source={require('../assets/logo_raccolto.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.sub}>Operações rurais em campo</Text>

          <TextInput
            style={s.input}
            placeholder="E-mail"
            placeholderTextColor={C.textWeak}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />
          <TextInput
            style={s.input}
            placeholder="Senha"
            placeholderTextColor={C.textWeak}
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={s.btnTxt}>{loading ? 'Entrando…' : 'Entrar'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.rodapeTxt}>arato.agr.br · RacTech</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    backgroundColor: C.white, borderRadius: 20, padding: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logo:    { width: 210, height: 56, marginBottom: 16 },
  sub:     { fontSize: 13, color: C.textTert, marginTop: 0, marginBottom: 28 },
  input: {
    width: '100%', borderWidth: 0.5, borderColor: C.border, borderRadius: 10,
    padding: 14, fontSize: 15, color: C.text, marginBottom: 12, backgroundColor: C.bg,
  },
  btn: {
    backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15,
    width: '100%', alignItems: 'center', marginTop: 4,
  },
  btnTxt:       { color: C.white, fontSize: 16, fontWeight: '700' },
  rodapeTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 28 },
});

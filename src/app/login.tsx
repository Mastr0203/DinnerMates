import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const gestisciAuth = async () => {
    if (!email || !password || (!isLogin && !nome)) {
      Alert.alert('Errore', 'Compila tutti i campi.');
      return;
    }

    setLoading(true);
    
    if (isLogin) {
      // PROCESSO DI LOGIN
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Accesso Negato', error.message);
      else router.replace('/'); // Manda alla Home
    } else {
      // PROCESSO DI REGISTRAZIONE
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        Alert.alert('Errore Registrazione', error.message);
      } else if (data.user) {
        // Assegna Admin se il nome è Mastro, altrimenti Utente
        const ruoloAssegnato = nome.toLowerCase().includes('mastro') ? 'Admin' : 'Utente';
        
        // Salva i dati extra nella nostra tabella pubblica
        await supabase.from('utenti').insert([
          { id: data.user.id, nome: nome.trim(), email: email.trim(), ruolo: ruoloAssegnato }
        ]);
        
        Alert.alert('Benvenuto!', 'Profilo creato con successo.');
        router.replace('/'); // Manda alla Home
      }
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.logoContainer}>
        <Ionicons name="restaurant" size={80} color="#FF5A5F" />
        <Text style={styles.titoloApp}>DinnerMates</Text>
        <Text style={styles.sottotitolo}>Organizza le cene, senza stress.</Text>
      </View>

      <View style={styles.formContainer}>
        {!isLogin && (
          <View style={styles.inputBox}>
            <Ionicons name="person-outline" size={20} color="#8E8E93" style={styles.icona} />
            <TextInput style={styles.input} placeholder="Il tuo nome" value={nome} onChangeText={setNome} autoCapitalize="words" />
          </View>
        )}

        <View style={styles.inputBox}>
          <Ionicons name="mail-outline" size={20} color="#8E8E93" style={styles.icona} />
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        </View>

        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={20} color="#8E8E93" style={styles.icona} />
          <TextInput style={styles.input} placeholder="Password (min. 6 caratteri)" value={password} onChangeText={setPassword} secureTextEntry />
        </View>

        <TouchableOpacity style={styles.bottonePrimario} onPress={gestisciAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.testoBottonePrimario}>{isLogin ? 'Accedi' : 'Registrati'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottoneSecondario} onPress={() => setIsLogin(!isLogin)}>
          <Text style={styles.testoBottoneSecondario}>
            {isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 50 },
  titoloApp: { fontSize: 36, fontWeight: 'bold', color: '#1C1C1E', marginTop: 10 },
  sottotitolo: { fontSize: 16, color: '#8E8E93', marginTop: 5 },
  formContainer: { paddingHorizontal: 30 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, marginBottom: 15, paddingHorizontal: 15, height: 55, borderWidth: 1, borderColor: '#E5E5EA' },
  icona: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#1C1C1E' },
  bottonePrimario: { backgroundColor: '#FF5A5F', borderRadius: 12, height: 55, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#FF5A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  testoBottonePrimario: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  bottoneSecondario: { marginTop: 20, alignItems: 'center' },
  testoBottoneSecondario: { color: '#8E8E93', fontSize: 16, fontWeight: '500' }
});
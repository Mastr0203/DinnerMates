import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [calendario, setCalendario] = useState<any[]>([]);
  const [inCaricamento, setInCaricamento] = useState(true);
  
  // Stati Identità
  const [nomeUtente, setNomeUtente] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostraModalNome, setMostraModalNome] = useState(false);
  const [inputNome, setInputNome] = useState('');

  const [ricettaSelezionata, setRicettaSelezionata] = useState<any | null>(null);
  const [indiceScambio, setIndiceScambio] = useState<number | null>(null);

  // Ricarica i dati ogni volta che si entra nella Home
  useFocusEffect(
    useCallback(() => {
      verificaUtente();
    }, [])
  );

  const verificaUtente = async () => {
    try {
      const nomeSalvato = await AsyncStorage.getItem('utente_dinnermates');
      const ruoloSalvato = await AsyncStorage.getItem('ruolo_dinnermates');
      
      if (nomeSalvato) {
        setNomeUtente(nomeSalvato);
        setIsAdmin(ruoloSalvato === 'Admin');
        await scaricaCalendario();
      } else {
        setInCaricamento(false);
        setMostraModalNome(true);
      }
    } catch (e) {
      console.error("Errore lettura storage");
      setInCaricamento(false);
    }
  };

  const salvaNome = async () => {
    if (inputNome.trim() === '') {
      Alert.alert('Errore', 'Inserisci un nome per favore.');
      return;
    }
    const nomePulito = inputNome.trim();
    const ruoloAssegnato = nomePulito.toLowerCase() === 'mastro' ? 'Admin' : 'Utente';

    try {
      await AsyncStorage.setItem('utente_dinnermates', nomePulito);
      await AsyncStorage.setItem('ruolo_dinnermates', ruoloAssegnato);
      setNomeUtente(nomePulito);
      setIsAdmin(ruoloAssegnato === 'Admin');
      setMostraModalNome(false);
      setInCaricamento(true);
      scaricaCalendario();
    } catch (e) {
      console.error("Errore salvataggio nome");
    }
  };

  const eseguiLogout = async () => {
    try {
      await AsyncStorage.removeItem('utente_dinnermates');
      await AsyncStorage.removeItem('ruolo_dinnermates');
      setNomeUtente(null);
      setIsAdmin(false);
      setCalendario([]);
      setMostraModalNome(true);
    } catch (e) {
      console.error("Errore durante il logout");
    }
  };

  const scaricaCalendario = async () => {
    try {
      const { data, error } = await supabase
        .from('calendario')
        .select(`
          id, giorno, passato, oggi, ricetta_id,
          ricette ( id, nome, immagine_url, tempo_prep, procedimento, ricette_ingredienti ( quantita, unita_misura, ingredienti ( nome ) ) )
        `)
        .order('id', { ascending: true });

      if (error) throw error;

      if (data) {
        const calFormattato = data.map(item => ({
          id_calendario: item.id,
          giorno: item.giorno,
          passato: item.passato,
          oggi: item.oggi,
          ricetta_id_originale: item.ricette?.id,
          piatto: item.ricette?.nome || 'Nessun pasto',
          img: item.ricette?.immagine_url || 'https://via.placeholder.com/300',
          tempo: item.ricette?.tempo_prep || 0,
          procedimento: item.ricette?.procedimento || '',
          ingredienti: item.ricette?.ricette_ingredienti?.map((ri: any) => 
            `${ri.quantita} ${ri.unita_misura !== 'nan' ? ri.unita_misura : ''} ${ri.ingredienti?.nome || ''}`
          ) || []
        }));
        setCalendario(calFormattato);
      }
    } catch (error) {
      console.error("Errore nel download calendario:", error);
    } finally {
      setInCaricamento(false);
    }
  };

  const gestisciScambio = async (indexCliccato: number) => {
    if (indiceScambio === null) {
      setIndiceScambio(indexCliccato);
    } else {
      if (indiceScambio !== indexCliccato) {
        const pasto1 = calendario[indiceScambio];
        const pasto2 = calendario[indexCliccato];
        setCalendario(prev => {
          const nuovoCal = [...prev];
          nuovoCal[indiceScambio] = { ...pasto1, piatto: pasto2.piatto, img: pasto2.img, tempo: pasto2.tempo, ingredienti: pasto2.ingredienti, procedimento: pasto2.procedimento, ricetta_id_originale: pasto2.ricetta_id_originale };
          nuovoCal[indexCliccato] = { ...pasto2, piatto: pasto1.piatto, img: pasto1.img, tempo: pasto1.tempo, ingredienti: pasto1.ingredienti, procedimento: pasto1.procedimento, ricetta_id_originale: pasto1.ricetta_id_originale };
          return nuovoCal;
        });
        try {
          await supabase.from('calendario').update({ ricetta_id: pasto2.ricetta_id_originale }).eq('id', pasto1.id_calendario);
          await supabase.from('calendario').update({ ricetta_id: pasto1.ricetta_id_originale }).eq('id', pasto2.id_calendario);
        } catch (error) {
          console.error("Errore nello scambio sul cloud:", error);
        }
      }
      setIndiceScambio(null);
    }
  };

  // --- LOGICA DI CONTROLLO STATO VUOTO (PRE-VOTAZIONE) ---
  const isCalendarioVuoto = calendario.length === 0 || calendario.every(c => c.piatto === 'Nessun pasto');
  
  const cenaOggi = calendario.find(c => c.oggi);
  const giorniVuoti = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const giornoCorrenteIndex = new Date().getDay(); // 0 = Domenica
  const nomeGiornoCorrente = giornoCorrenteIndex === 0 ? 'Domenica' : giorniVuoti[giornoCorrenteIndex - 1];

  if (inCaricamento) {
    return (
      <View style={styles.centroPagina}>
        <ActivityIndicator size="large" color="#FF5A5F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.saluto}>
              Ciao {nomeUtente ? (nomeUtente.charAt(0).toUpperCase() + nomeUtente.slice(1)) : 'Coinquilino'}! {isAdmin ? '👑' : ''}
            </Text>
            <TouchableOpacity onPress={eseguiLogout} style={{ padding: 5 }}>
              <Ionicons name="log-out-outline" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          <Text style={styles.titoloOggi}>Stasera si mangia:</Text>
        </View>

        {/* HERO BANNER */}
        {isCalendarioVuoto ? (
          <View style={styles.cardOggiVuota}>
            <Ionicons name="help-circle-outline" size={100} color="#FFF" />
            <Text style={styles.testoCardVuota}>Menu in elaborazione</Text>
            <Text style={styles.sottotitoloCardVuota}>In attesa dei risultati del voto...</Text>
          </View>
        ) : (
          cenaOggi && (
            <TouchableOpacity style={styles.cardOggi} activeOpacity={0.9} onPress={() => setRicettaSelezionata(cenaOggi)}>
              <Image source={{ uri: cenaOggi.img }} style={styles.imgOggi} />
              <View style={styles.overlayOggi}>
                <View style={styles.badgeGiorno}><Text style={styles.testoBadge}>OGGI</Text></View>
                <Text style={styles.nomeOggi}>{cenaOggi.piatto}</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {/* CALENDARIO LISTA */}
        <View style={styles.sezioneCalendario}>
          <View style={styles.headerCalendario}>
            <Text style={styles.titoloSezione}>Il Menu della Settimana</Text>
          </View>
          
          {isCalendarioVuoto ? (
            // TEMPLATE VUOTO PRE-VOTAZIONE
            giorniVuoti.map((giorno, index) => {
              const isOggi = giorno === nomeGiornoCorrente;
              return (
                <View key={index} style={[styles.rigaGiorno, isOggi && styles.rigaOggi]}>
                  <View style={styles.colonnaGiorno}>
                    <Text style={[styles.testoGiorno, isOggi && { color: '#FF5A5F' }]}>{giorno.substring(0, 3).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardGiorno}>
                    <View style={styles.imgGiornoPiccolaVuota}>
                      <Ionicons name="help" size={20} color="#8E8E93" />
                    </View>
                    <Text style={[styles.nomeGiornoLista, { color: '#8E8E93', fontStyle: 'italic' }]}>Coming soon...</Text>
                  </View>
                </View>
              );
            })
          ) : (
            // CALENDARIO REALE
            calendario.map((item, index) => {
              const inScambio = indiceScambio === index;
              return (
                <View key={item.id_calendario} style={[styles.rigaGiorno, item.oggi && styles.rigaOggi, item.passato && { opacity: 0.5 }]}>
                  <View style={styles.colonnaGiorno}>
                    <Text style={[styles.testoGiorno, item.oggi && { color: '#FF5A5F' }]}>{item.giorno.substring(0, 3).toUpperCase()}</Text>
                  </View>
                  <TouchableOpacity style={[styles.cardGiorno, inScambio && styles.cardInScambio]} onPress={() => setRicettaSelezionata(item)} activeOpacity={0.7}>
                    <Image source={{ uri: item.img }} style={styles.imgGiornoPiccola} />
                    <Text style={styles.nomeGiornoLista} numberOfLines={1}>{item.piatto}</Text>
                    
                    {!item.passato && (
                      <TouchableOpacity style={[styles.btnScambia, inScambio && { backgroundColor: '#FF5A5F' }]} onPress={() => gestisciScambio(index)}>
                        <Ionicons name="swap-vertical" size={20} color={inScambio ? '#FFF' : '#8E8E93'} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* MODAL DETTAGLIO RICETTA */}
      <Modal visible={ricettaSelezionata !== null} animationType="slide" presentationStyle="pageSheet">
        {ricettaSelezionata && (
          <View style={{ flex: 1, backgroundColor: '#FFF' }}>
            <Image source={{ uri: ricettaSelezionata.img }} style={{ width: '100%', height: 250 }} />
            <TouchableOpacity style={styles.btnChiudiModaleDettaglio} onPress={() => setRicettaSelezionata(null)}>
              <Ionicons name="close-circle" size={36} color="#FFF" />
            </TouchableOpacity>
            <ScrollView style={{ padding: 20 }}>
              <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 }}>{ricettaSelezionata.piatto}</Text>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 }}>Ingredienti</Text>
              {ricettaSelezionata.ingredienti.map((ing: string, idx: number) => (
                <Text key={idx} style={{ fontSize: 16, color: '#3A3A3C', marginBottom: 6 }}>• {ing}</Text>
              ))}
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginTop: 20, marginBottom: 10 }}>Procedimento</Text>
              <Text style={{ fontSize: 16, color: '#3A3A3C', lineHeight: 24 }}>{ricettaSelezionata.procedimento}</Text>
              <View style={{ height: 60 }} />
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* POPUP RICHIESTA NOME */}
      <Modal visible={mostraModalNome} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackground}>
          <View style={styles.modalBox}>
            <Ionicons name="person-circle" size={80} color="#FF5A5F" />
            <Text style={styles.titoloModalRating}>Chi sei?</Text>
            <Text style={styles.sottotitoloModalRating}>Inserisci il tuo nome per votare i piatti con i coinquilini.</Text>
            <TextInput style={styles.inputNome} placeholder="Es. Francesco" placeholderTextColor="#8E8E93" value={inputNome} onChangeText={setInputNome} autoCapitalize="words" />
            <TouchableOpacity style={styles.btnSalvaNome} onPress={salvaNome}>
              <Text style={styles.testoBtnSalvaNome}>Entra in casa</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centroPagina: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 60, paddingBottom: 10 },
  saluto: { fontSize: 18, color: '#8E8E93', fontWeight: '600' },
  titoloOggi: { fontSize: 32, fontWeight: 'bold', color: '#1C1C1E', marginTop: 4 },
  
  // Stili Card Piena
  cardOggi: { margin: 20, marginTop: 10, height: 250, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  imgOggi: { width: '100%', height: '100%', position: 'absolute' },
  overlayOggi: { position: 'absolute', top: 20, left: 20, right: 20 },
  badgeGiorno: { backgroundColor: '#FF5A5F', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 8 },
  testoBadge: { color: '#FFF', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  nomeOggi: { fontSize: 28, fontWeight: 'bold', color: '#FFF', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  
  // Stili Card Vuota (Pre-Voto)
  cardOggiVuota: { margin: 20, marginTop: 10, height: 250, borderRadius: 24, backgroundColor: '#FF5A5F', justifyContent: 'center', alignItems: 'center', shadowColor: '#FF5A5F', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  testoCardVuota: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 15 },
  sottotitoloCardVuota: { color: '#FFF', fontSize: 16, opacity: 0.8, marginTop: 5 },
  imgGiornoPiccolaVuota: { width: 40, height: 40, borderRadius: 10, marginRight: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },

  sezioneCalendario: { paddingHorizontal: 20, marginTop: 10 },
  headerCalendario: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titoloSezione: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E' },
  rigaGiorno: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rigaOggi: { backgroundColor: '#FFF0F0', borderRadius: 16, padding: 8, marginLeft: -8 },
  colonnaGiorno: { width: 45, alignItems: 'center' },
  testoGiorno: { fontSize: 15, fontWeight: 'bold', color: '#8E8E93' },
  cardGiorno: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 10, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardInScambio: { borderWidth: 2, borderColor: '#FF5A5F', transform: [{ scale: 1.02 }] },
  imgGiornoPiccola: { width: 40, height: 40, borderRadius: 10, marginRight: 12 },
  nomeGiornoLista: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  btnScambia: { padding: 8, borderRadius: 12, backgroundColor: '#F2F2F7' },
  btnChiudiModaleDettaglio: { position: 'absolute', top: 20, right: 20, zIndex: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5 },
  
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '85%', backgroundColor: '#FFF', borderRadius: 24, padding: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  titoloModalRating: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E', marginTop: 10, marginBottom: 5 },
  sottotitoloModalRating: { fontSize: 16, color: '#8E8E93', marginBottom: 25, textAlign: 'center', lineHeight: 22 },
  inputNome: { width: '100%', height: 55, backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 20, fontSize: 18, marginBottom: 25, borderWidth: 1, borderColor: '#E5E5EA' },
  btnSalvaNome: { backgroundColor: '#FF5A5F', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12, width: '100%', alignItems: 'center' },
  testoBtnSalvaNome: { fontSize: 18, fontWeight: 'bold', color: '#FFF' }
});
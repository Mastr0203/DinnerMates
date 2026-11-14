import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Vota() {
  const [nomeUtente, setNomeUtente] = useState<string>('Anonimo');
  const [isAdmin, setIsAdmin] = useState(false);
  const [inCaricamento, setInCaricamento] = useState(true);
  
  // Macchina a Stati: 'COUNTDOWN' | 'SETUP' | 'WAIT_ADMIN' | 'PROPOSTA' | 'ATTESA' | 'VOTO'
  const [fase, setFase] = useState('COUNTDOWN');
  
  const [commensaliTotali, setCommensaliTotali] = useState(3);
  const [votazioneAbilitata, setVotazioneAbilitata] = useState(false);
  const [utentiProponenti, setUtentiProponenti] = useState<string[]>([]);
  
  // Fase Proposta
  const [ricettarioDb, setRicettarioDb] = useState<any[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [selezionati, setSelezionati] = useState<string[]>([]);
  
  // Fase Voto
  const [piattiDegliAltri, setPiattiDegliAltri] = useState<any[]>([]);
  const [indiceCard, setIndiceCard] = useState(0);
  const [likeRimasti, setLikeRimasti] = useState(4);
  const [tempoRimanente, setTempoRimanente] = useState('');

// Questo ricaricherà i dati OGNI VOLTA che apri la tab "Vota"
  useFocusEffect(
    useCallback(() => {
      setInCaricamento(true);
      inizializza();
    }, [])
  );

const inizializza = async () => {
    try {
      const nomeSalvato = await AsyncStorage.getItem('utente_dinnermates') || 'Anonimo';
      const ruolo = await AsyncStorage.getItem('ruolo_dinnermates');
      setNomeUtente(nomeSalvato);
      setIsAdmin(ruolo === 'Admin');

      // 0. GESTIONE DEL TEMPO E RESET AUTOMATICO
      const oraAttuale = new Date();
      const giorno = oraAttuale.getDay(); // 0 = Domenica, 6 = Sabato
      const ora = oraAttuale.getHours();
      
      const eDomenicaPomeriggio = (giorno === 0 && ora >= 14);
      // Finestra in cui l'Admin deve agire (da Domenica h14 fino a Martedì, nel caso faccia tardi)
      const isFinestraSetup = eDomenicaPomeriggio || giorno === 1 || giorno === 2;

      // Se è domenica pomeriggio e ci sono voti vecchi, pialla tutto
      const { data: controllaVoti } = await supabase.from('voti_settimana').select('id').limit(1);
      const settimanaVecchiaDaCancellare = controllaVoti && controllaVoti.length > 0;

      if (eDomenicaPomeriggio && settimanaVecchiaDaCancellare) {
        await supabase.from('proposte_settimana').delete().neq('id', 0);
        await supabase.from('voti_settimana').delete().neq('id', 0);
        await supabase.from('impostazioni').update({ votazione_abilitata: false }).eq('id', 1);
      }

      // 1. Leggi impostazioni globali
      const { data: impData } = await supabase.from('impostazioni').select('*').eq('id', 1).single();
      const commensali = impData?.numero_commensali || 3;
      const abilitata = impData?.votazione_abilitata || false;
      
      setCommensaliTotali(commensali);
      setVotazioneAbilitata(abilitata);

      // 2. Chi ha già proposto?
      const { data: propData } = await supabase.from('proposte_settimana').select('utente_nome');
      const proponentiUnici = [...new Set(propData?.map(p => p.utente_nome) || [])];
      setUtentiProponenti(proponentiUnici);

      // 3. Ho già votato?
      const { data: votiData } = await supabase.from('voti_settimana').select('id').eq('utente_nome', nomeSalvato);
      const hoGiaVotato = votiData && votiData.length > 0;
      const hoGiaProposto = proponentiUnici.includes(nomeSalvato);

      // 4. ROUTING DELLA MACCHINA A STATI MIGLIORATA
      if (hoGiaVotato) { 
        // Hai già votato: vedi il countdown per la prossima settimana
        setFase('COUNTDOWN');
      } else if (!abilitata) {
        if (isFinestraSetup) {
          // È passata Domenica alle 14:00, l'Admin deve aprire le danze (Setup/Lucchetto)
          setFase(ruolo === 'Admin' ? 'SETUP' : 'WAIT_ADMIN');
        } else {
          // È Sabato o Domenica mattina: HYPE per tutti, mostriamo il countdown!
          setFase('COUNTDOWN');
        }
      } else if (!hoGiaProposto) {
        const { data: ricette } = await supabase.from('ricette').select('id, nome, immagine_url');
        if (ricette) setRicettarioDb(ricette);
        setFase('PROPOSTA');
      } else {
        setFase('ATTESA');
      }
    } catch (error) {
      console.error("Errore fetch iniziale:", error);
    } finally {
      setInCaricamento(false);
    }
  };

  // Gestione Timer (se in Countdown)
  useFocusEffect(() => {
    if (fase === 'COUNTDOWN') {
      const timer = setInterval(() => {
        const ora = new Date();
        let domenica = new Date();
        domenica.setDate(ora.getDate() + ((7 - ora.getDay()) % 7));
        domenica.setHours(14, 0, 0, 0);
        if (ora.getDay() === 0 && ora.getHours() >= 14) domenica.setDate(domenica.getDate() + 7);

        const diff = domenica.getTime() - ora.getTime();
        setTempoRimanente(`${Math.floor(diff / (1000 * 60 * 60 * 24))}g : ${Math.floor((diff / (1000 * 60 * 60)) % 24)}h : ${Math.floor((diff / 1000 / 60) % 60)}m : ${Math.floor((diff / 1000) % 60)}s`);
      }, 1000);
      return () => clearInterval(timer);
    }
  });

  // AZIONI
  const cambiaCommensali = (num: number) => {
    if (num >= 1 && num <= 10) setCommensaliTotali(num);
  };

  const abilitaVotazioni = async () => {
    setInCaricamento(true);
    try {
      await supabase.from('impostazioni').update({ numero_commensali: commensaliTotali, votazione_abilitata: true }).eq('id', 1);
      const { data: ricette } = await supabase.from('ricette').select('id, nome, immagine_url');
      if (ricette) setRicettarioDb(ricette);
      setVotazioneAbilitata(true);
      setFase('PROPOSTA');
    } catch (e) {
      Alert.alert("Errore", "Impossibile abilitare le votazioni.");
    } finally {
      setInCaricamento(false);
    }
  };

  const gestisciSelezione = (id: string) => {
    if (selezionati.includes(id)) setSelezionati(selezionati.filter(item => item !== id));
    else if (selezionati.length < 5) setSelezionati([...selezionati, id]);
  };

  const inviaProposte = async () => {
    setInCaricamento(true);
    try {
      const insert = selezionati.map(id => ({ utente_nome: nomeUtente, ricetta_id: id }));
      await supabase.from('proposte_settimana').insert(insert);
      setUtentiProponenti([...utentiProponenti, nomeUtente]);
      setFase('ATTESA');
    } catch (error) {
      Alert.alert("Errore", "Impossibile inviare le proposte.");
    } finally {
      setInCaricamento(false);
    }
  };

  const avviaVotazione = async () => {
    setInCaricamento(true);
    try {
      const { data } = await supabase.from('proposte_settimana').select('ricetta_id, ricette(id, nome, immagine_url)').neq('utente_nome', nomeUtente);
      if (data) {
        const uniche: any[] = [];
        const ids = new Set();
        data.forEach(row => {
          if (row.ricette && !ids.has(row.ricetta_id)) {
            ids.add(row.ricetta_id);
            uniche.push(row.ricette);
          }
        });
        setPiattiDegliAltri(uniche.sort(() => 0.5 - Math.random()));
        setFase('VOTO');
      }
    } finally {
      setInCaricamento(false);
    }
  };

  const gestisciVoto = async (isLike: boolean) => {
    let nuoviLike = likeRimasti;
    if (isLike && likeRimasti > 0) {
      await supabase.from('voti_settimana').insert([{ utente_nome: nomeUtente, ricetta_id: piattiDegliAltri[indiceCard].id }]);
      nuoviLike -= 1;
      setLikeRimasti(nuoviLike);
    }
    if (indiceCard < piattiDegliAltri.length - 1 && (isLike ? nuoviLike > 0 : true)) {
      setIndiceCard(indiceCard + 1);
    } else {
      setFase('COUNTDOWN');
    }
  };

  // --- RENDER ---
  if (inCaricamento) return <View style={styles.containerCenter}><ActivityIndicator size="large" color="#FF5A5F" /></View>;

  if (fase === 'SETUP') {
    return (
      <View style={styles.containerCenter}>
        <Ionicons name="settings" size={80} color="#FF5A5F" />
        <Text style={styles.titoloSetup}>Setup Settimana</Text>
        <Text style={styles.sottotitolo}>Quanti commensali mangeranno in casa questa settimana?</Text>
        
        <View style={styles.adminControls}>
          <TouchableOpacity onPress={() => cambiaCommensali(commensaliTotali - 1)}><Ionicons name="remove-circle" size={50} color="#FF5A5F" /></TouchableOpacity>
          <Text style={styles.adminNumber}>{commensaliTotali}</Text>
          <TouchableOpacity onPress={() => cambiaCommensali(commensaliTotali + 1)}><Ionicons name="add-circle" size={50} color="#FF5A5F" /></TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.bottoneFluttuante, {alignSelf: 'center', marginTop: 40}]} onPress={abilitaVotazioni}>
          <Text style={styles.testoBottone}>Abilita Votazioni</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (fase === 'WAIT_ADMIN') {
    return (
      <View style={styles.containerCenter}>
        <Ionicons name="lock-closed" size={80} color="#8E8E93" />
        <Text style={styles.titoloSetup}>Votazioni Chiuse</Text>
        <Text style={styles.sottotitolo}>In attesa che l'Admin configuri la settimana e sblocchi le votazioni.</Text>
      </View>
    );
  }

  if (fase === 'PROPOSTA') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.titolo}>Le tue Proposte</Text>
          <View style={styles.badgeProgresso}><Text style={styles.testoProgresso}>{selezionati.length} / 5</Text></View>
        </View>
        <FlatList
          data={ricettarioDb.filter(r => r.nome.toLowerCase().includes(ricerca.toLowerCase()))}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isSelezionato = selezionati.includes(item.id);
            return (
              <TouchableOpacity style={[styles.card, isSelezionato && styles.cardSelezionata]} onPress={() => gestisciSelezione(item.id)} activeOpacity={0.8}>
                <Image source={{ uri: item.immagine_url }} style={styles.immagineRicetta} />
                <View style={styles.overlayTesto}><Text style={styles.nomeRicetta}>{item.nome}</Text></View>
                {isSelezionato && <View style={styles.spuntaContainer}><Ionicons name="checkmark-circle" size={28} color="#FF5A5F" /></View>}
              </TouchableOpacity>
            );
          }}
        />
        {selezionati.length === 5 && (
          <TouchableOpacity style={styles.bottoneFluttuante} onPress={inviaProposte}><Text style={styles.testoBottone}>Invia Proposte</Text></TouchableOpacity>
        )}
      </View>
    );
  }

  if (fase === 'ATTESA') {
    const tuttiPronti = utentiProponenti.length >= commensaliTotali;
    return (
      <View style={styles.containerCenter}>
        <Ionicons name="time-outline" size={80} color="#FF5A5F" />
        <Text style={styles.titoloSetup}>Sala d'Attesa</Text>
        <Text style={styles.sottotitolo}>Hanno fatto le loro proposte {utentiProponenti.length} coinquilini su {commensaliTotali}.</Text>

        {tuttiPronti ? (
          <TouchableOpacity style={[styles.bottoneFluttuante, {alignSelf: 'center', marginTop: 50}]} onPress={avviaVotazione}>
            <Text style={styles.testoBottone}>Inizia a Votare!</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.bottoneFluttuante, {alignSelf: 'center', marginTop: 50, backgroundColor: '#E5E5EA'}]}>
            <Text style={[styles.testoBottone, { color: '#8E8E93' }]}>In attesa degli altri...</Text>
          </View>
        )}
      </View>
    );
  }

  if (fase === 'VOTO' && piattiDegliAltri.length > 0) {
    const piatto = piattiDegliAltri[indiceCard];
    return (
      <View style={styles.containerTinder}>
        <Text style={styles.likeRimanenti}>Like rimasti: {likeRimasti}</Text>
        <View style={styles.tinderCard}>
          <Image source={{ uri: piatto.immagine_url }} style={styles.immagineTinder} />
          <View style={styles.tinderOverlay}><Text style={styles.titoloTinder}>{piatto.nome}</Text></View>
        </View>
        <View style={styles.tinderButtons}>
          <TouchableOpacity style={[styles.btnTinder, { borderColor: '#FF3B30' }]} onPress={() => gestisciVoto(false)}><Ionicons name="close" size={40} color="#FF3B30" /></TouchableOpacity>
          <TouchableOpacity style={[styles.btnTinder, { borderColor: '#34C759' }]} onPress={() => gestisciVoto(true)}><Ionicons name="heart" size={40} color="#34C759" /></TouchableOpacity>
        </View>
      </View>
    );
  }

if (fase === 'COUNTDOWN') {
    // Flag che controlla se siamo prima del lancio ufficiale (Domenica 15 Nov 2026, ore 14:00)
    const isPrimaVolta = new Date() < new Date('2026-11-15T14:00:00');

    return (
      <View style={styles.containerCenter}>
        {isPrimaVolta ? (
          <Ionicons name="rocket" size={80} color="#FF5A5F" />
        ) : (
          <Ionicons name="checkmark-done-circle" size={80} color="#34C759" />
        )}
        
        <Text style={styles.titoloSetup}>
          {isPrimaVolta ? "Pronti per la prima votazione?" : "Voti Registrati!"}
        </Text>
        <Text style={styles.sottotitolo}>
          {isPrimaVolta ? "Cosa si mangerà la prima settimana?" : "Il calendario in Home è stato generato."}
        </Text>
        
        <View style={styles.countdownBox}>
          <Text style={styles.countdownLabel}>
            {isPrimaVolta ? "IL LANCIO UFFICIALE TRA:" : "PROSSIMA VOTAZIONE TRA:"}
          </Text>
          <Text style={styles.countdownTime}>{tempoRimanente}</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  containerCenter: { flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#FFF' },
  titolo: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E' },
  badgeProgresso: { backgroundColor: '#F2F2F7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  testoProgresso: { fontSize: 16, fontWeight: '600', color: '#FF5A5F' },
  card: { flex: 1, margin: 6, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFF' },
  cardSelezionata: { borderWidth: 3, borderColor: '#FF5A5F' },
  immagineRicetta: { width: '100%', height: '100%', position: 'absolute' },
  overlayTesto: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8 },
  nomeRicetta: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  spuntaContainer: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 14 },
  bottoneFluttuante: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#FF5A5F', padding: 16, borderRadius: 12, alignItems: 'center' },
  testoBottone: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  titoloSetup: { fontSize: 28, fontWeight: 'bold', marginTop: 20, color: '#1C1C1E', textAlign: 'center' },
  sottotitolo: { fontSize: 16, color: '#8E8E93', marginTop: 10, textAlign: 'center', lineHeight: 22 },
  
  adminControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '60%', marginTop: 30 },
  adminNumber: { fontSize: 48, fontWeight: 'bold', color: '#1C1C1E' },

  containerTinder: { flex: 1, backgroundColor: '#1C1C1E', padding: 20, paddingTop: 60, alignItems: 'center' },
  likeRimanenti: { color: '#FFF', fontSize: 18, fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  tinderCard: { width: '100%', flex: 1, backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginBottom: 30 },
  immagineTinder: { width: '100%', height: '100%', position: 'absolute' },
  tinderOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 20 },
  titoloTinder: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  tinderButtons: { flexDirection: 'row', justifyContent: 'space-evenly', width: '100%', marginBottom: 20 },
  btnTinder: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1C1C1E' },
  
  countdownBox: { marginTop: 40, padding: 20, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E5EA', width: '100%', alignItems: 'center' },
  countdownLabel: { fontSize: 12, fontWeight: 'bold', color: '#8E8E93', letterSpacing: 1, marginBottom: 10 },
  countdownTime: { fontSize: 26, fontWeight: 'bold', color: '#FF5A5F' }
});
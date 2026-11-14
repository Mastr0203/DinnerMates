import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

type IngredienteRicetta = { quantita: string; unitaMisura: string; nome: string };

type Ricetta = {
  id: string; nome: string; img: string; stelle: number; volte: number; tempo: number;
  ingredienti: string[]; ingredientiGrezzi: IngredienteRicetta[]; procedimento: string;
};

export default function Ricettario() {
  const [ricerca, setRicerca] = useState('');
  const [ordinamento, setOrdinamento] = useState<'A-Z' | 'STELLE' | 'MENO_CUCINATE'>('A-Z');
  const [ricettario, setRicettario] = useState<Ricetta[]>([]);
  const [inCaricamento, setInCaricamento] = useState(true);
  const [ricettaSelezionata, setRicettaSelezionata] = useState<Ricetta | null>(null);

  // Stati per Form (Nuova / Modifica)
  const [modalNuovaRicetta, setModalNuovaRicetta] = useState(false);
  const [idInModifica, setIdInModifica] = useState<string | null>(null);
  const [nuovoNome, setNuovoNome] = useState('');
  const [nuovaImg, setNuovaImg] = useState('');
  const [nuovoTempo, setNuovoTempo] = useState('');
  const [nuovoProcedimento, setNuovoProcedimento] = useState('');
  const [nuoviIngredienti, setNuoviIngredienti] = useState<IngredienteRicetta[]>([{ quantita: '', unitaMisura: '', nome: '' }]);
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  useEffect(() => {
    scaricaRicette();
  }, []);

  const scaricaRicette = async () => {
    try {
      setInCaricamento(true);
      const { data, error } = await supabase
        .from('ricette')
        .select(`
          id, nome, immagine_url, tempo_prep, procedimento, rating_medio, num_preparazioni,
          ricette_ingredienti ( quantita, unita_misura, ingredienti ( nome ) )
        `);

      if (error) throw error;

      if (data) {
        const ricetteFormattate: Ricetta[] = data.map(r => ({
          id: r.id,
          nome: r.nome,
          img: r.immagine_url || 'https://via.placeholder.com/250',
          stelle: r.rating_medio || 0,
          volte: r.num_preparazioni || 0,
          tempo: r.tempo_prep || 0,
          procedimento: r.procedimento || '',
          // Lista testuale per la visualizzazione
          ingredienti: r.ricette_ingredienti.map((ri: any) => 
            `${ri.quantita} ${ri.unita_misura !== 'nan' ? ri.unita_misura : ''} ${ri.ingredienti?.nome || ''}`.trim()
          ),
          // Dati grezzi per ricaricarli nel form in caso di modifica
          ingredientiGrezzi: r.ricette_ingredienti.map((ri: any) => ({
            quantita: ri.quantita ? ri.quantita.toString() : '',
            unitaMisura: ri.unita_misura !== 'nan' ? ri.unita_misura : '',
            nome: ri.ingredienti?.nome || ''
          }))
        }));
        setRicettario(ricetteFormattate);
      }
    } catch (error) {
      console.error("Errore Fetch:", error);
    } finally {
      setInCaricamento(false);
    }
  };

  // --- ORDINAMENTO E FILTRI ---
  let ricetteMostrate = ricettario.filter(r => r.nome.toLowerCase().includes(ricerca.toLowerCase()));
  if (ordinamento === 'A-Z') ricetteMostrate.sort((a, b) => a.nome.localeCompare(b.nome));
  else if (ordinamento === 'STELLE') ricetteMostrate.sort((a, b) => b.stelle - a.stelle);
  else if (ordinamento === 'MENO_CUCINATE') ricetteMostrate.sort((a, b) => a.volte - b.volte);

  // --- SELEZIONE FOTO DA TELEFONO ---
  const scegliImmagine = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Comprime un po' la foto per non intasare Supabase
    });

    if (!result.canceled) {
      setNuovaImg(result.assets[0].uri);
    }
  };

  // --- LOGICHE CRUD (Modifica & Elimina) ---
  const apriModifica = (r: Ricetta) => {
    setIdInModifica(r.id);
    setNuovoNome(r.nome);
    setNuovaImg(r.img);
    setNuovoTempo(r.tempo.toString());
    setNuovoProcedimento(r.procedimento);
    setNuoviIngredienti(r.ingredientiGrezzi.length > 0 ? r.ingredientiGrezzi : [{ quantita: '', unitaMisura: '', nome: '' }]);
    setRicettaSelezionata(null); // Chiude dettaglio
    setModalNuovaRicetta(true);  // Apre form
  };

  const eliminaRicetta = (id: string, nome: string) => {
    Alert.alert("Elimina Ricetta", `Sei sicuro di voler eliminare "${nome}" per sempre?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: async () => {
          try {
            setInCaricamento(true);
            setRicettaSelezionata(null);
            // Eliminiamo prima i collegamenti (Foreign Key), poi la ricetta
            await supabase.from('ricette_ingredienti').delete().eq('ricetta_id', id);
            await supabase.from('ricette').delete().eq('id', id);
            scaricaRicette();
          } catch (error) {
            Alert.alert("Errore", "Impossibile eliminare.");
          }
      }}
    ]);
  };

  // --- GESTIONE FORM INGREDIENTI ---
  const aggiungiRigaIngrediente = () => setNuoviIngredienti([...nuoviIngredienti, { quantita: '', unitaMisura: '', nome: '' }]);
  const aggiornaIngrediente = (index: number, campo: keyof IngredienteRicetta, valore: string) => {
    const agg = [...nuoviIngredienti];
    agg[index][campo] = valore;
    setNuoviIngredienti(agg);
  };
  const rimuoviIngrediente = (index: number) => setNuoviIngredienti(nuoviIngredienti.filter((_, i) => i !== index));

  const apriFormNuovo = () => {
    setIdInModifica(null);
    setNuovoNome(''); setNuovaImg(''); setNuovoTempo(''); setNuovoProcedimento('');
    setNuoviIngredienti([{ quantita: '', unitaMisura: '', nome: '' }]);
    setModalNuovaRicetta(true);
  };

  // --- SALVATAGGIO (INSERT O UPDATE CON UPLOAD FOTO) ---
  const salvaRicetta = async () => {
    if (!nuovoNome.trim() || !nuovoProcedimento.trim() || nuoviIngredienti.length === 0 || !nuoviIngredienti[0].nome) {
      Alert.alert('Errore', 'Compila i campi principali e almeno un ingrediente.');
      return;
    }

    setSalvataggioInCorso(true);
    try {
      let finalImageUrl = nuovaImg.trim();

      // Se l'immagine è un file locale del telefono (file://...), dobbiamo caricarla su Supabase Storage
      if (finalImageUrl.startsWith('file://')) {
        const estensione = finalImageUrl.split('.').pop();
        const nomeFile = `${Date.now()}.${estensione}`;
        
        const response = await fetch(finalImageUrl);
        const blob = await response.blob();
        
        const { error: uploadError } = await supabase.storage.from('immagini').upload(nomeFile, blob);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('immagini').getPublicUrl(nomeFile);
        finalImageUrl = publicUrlData.publicUrl;
      }

      // 1. GESTIONE RICETTA (Update o Insert)
      let idRicetta = idInModifica;

      if (idRicetta) {
        // UPDATE
        await supabase.from('ricette').update({
          nome: nuovoNome.trim(),
          immagine_url: finalImageUrl || null,
          tempo_prep: parseInt(nuovoTempo) || 15,
          procedimento: nuovoProcedimento.trim()
        }).eq('id', idRicetta);
        
        // Pialliamo i vecchi ingredienti prima di rimettere quelli nuovi
        await supabase.from('ricette_ingredienti').delete().eq('ricetta_id', idRicetta);
      } else {
        // INSERT
        idRicetta = `R${Date.now()}`;
        const { error: errRicetta } = await supabase.from('ricette').insert([{
          id: idRicetta,
          nome: nuovoNome.trim(),
          immagine_url: finalImageUrl || null,
          tempo_prep: parseInt(nuovoTempo) || 15,
          procedimento: nuovoProcedimento.trim()
        }]);
        if (errRicetta) throw errRicetta;
      }

      // 2. GESTIONE INGREDIENTI
      for (const ing of nuoviIngredienti) {
        if (!ing.nome.trim()) continue;
        const nomePulito = ing.nome.trim().toLowerCase();

        let { data: ingredienteDb } = await supabase.from('ingredienti').select('id').eq('nome', nomePulito).single();
        let idIngrediente = ingredienteDb?.id;
        
        if (!idIngrediente) {
          const { data: nuovoIngDb, error: errNuovoIng } = await supabase.from('ingredienti').insert([{ nome: nomePulito }]).select().single();
          if (errNuovoIng) throw errNuovoIng;
          idIngrediente = nuovoIngDb.id;
        }

        await supabase.from('ricette_ingredienti').insert([{
          ricetta_id: idRicetta,
          ingrediente_id: idIngrediente,
          quantita: parseFloat(ing.quantita) || null,
          unita_misura: ing.unitaMisura.trim() || 'nan'
        }]);
      }

      setModalNuovaRicetta(false);
      scaricaRicette();
      Alert.alert('Successo!', idInModifica ? 'Ricetta aggiornata.' : 'Nuova ricetta salvata.');

    } catch (error) {
      console.error("Errore salvataggio:", error);
      Alert.alert('Errore', 'Impossibile salvare la ricetta.');
    } finally {
      setSalvataggioInCorso(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titolo}>Ricettario</Text>
      </View>

      <View style={styles.barraRicerca}>
        <Ionicons name="search" size={20} color="#8E8E93" style={{ marginRight: 8 }} />
        <TextInput style={{ flex: 1, fontSize: 16 }} placeholder="Cerca..." placeholderTextColor="#8E8E93" value={ricerca} onChangeText={setRicerca} />
      </View>

      <View style={styles.filtriContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity style={[styles.pillolaFiltro, ordinamento === 'A-Z' && styles.pillolaAttiva]} onPress={() => setOrdinamento('A-Z')}><Text style={[styles.testoFiltro, ordinamento === 'A-Z' && styles.testoFiltroAttivo]}>A-Z</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.pillolaFiltro, ordinamento === 'STELLE' && styles.pillolaAttiva]} onPress={() => setOrdinamento('STELLE')}><Text style={[styles.testoFiltro, ordinamento === 'STELLE' && styles.testoFiltroAttivo]}>⭐ Più Stellate</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.pillolaFiltro, ordinamento === 'MENO_CUCINATE' && styles.pillolaAttiva]} onPress={() => setOrdinamento('MENO_CUCINATE')}><Text style={[styles.testoFiltro, ordinamento === 'MENO_CUCINATE' && styles.testoFiltroAttivo]}>🆕 Meno Cucinate</Text></TouchableOpacity>
        </ScrollView>
      </View>

      {inCaricamento ? (
        <View style={styles.centroPagina}><ActivityIndicator size="large" color="#FF5A5F" /></View>
      ) : (
        <FlatList
          data={ricetteMostrate}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.cardLista} onPress={() => setRicettaSelezionata(item)} activeOpacity={0.7}>
              <Image source={{ uri: item.img }} style={styles.imgLista} />
              <View style={styles.infoLista}>
                <Text style={styles.nomeLista}>{item.nome}</Text>
                <View style={styles.statsLista}>
                  <View style={styles.badgeStat}><Ionicons name="star" size={14} color="#FFD700" /><Text style={styles.testoStats}> {item.stelle.toFixed(1)}</Text></View>
                  <View style={styles.badgeStat}><Ionicons name="restaurant-outline" size={14} color="#8E8E93" /><Text style={styles.testoStats}> Cucinata: {item.volte}</Text></View>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB - Aggiungi Ricetta */}
      <TouchableOpacity style={styles.fab} onPress={apriFormNuovo}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL DETTAGLIO RICETTA (Con Modifica/Elimina) */}
      <Modal visible={ricettaSelezionata !== null} animationType="slide" presentationStyle="pageSheet">
        {ricettaSelezionata && (
          <View style={{ flex: 1, backgroundColor: '#FFF' }}>
            <Image source={{ uri: ricettaSelezionata.img }} style={styles.imgModale} />
            
            {/* Pulsanti Azione Header */}
            <View style={styles.headerModaleBottoni}>
              <TouchableOpacity style={styles.btnModaleAzione} onPress={() => apriModifica(ricettaSelezionata)}>
                <Ionicons name="pencil" size={24} color="#1C1C1E" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnModaleAzione} onPress={() => eliminaRicetta(ricettaSelezionata.id, ricettaSelezionata.nome)}>
                <Ionicons name="trash" size={24} color="#FF3B30" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModaleAzione, { backgroundColor: '#1C1C1E' }]} onPress={() => setRicettaSelezionata(null)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.titoloModale}>{ricettaSelezionata.nome}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                <View style={styles.badgeTempo}><Ionicons name="time-outline" size={18} color="#FF5A5F" /><Text style={styles.testoBadgeModale}> {ricettaSelezionata.tempo} min</Text></View>
              </View>
              <Text style={styles.sezioneTitolo}>Ingredienti (per 1 persona)</Text>
              {ricettaSelezionata.ingredienti.map((ing, idx) => <Text key={idx} style={styles.testoDettaglio}>• {ing}</Text>)}
              <Text style={[styles.sezioneTitolo, { marginTop: 20 }]}>Procedimento</Text>
              <Text style={[styles.testoDettaglio, { lineHeight: 24 }]}>{ricettaSelezionata.procedimento}</Text>
              <View style={{ height: 60 }} />
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* MODAL FORM NUOVA/MODIFICA RICETTA */}
      <Modal visible={modalNuovaRicetta} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
          <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10 }]}>
            <Text style={{ fontSize: 24, fontWeight: 'bold' }}>{idInModifica ? "Modifica Ricetta" : "Nuova Ricetta"}</Text>
            <TouchableOpacity onPress={() => setModalNuovaRicetta(false)}><Ionicons name="close" size={32} color="#1C1C1E" /></TouchableOpacity>
          </View>
          
          <ScrollView style={{ padding: 20 }}>
            
            {/* SEZIONE FOTO */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <TouchableOpacity style={styles.btnCaricaFoto} onPress={scegliImmagine}>
                <Ionicons name="camera" size={24} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: 'bold', marginLeft: 8 }}>Scegli Foto</Text>
              </TouchableOpacity>
              {nuovaImg !== '' && (
                <Image source={{ uri: nuovaImg }} style={{ width: 50, height: 50, borderRadius: 10, marginLeft: 15 }} />
              )}
            </View>
            {/* O inserimento manuale URL */}
            <TextInput style={[styles.inputForm, { fontSize: 13, height: 35 }]} placeholder="Oppure incolla URL web..." placeholderTextColor="#C7C7CC" value={nuovaImg} onChangeText={setNuovaImg} autoCapitalize="none" />

            <Text style={styles.labelForm}>Nome Piatto *</Text>
            <TextInput style={styles.inputForm} placeholder="Es. Pasta alla Norma" placeholderTextColor="#8E8E93" value={nuovoNome} onChangeText={setNuovoNome} />
            
            <Text style={styles.labelForm}>Tempo (min)</Text>
            <TextInput style={styles.inputForm} placeholder="20" placeholderTextColor="#8E8E93" keyboardType="numeric" value={nuovoTempo} onChangeText={setNuovoTempo} />

            <View style={styles.boxAttenzione}>
              <Ionicons name="alert-circle" size={24} color="#FF9500" />
              <Text style={styles.testoAttenzione}>Inserisci le quantità valide per 1 SINGOLA PERSONA. L'app le moltiplicherà in automatico per la spesa.</Text>
            </View>

            <Text style={styles.labelForm}>Ingredienti *</Text>
            {nuoviIngredienti.map((ing, idx) => (
              <View key={idx} style={styles.rigaIngredienteForm}>
                <TextInput style={[styles.inputForm, { flex: 1 }]} placeholder="Qta" placeholderTextColor="#8E8E93" keyboardType="numeric" value={ing.quantita} onChangeText={(t) => aggiornaIngrediente(idx, 'quantita', t)} />
                <TextInput style={[styles.inputForm, { flex: 1, marginHorizontal: 5 }]} placeholder="Es. g" placeholderTextColor="#8E8E93" value={ing.unitaMisura} onChangeText={(t) => aggiornaIngrediente(idx, 'unitaMisura', t)} />
                <TextInput style={[styles.inputForm, { flex: 2 }]} placeholder="Ingrediente" placeholderTextColor="#8E8E93" value={ing.nome} onChangeText={(t) => aggiornaIngrediente(idx, 'nome', t)} />
                <TouchableOpacity style={styles.btnRimuoviIng} onPress={() => rimuoviIngrediente(idx)}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
            
            <TouchableOpacity style={styles.btnAggiungiIng} onPress={aggiungiRigaIngrediente}>
              <Ionicons name="add" size={18} color="#FF5A5F" />
              <Text style={{ color: '#FF5A5F', fontWeight: 'bold', marginLeft: 5 }}>Aggiungi Ingrediente</Text>
            </TouchableOpacity>

            <Text style={styles.labelForm}>Procedimento *</Text>
            <TextInput style={[styles.inputForm, { height: 120, textAlignVertical: 'top' }]} placeholder="Scrivi i passaggi..." placeholderTextColor="#8E8E93" multiline value={nuovoProcedimento} onChangeText={setNuovoProcedimento} />
            
            <TouchableOpacity style={styles.btnSalvaRicetta} onPress={salvaRicetta} disabled={salvataggioInCorso}>
              {salvataggioInCorso ? <ActivityIndicator color="#FFF" /> : <Text style={styles.testoBtnSalvaRicetta}>{idInModifica ? "Aggiorna Ricetta" : "Salva nel Ricettario"}</Text>}
            </TouchableOpacity>
            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centroPagina: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFF' },
  titolo: { fontSize: 28, fontWeight: 'bold', color: '#1C1C1E' },
  barraRicerca: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E5EA', margin: 16, marginTop: 0, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  filtriContainer: { paddingHorizontal: 16, marginBottom: 12 },
  pillolaFiltro: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E5E5EA', borderRadius: 20, marginRight: 10 },
  pillolaAttiva: { backgroundColor: '#1C1C1E' },
  testoFiltro: { fontWeight: '600', color: '#8E8E93' },
  testoFiltroAttivo: { color: '#FFF' },
  cardLista: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  imgLista: { width: 60, height: 60, borderRadius: 10, marginRight: 16 },
  infoLista: { flex: 1 },
  nomeLista: { fontSize: 16, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 6 },
  statsLista: { flexDirection: 'row' },
  badgeStat: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
  testoStats: { fontSize: 12, fontWeight: '500', color: '#8E8E93' },
  fab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF5A5F', justifyContent: 'center', alignItems: 'center', shadowColor: '#FF5A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 5 },
  
  imgModale: { width: '100%', height: 250 },
  headerModaleBottoni: { position: 'absolute', top: 20, right: 15, flexDirection: 'row', zIndex: 10 },
  btnModaleAzione: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  titoloModale: { fontSize: 26, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 },
  badgeTempo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  testoBadgeModale: { fontSize: 14, fontWeight: 'bold', color: '#FF5A5F' },
  sezioneTitolo: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 },
  testoDettaglio: { fontSize: 16, color: '#3A3A3C', marginBottom: 6 },

  labelForm: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 6, marginTop: 10 },
  inputForm: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 16, marginBottom: 10 },
  btnCaricaFoto: { flexDirection: 'row', backgroundColor: '#1C1C1E', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  boxAttenzione: { flexDirection: 'row', backgroundColor: '#FFF4E5', padding: 12, borderRadius: 10, marginVertical: 10, alignItems: 'center' },
  testoAttenzione: { flex: 1, fontSize: 13, color: '#FF9500', fontWeight: '600', marginLeft: 10 },
  rigaIngredienteForm: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  btnRimuoviIng: { padding: 8, marginLeft: 5, backgroundColor: '#FFEBEB', borderRadius: 8 },
  btnAggiungiIng: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#FFF0F0', borderRadius: 10, alignSelf: 'flex-start', marginVertical: 5 },
  btnSalvaRicetta: { backgroundColor: '#1C1C1E', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  testoBtnSalvaRicetta: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});
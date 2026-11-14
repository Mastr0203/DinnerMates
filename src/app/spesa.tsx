import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

type ElementoSpesa = {
  id: number;
  nome: string;
  quantita: string;
  reparto: string;
  spuntato: boolean;
};

export default function Spesa() {
  const [lista, setLista] = useState<ElementoSpesa[]>([]);
  const [nuovoElemento, setNuovoElemento] = useState('');
  const [inCaricamento, setInCaricamento] = useState(true);
  const [repartiEspansi, setRepartiEspansi] = useState<Record<string, boolean>>({});

  // --- MOTORE ANIMAZIONE ARCADE ---
  const floatAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Effetto levitazione (su e giù)
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -20, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) })
      ])
    ).start();

    // 2. Rotazione 3D (stile moneta arcade)
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 3000, useNativeDriver: true, easing: Easing.linear })
    ).start();
  }, []);

  const spin3D = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // ---------------------------------

  useEffect(() => {
    scaricaSpesa();
  }, []);

  const scaricaSpesa = async () => {
    try {
      const { data, error } = await supabase.from('lista_spesa').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (data) setLista(data);
    } catch (error) {
      console.error("Errore download spesa:", error);
    } finally {
      setInCaricamento(false);
    }
  };

  // --- IL MOTORE DI GENERAZIONE AUTOMATICA ---
  const generaListaDaCalendario = async () => {
    Alert.alert(
      "Genera Lista della Settimana",
      "Vuoi calcolare la nuova spesa in base al menu? Gli articoli correnti (non extra) verranno azzerati.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Genera", style: "destructive", onPress: eseguiCalcoloSpesa }
      ]
    );
  };

  const eseguiCalcoloSpesa = async () => {
    setInCaricamento(true);
    try {
      // 1. Recupera il numero di commensali
      const { data: impData } = await supabase.from('impostazioni').select('numero_commensali').eq('id', 1).single();
      const commensali = impData?.numero_commensali || 3;

      // 2. Prendi i piatti attualmente nel calendario
      const { data: calData } = await supabase.from('calendario').select('ricetta_id');
      const recipeIds = calData?.map(c => c.ricetta_id).filter(id => id) || [];

      if (recipeIds.length === 0) {
        Alert.alert("Calendario vuoto", "Non ci sono piatti nel menu di questa settimana!");
        setInCaricamento(false);
        return;
      }

      // 3. Estrai gli ingredienti per queste ricette
      const { data: ingData } = await supabase
        .from('ricette_ingredienti')
        .select('quantita, unita_misura, ingredienti(nome, reparto)')
        .in('ricetta_id', recipeIds);

      // 4. Aggrega e Moltiplica
      const mappaIngredienti = new Map();
      
      ingData?.forEach(row => {
        const nomeIngrediente = row.ingredienti?.nome || 'Ignoto';
        const reparto = row.ingredienti?.reparto || 'Dispensa';
        const quantitaBase = parseFloat(row.quantita) || 0;
        const unitaMisura = row.unita_misura !== 'nan' ? row.unita_misura : '';
        
        // Chiave unica per unire stesso ingrediente con stessa unità (es. Pomodori_g)
        const chiave = `${nomeIngrediente}_${unitaMisura}`;

        if (mappaIngredienti.has(chiave)) {
          mappaIngredienti.get(chiave).qtaTotale += quantitaBase;
        } else {
          mappaIngredienti.set(chiave, { nome: nomeIngrediente, reparto, qtaTotale: quantitaBase, unitaMisura });
        }
      });

      // Formatta per il database
      const nuoviElementi = Array.from(mappaIngredienti.values()).map(item => ({
        nome: item.nome,
        // Moltiplica la quantità totale calcolata per i commensali
        quantita: item.qtaTotale > 0 ? `${item.qtaTotale * commensali} ${item.unitaMisura}`.trim() : 'Q.b.',
        reparto: item.reparto,
        spuntato: false
      }));

      // 5. Pulisci la vecchia lista (mantenendo solo gli "Extra Aggiunti" se si vuole, ma per ora azzeriamo per pulizia)
      await supabase.from('lista_spesa').delete().neq('id', 0);
      
      // 6. Inserisci la nuova lista
      if (nuoviElementi.length > 0) {
        await supabase.from('lista_spesa').insert(nuoviElementi);
      }

      await scaricaSpesa();
    } catch (error) {
      console.error("Errore generazione lista:", error);
      Alert.alert("Errore", "Impossibile calcolare la spesa.");
    } finally {
      setInCaricamento(false);
    }
  };

  // --- LOGICHE UI E INTERAZIONI ---
  const aggiungiElemento = async () => {
    if (nuovoElemento.trim() === '') return;
    const nuovoItem = { nome: nuovoElemento.trim(), quantita: '1', reparto: '🛒 Extra Aggiunti', spuntato: false };
    setNuovoElemento('');
    
    try {
      const { data, error } = await supabase.from('lista_spesa').insert([nuovoItem]).select().single();
      if (error) throw error;
      if (data) setLista(prev => [data, ...prev]);
    } catch (error) {
      console.error("Errore extra:", error);
    }
  };

  const cambiaStatoSpunta = async (item: ElementoSpesa) => {
    const nuovoStato = !item.spuntato;
    setLista(prev => prev.map(i => i.id === item.id ? { ...i, spuntato: nuovoStato } : i));
    
    try {
      await supabase.from('lista_spesa').update({ spuntato: nuovoStato }).eq('id', item.id);
    } catch (error) {
      console.error("Errore sync spunta:", error);
    }
  };

  const toggleReparto = (reparto: string) => {
    setRepartiEspansi(prev => ({ ...prev, [reparto]: prev[reparto] === false ? true : false }));
  };

  // --- RAGGRUPPAMENTI ---
  const daComprare = lista.filter(item => !item.spuntato);
  const completati = lista.filter(item => item.spuntato);
  const repartiPresenti = Array.from(new Set(daComprare.map(item => item.reparto)));

  if (inCaricamento) return <View style={styles.centroPagina}><ActivityIndicator size="large" color="#FF5A5F" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.titolo}>La Spesa</Text>
          <TouchableOpacity onPress={generaListaDaCalendario} style={styles.btnGenera}>
            <Ionicons name="calculator" size={20} color="#FF5A5F" />
            <Text style={styles.testoBtnGenera}>Calcola</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.barraInserimento}>
        <TextInput
          style={styles.inputExtra}
          placeholder="Aggiungi extra (es. Scottex)..."
          value={nuovoElemento}
          onChangeText={setNuovoElemento}
          onSubmitEditing={aggiungiElemento}
        />
        <TouchableOpacity style={styles.bottoneAggiungi} onPress={aggiungiElemento}>
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {repartiPresenti.length > 0 ? (
          repartiPresenti.map(reparto => {
            const isEspanso = repartiEspansi[reparto] !== false; // Default: aperto
            const items = daComprare.filter(item => item.reparto === reparto);
            
            return (
              <View key={reparto} style={styles.bloccoReparto}>
                <TouchableOpacity style={styles.headerReparto} onPress={() => toggleReparto(reparto)} activeOpacity={0.7}>
                  <Text style={styles.titoloReparto}>{reparto.toUpperCase()} ({items.length})</Text>
                  <Ionicons name={isEspanso ? "chevron-up" : "chevron-down"} size={20} color="#8E8E93" />
                </TouchableOpacity>
                
                {isEspanso && items.map(item => (
                  <TouchableOpacity key={item.id} style={styles.rigaElemento} onPress={() => cambiaStatoSpunta(item)} activeOpacity={0.7}>
                    <View style={styles.checkboxVuoto} />
                    <View style={styles.testoElementoContainer}>
                      <Text style={styles.nomeElemento}>{item.nome}</Text>
                      <Text style={styles.quantitaElemento}>{item.quantita}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })
        ) : (
          <View style={[styles.statoVuoto, { marginTop: 120 }]}>
            {/* L'oggetto 3D che gira e fluttua */}
            <Animated.View style={{ transform: [{ translateY: floatAnim }, { rotateY: spin3D }] }}>
              <Text style={{ fontSize: 80 }}>📓</Text>
            </Animated.View>
            
            <Text style={[styles.testoVuoto, { marginTop: 40, fontSize: 24, fontStyle: 'italic', color: '#FF5A5F', fontWeight: 'bold' }]}>
              Riempimi ;)*
            </Text>
          </View>
        )}

        {/* LISTA COMPLETATI */}
        {completati.length > 0 && (
          <View style={[styles.bloccoReparto, { marginTop: 20, opacity: 0.7 }]}>
            <Text style={styles.titoloReparto}>COMPLETATI ({completati.length})</Text>
            {completati.map(item => (
              <TouchableOpacity key={item.id} style={styles.rigaElemento} onPress={() => cambiaStatoSpunta(item)} activeOpacity={0.7}>
                <View style={styles.checkboxPieno}><Ionicons name="checkmark" size={18} color="#FFF" /></View>
                <View style={styles.testoElementoContainer}>
                  <Text style={[styles.nomeElemento, styles.testoBarrato]}>{item.nome}</Text>
                  <Text style={[styles.quantitaElemento, styles.testoBarrato]}>{item.quantita}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  centroPagina: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F2F7' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFF' },
  titolo: { fontSize: 32, fontWeight: 'bold', color: '#1C1C1E' },
  btnGenera: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  testoBtnGenera: { color: '#FF5A5F', fontWeight: 'bold', fontSize: 16, marginLeft: 6 },
  barraInserimento: { flexDirection: 'row', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', paddingBottom: 20 },
  inputExtra: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, height: 50, marginRight: 12 },
  bottoneAggiungi: { width: 50, height: 50, backgroundColor: '#1C1C1E', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1, padding: 16 },
  bloccoReparto: { marginBottom: 20, backgroundColor: '#FFF', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  headerReparto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  titoloReparto: { fontSize: 14, fontWeight: 'bold', color: '#8E8E93', letterSpacing: 1 },
  rigaElemento: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  checkboxVuoto: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#C7C7CC', marginRight: 16 },
  checkboxPieno: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  testoElementoContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nomeElemento: { fontSize: 18, fontWeight: '600', color: '#1C1C1E', flex: 1, paddingRight: 10 },
  quantitaElemento: { fontSize: 16, color: '#FF5A5F', fontWeight: 'bold' },
  testoBarrato: { textDecorationLine: 'line-through', color: '#8E8E93' },
  statoVuoto: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  testoVuoto: { fontSize: 20, color: '#1C1C1E', marginTop: 20, fontWeight: '600', textAlign: 'center' },
  sottotitoloVuoto: { fontSize: 16, color: '#8E8E93', textAlign: 'center', marginTop: 10, lineHeight: 22 }
});
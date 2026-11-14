import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF5A5F',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E5EA', height: 85, paddingBottom: 25 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Calendario', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} /> }} />
      <Tabs.Screen name="vota" options={{ title: 'Vota', tabBarIcon: ({ color }) => <Ionicons name="flame" size={24} color={color} /> }} />
      <Tabs.Screen name="spesa" options={{ title: 'Spesa', tabBarIcon: ({ color }) => <Ionicons name="cart" size={24} color={color} /> }} />
      <Tabs.Screen name="ricettario" options={{ title: 'Ricettario', tabBarIcon: ({ color }) => <Ionicons name="book" size={24} color={color} /> }} />
      <Tabs.Screen name="login" options={{ href: null }} />
    </Tabs>
  );
}
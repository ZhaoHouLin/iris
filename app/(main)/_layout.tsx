import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MainLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f0f1a',
          borderTopColor: '#1e1e30',
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#7c6ff7',
        tabBarInactiveTintColor: '#555570',
        tabBarLabelStyle: { fontSize: 12, marginBottom: 4 },
      }}
    >
      <Tabs.Screen
        name="gallery"
        options={{
          title: '相簿',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔒</Text>,
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          title: '匯入',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>＋</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙</Text>,
        }}
      />
    </Tabs>
  );
}

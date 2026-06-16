import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../constants/colors';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 6 }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={{ fontSize: 10, marginTop: 2, color: focused ? C.primary : C.textWeak, fontWeight: focused ? '700' : '400' }}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 60 + insets.bottom,
          borderTopWidth: 0.5,
          borderTopColor: C.border,
          paddingBottom: insets.bottom,
          backgroundColor: C.white,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: C.primary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Início" focused={focused} /> }}
      />
      <Tabs.Screen
        name="monitoramento"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🐛" label="Monitor." focused={focused} /> }}
      />
      <Tabs.Screen
        name="plantio"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🌱" label="Plantio" focused={focused} /> }}
      />
      <Tabs.Screen
        name="pulverizacao"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💧" label="Pulverização" focused={focused} /> }}
      />
      <Tabs.Screen
        name="colheita"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🌾" label="Colheita" focused={focused} /> }}
      />
    </Tabs>
  );
}

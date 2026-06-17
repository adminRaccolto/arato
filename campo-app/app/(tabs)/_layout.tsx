import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; label: string; icon: IoniconsName; iconOn: IoniconsName }[] = [
  { name: 'index',        label: 'Início',  icon: 'home-outline',    iconOn: 'home'    },
  { name: 'monitoramento',label: 'Monitor.',icon: 'leaf-outline',    iconOn: 'leaf'    },
  { name: 'plantio',      label: 'Plantio', icon: 'layers-outline',  iconOn: 'layers'  },
  { name: 'pulverizacao', label: 'Pulv.',   icon: 'water-outline',   iconOn: 'water'   },
  { name: 'colheita',     label: 'Colheita',icon: 'basket-outline',  iconOn: 'basket'  },
  { name: 'mapa',         label: 'Mapa',    icon: 'map-outline',     iconOn: 'map'     },
];

// Telas acessíveis mas não exibidas na barra de tabs
const HIDDEN = ['pluviometria', 'abastecimento'];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          backgroundColor: C.surface,
          borderTopWidth: 0.5,
          borderTopColor: C.border,
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textWeak,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '500', marginTop: 2 },
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? tab.iconOn : tab.icon} size={21} color={color} />
            ),
          }}
        />
      ))}
      {HIDDEN.map(name => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

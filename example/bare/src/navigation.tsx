import React from 'react';
import {NavigationContainer, type LinkingOptions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {enableScreens} from 'react-native-screens';
import {HomeScreen} from './screens/HomeScreen';
import {PromoScreen} from './screens/PromoScreen';
import type {RootStackParamList} from './types/navigation';
import {createAmplyLinkingOptions} from './utils/amplyDeepLinkRouter';

enableScreens(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  ...createAmplyLinkingOptions<RootStackParamList>({
    promoRouteName: 'Promo',
    additionalPrefixes: ['amply://'],
  }),
  config: {
    screens: {
      Home: '',
      Promo: 'promo/:id?',
    },
  },
};

export function NavigationRoot(): React.JSX.Element {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{title: 'Amply Bare Example'}}
        />
        <Stack.Screen
          name="Promo"
          component={PromoScreen}
          options={({route}) => ({
            title: route.params?.id ? `Promo ${route.params.id}` : 'Promo',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

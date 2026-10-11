import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AuthProvider, useAuth} from './store/authStore';
import {AuthScreen} from './screens/AuthScreen';
import {HomeScreen} from './screens/HomeScreen';
import {LaunchScreen} from './screens/LaunchScreen';
import {StreamScreen} from './screens/StreamScreen';
import {SplashScreen} from './screens/SplashScreen';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Home: undefined;
  Launch: undefined;
  Stream: {instanceId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const {status} = useAuth();
  const isDark = useColorScheme() === 'dark';

  if (status === 'loading') {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {status === 'unauthenticated' ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Launch" component={LaunchScreen} />
            <Stack.Screen
              name="Stream"
              component={StreamScreen}
              options={{orientation: 'all'}}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

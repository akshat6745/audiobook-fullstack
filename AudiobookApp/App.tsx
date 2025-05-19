import './src/utils/polyfills';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from './src/types';

// Import screens
import NovelsScreen from './src/screens/NovelsScreen';
import ChaptersScreen from './src/screens/ChaptersScreen';
import ChapterContentScreen from './src/screens/ChapterContentScreen';
import AudioPlayerScreen from './src/screens/AudioPlayerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator 
        initialRouteName="Novels"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007bff',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Novels" 
          component={NovelsScreen} 
          options={{ title: 'Audiobook Library' }}
        />
        <Stack.Screen 
          name="Chapters" 
          component={ChaptersScreen} 
        />
        <Stack.Screen 
          name="ChapterContent" 
          component={ChapterContentScreen} 
        />
        <Stack.Screen 
          name="AudioPlayer" 
          component={AudioPlayerScreen} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 
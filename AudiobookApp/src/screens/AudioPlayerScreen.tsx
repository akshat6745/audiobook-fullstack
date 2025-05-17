import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Audio } from 'expo-av';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchAudio } from '../services/api';
import { RootStackParamList } from '../types';
import { Ionicons } from '@expo/vector-icons';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';

type AudioPlayerScreenRouteProp = RouteProp<RootStackParamList, 'AudioPlayer'>;
type AudioPlayerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AudioPlayer'>;

const AudioPlayerScreen = () => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const route = useRoute<AudioPlayerScreenRouteProp>();
  const navigation = useNavigation<AudioPlayerScreenNavigationProp>();
  const { text, title } = route.params;

  const loadAudio = async () => {
    try {
      setLoading(true);
      
      // Create a new Sound object
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `http://localhost:8000/tts` },
        { shouldPlay: false },
        undefined,
        true
      );
      
      setSound(newSound);
      
      // Make the API call
      const response = await fetchAudio(text);
      
      // Create a blob URL from the response
      const url = URL.createObjectURL(response);
      
      // Load the sound from the blob URL
      await newSound.loadAsync(
        { uri: url },
        { shouldPlay: false }
      );
      
      setError(null);
    } catch (err) {
      setError('Failed to load audio. Please try again.');
      console.error('Error loading audio:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: title,
    });

    // Load the audio when the component mounts
    loadAudio();

    // Cleanup function to unload the sound when the component unmounts
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [navigation, title]);

  const handlePlayPause = async () => {
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
      setIsPlaying(!isPlaying);
    } catch (err) {
      console.error('Error playing/pausing audio:', err);
      setError('Failed to play audio. Please try again.');
    }
  };

  const handleRestart = async () => {
    if (!sound) return;

    try {
      await sound.stopAsync();
      await sound.playFromPositionAsync(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Error restarting audio:', err);
      setError('Failed to restart audio. Please try again.');
    }
  };

  if (loading) {
    return <Loading message="Loading audio..." />;
  }

  if (error) {
    return (
      <ErrorDisplay 
        message={error} 
        onRetry={loadAudio} 
        retryText="Try Again"
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.paragraphText}>{text}</Text>
      </View>
      
      <View style={styles.playerContainer}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleRestart}
        >
          <Ionicons name="refresh" size={30} color="#333" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.controlButton, styles.playButton]}
          onPress={handlePlayPause}
        >
          <Ionicons 
            name={isPlaying ? "pause" : "play"} 
            size={40} 
            color="#fff" 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  paragraphText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#333',
  },
  playerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    padding: 16,
  },
  controlButton: {
    padding: 15,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    marginHorizontal: 10,
  },
  playButton: {
    backgroundColor: '#007bff',
    width: 80,
    height: 80,
  },
});

export default AudioPlayerScreen; 
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchAudio } from '../services/api';
import { RootStackParamList } from '../types';
import { Ionicons } from '@expo/vector-icons';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';
import { DEFAULT_VOICE } from '../utils/config';

type AudioPlayerScreenRouteProp = RouteProp<RootStackParamList, 'AudioPlayer'>;
type AudioPlayerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AudioPlayer'>;

// Voice options
const VOICE_OPTIONS = [
  { label: 'Christopher (Male, US)', value: 'en-US-ChristopherNeural' },
  { label: 'Jenny (Female, US)', value: 'en-US-JennyNeural' },
  { label: 'Sonia (Female, UK)', value: 'en-GB-SoniaNeural' },
  { label: 'Ryan (Male, UK)', value: 'en-GB-RyanNeural' },
  { label: 'Andrew (Male, US, Multilingual)', value: 'en-US-AndrewMultilingualNeural' },
  { label: 'Emma (Female, US, Multilingual)', value: 'en-US-EmmaMultilingualNeural' }
];

// Playback speed options
const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

const AudioPlayerScreen = () => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [nextSound, setNextSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showSpeedDropdown, setShowSpeedDropdown] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const route = useRoute<AudioPlayerScreenRouteProp>();
  const navigation = useNavigation<AudioPlayerScreenNavigationProp>();
  const { text, title, paragraphs = [], paragraphIndex = 0 } = route.params;
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(paragraphIndex);
  
  // Flag to track if we're in the middle of transitioning between paragraphs
  const transitioningRef = useRef(false);

  const loadAudio = async (forCurrent = true) => {
    try {
      if (forCurrent) {
        setLoading(true);
      }

      // Create a new Sound object
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `http://localhost:8000/tts` },
        { shouldPlay: false },
        forCurrent ? onPlaybackStatusUpdate : undefined,
        true
      );

      // Store the sound in the appropriate state based on whether it's for current or next paragraph
      if (forCurrent) {
        setSound(newSound);
      } else {
        setNextSound(newSound);
      }

      // Determine which text to use
      const textToUse = forCurrent ? text : 
        (paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1) ? 
          paragraphs[currentParagraphIndex + 1] : null;
      
      // If there's no next paragraph text, we can return early for preloading
      if (!forCurrent && !textToUse) {
        return;
      }

      // Make the API call with the selected voice
      const response = await fetchAudio(textToUse || text, selectedVoice);

      // Create a blob URL from the response
      const url = URL.createObjectURL(response);

      // Load the sound from the blob URL
      await newSound.loadAsync(
        { uri: url },
        { shouldPlay: false }
      );

      // Set the playback speed
      await newSound.setRateAsync(playbackSpeed, true);

      if (forCurrent) {
        setError(null);
      }
    } catch (err) {
      if (forCurrent) {
        setError('Failed to load audio. Please try again.');
        console.error('Error loading audio:', err);
      } else {
        console.error('Error preloading next audio:', err);
      }
    } finally {
      if (forCurrent) {
        setLoading(false);
      }
    }
  };

  // Function to preload the next paragraph's audio
  const preloadNextParagraph = async () => {
    if (paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1) {
      await loadAudio(false);
    }
  };

  // Add a function to handle playback status updates
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      // Update isPlaying state based on status
      setIsPlaying(status.isPlaying);
      
      // If the audio has finished playing and there are more paragraphs, move to the next one
      if (status.didJustFinish && paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1 && !transitioningRef.current) {
        transitioningRef.current = true;
        transitionToNextParagraph();
      }
    }
  };

  // Handle the transition to the next paragraph using the preloaded audio
  const transitionToNextParagraph = async () => {
    setIsTransitioning(true);
    
    const nextIndex = currentParagraphIndex + 1;
    setCurrentParagraphIndex(nextIndex);

    // Update the navigation params to reflect the new paragraph
    navigation.setParams({
      text: paragraphs[nextIndex],
      title: `Paragraph ${nextIndex + 1}`,
      paragraphs,
      paragraphIndex: nextIndex
    });

    try {
      // Stop the current sound if it's playing
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
      }

      // If we have a preloaded next sound, use it
      if (nextSound) {
        setSound(nextSound);
        setNextSound(null);
        await nextSound.playAsync();
        setIsPlaying(true);
        
        // Preload the next paragraph
        preloadNextParagraph();
      } else {
        // If we somehow don't have a preloaded sound, load the current one
        await loadAudio(true);
        if (sound) {
          await sound.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (err) {
      console.error('Error transitioning to next paragraph:', err);
      setError('Failed to transition to next paragraph. Please try again.');
    } finally {
      setIsTransitioning(false);
      transitioningRef.current = false;
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: title,
    });

    // Load the audio when the component mounts or when text/voice changes
    loadAudio(true);
    
    // Also preload the next paragraph if available
    preloadNextParagraph();

    // Cleanup function to unload sounds when the component unmounts
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      if (nextSound) {
        nextSound.unloadAsync();
      }
    };
  }, [navigation, title, text, selectedVoice]);

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

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    setShowVoiceDropdown(false);
    // Reload audio with new voice
    loadAudio(true);
    preloadNextParagraph();
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedDropdown(false);

    // Apply new playback speed if sound is loaded
    if (sound) {
      try {
        await sound.setRateAsync(speed, true);
      } catch (err) {
        console.error('Error changing playback speed:', err);
        setError('Failed to change playback speed. Please try again.');
      }
    }
    
    // Also update speed for next sound if it's preloaded
    if (nextSound) {
      try {
        await nextSound.setRateAsync(speed, true);
      } catch (err) {
        console.error('Error changing next audio playback speed:', err);
      }
    }
  };

  const handleNextParagraph = async () => {
    // Check if there are more paragraphs
    if (paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1) {
      transitioningRef.current = true;
      await transitionToNextParagraph();
    }
  };

  if (loading && !isTransitioning) {
    return <Loading message="Loading audio..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={() => {
          loadAudio(true);
          preloadNextParagraph();
        }}
        retryText="Try Again"
      />
    );
  }

  // Render dropdown options in a modal
  const renderDropdownModal = (
    visible: boolean, 
    options: any[], 
    onSelect: (value: any) => void, 
    onClose: () => void,
    title: string
  ) => {
    return (
      <Modal
        transparent={true}
        visible={visible}
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{title}</Text>
              <ScrollView style={styles.modalScrollView}>
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.modalItem}
                    onPress={() => onSelect(option.value)}
                  >
                    <Text style={[
                      styles.modalItemText,
                      (title === 'Select Voice' && selectedVoice === option.value) || 
                      (title === 'Select Speed' && playbackSpeed === option.value) 
                        ? styles.selectedItemText : {}
                    ]}>
                      {option.label}
                    </Text>
                    {((title === 'Select Voice' && selectedVoice === option.value) || 
                      (title === 'Select Speed' && playbackSpeed === option.value)) && 
                      <Ionicons name="checkmark" size={18} color="#007bff" />
                    }
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.paragraphText}>{text}</Text>
      </View>

      <View style={styles.controlsContainer}>
        {/* Voice and Speed Controls */}
        <View style={styles.settingsContainer}>
          {/* Voice Dropdown */}
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setShowVoiceDropdown(true);
              setShowSpeedDropdown(false);
            }}
          >
            <Ionicons name="person" size={18} color="#007bff" style={styles.buttonIcon} />
            <Text style={styles.dropdownButtonText}>
              {VOICE_OPTIONS.find(v => v.value === selectedVoice)?.label.split(' ')[0]}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#007bff" />
          </TouchableOpacity>

          {/* Speed Dropdown */}
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setShowSpeedDropdown(true);
              setShowVoiceDropdown(false);
            }}
          >
            <Ionicons name="speedometer" size={18} color="#007bff" style={styles.buttonIcon} />
            <Text style={styles.dropdownButtonText}>
              {SPEED_OPTIONS.find(s => s.value === playbackSpeed)?.label}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#007bff" />
          </TouchableOpacity>
        </View>

        {/* Playback Controls */}
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

          <TouchableOpacity
            style={[styles.controlButton, paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1 ? {} : styles.disabledButton]}
            onPress={handleNextParagraph}
            disabled={!(paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1)}
          >
            <Ionicons name="arrow-forward" size={30} color={paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1 ? "#333" : "#999"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Voice Selection Modal */}
      {renderDropdownModal(
        showVoiceDropdown,
        VOICE_OPTIONS,
        handleVoiceChange,
        () => setShowVoiceDropdown(false),
        "Select Voice"
      )}

      {/* Speed Selection Modal */}
      {renderDropdownModal(
        showSpeedDropdown,
        SPEED_OPTIONS,
        handleSpeedChange,
        () => setShowSpeedDropdown(false),
        "Select Speed"
      )}
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
  controlsContainer: {
    marginTop: 20,
  },
  settingsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dropdownButton: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
    marginHorizontal: 5,
  },
  buttonIcon: {
    marginRight: 8,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  modalScrollView: {
    maxHeight: 250,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333',
  },
  selectedItemText: {
    color: '#007bff',
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: 'bold',
  },
  playerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
  disabledButton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.7,
  },
});

export default AudioPlayerScreen;
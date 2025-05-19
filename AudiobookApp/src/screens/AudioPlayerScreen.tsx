import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchAudio, getTtsStreamUrl } from '../services/api';
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
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '1.75x', value: 1.75 },
  { label: '2x', value: 2 },
];

type ParagraphAudioType = {
  text: string;
  index: number;
  audio?: Audio.Sound;
  voiceId?: string; // Track which voice this audio was generated with
};

// Cache to store audio data by text and voice
type AudioCacheType = {
  [key: string]: Audio.Sound;
};

const AudioPlayerScreen = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showSpeedDropdown, setShowSpeedDropdown] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Create a ref for the audio cache
  const audioCacheRef = useRef<AudioCacheType>({});
  
  const route = useRoute<AudioPlayerScreenRouteProp>();
  const navigation = useNavigation<AudioPlayerScreenNavigationProp>();
  const { text, title, paragraphs = [], paragraphIndex = 0 } = route.params;
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(paragraphIndex);

  const [paragraphAudios, setParagraphAudios] = useState<ParagraphAudioType[]>(
    paragraphs.map((paragraph, index) => ({ text: paragraph, index, audio: undefined }))
  );
  
  // Flag to track if we're in the middle of transitioning between paragraphs
  const transitioningRef = useRef(false);

  // Helper to generate a cache key based on text and voice
  const getCacheKey = (text: string, voice: string) => `${voice}:${text}`;
  
  // Add a helper to validate sounds before seeking operations
  const validateSoundBeforeSeeking = async (sound: Audio.Sound, operation: string): Promise<boolean> => {
    try {
      const status = await sound.getStatusAsync();
      return status.isLoaded;
    } catch (err: any) {
      console.warn(`Sound validation error before ${operation}:`, err);
      return false;
    }
  };

  const loadAudioParagraph = async (index: number) => {
    if(index >= paragraphs.length || !paragraphs[index]) return;
    // if(paragraphAudios[index]?.audio) return;
    
    const paragraph = paragraphs[index];
    const cacheKey = getCacheKey(paragraph, selectedVoice);
    
    // Check if this audio is already in our cache
    if(audioCacheRef.current[cacheKey]) {
      console.log(`Using cached audio for paragraph ${index} with voice ${selectedVoice}`);
      
      const cachedSound = audioCacheRef.current[cacheKey];
      
      // Reset the sound position
      try {
        // Validate sound before seeking
        if (await validateSoundBeforeSeeking(cachedSound, 'setPositionAsync')) {
          await cachedSound.setPositionAsync(0);
          await cachedSound.setRateAsync(playbackSpeed, true);
          
          if (index === currentParagraphIndex) {
            cachedSound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
          }
          
          // Update the paragraphAudios state with the cached sound
          setParagraphAudios(prev => {
            const updated = [...prev];
            updated[index] = { 
              ...updated[index], 
              audio: cachedSound,
              voiceId: selectedVoice
            };
            return updated;
          });
          
          if (index === currentParagraphIndex) {
            setLoading(false);
          }
          
          return cachedSound;
        } else {
          // If sound validation fails, delete from cache and reload
          console.warn(`Cached sound for paragraph ${index} failed validation, will reload`);
          delete audioCacheRef.current[cacheKey];
        }
      } catch (err: any) {
        console.error(`Error reusing cached audio for paragraph ${index}:`, err);
        // Check specifically for seeking errors
        if (err.code === 'E_AV_SEEKING') {
          console.log('Handling E_AV_SEEKING error by removing from cache');
        }
        // If there's an error with the cached sound, delete it from cache and continue to load fresh
        delete audioCacheRef.current[cacheKey];
      }
    }
    
    // If not in cache or there was an error with cached sound, load it from API
    try {
      const url = getTtsStreamUrl(paragraph, selectedVoice);
      
      console.log(`Loading audio for paragraph ${index} from: ${url}`);
      
      const { sound } = await Audio.Sound.createAsync(
        { 
          uri: url,
          headers: {
            'Accept': 'audio/mp3',
          }
        },
        { shouldPlay: false },
        index === currentParagraphIndex ? onPlaybackStatusUpdate : undefined
      );
      
      await sound.setRateAsync(playbackSpeed, true);
      
      // Store in cache
      audioCacheRef.current[cacheKey] = sound;
      
      // Update the paragraphAudios state
      setParagraphAudios(prev => {
        const updated = [...prev];
        updated[index] = { 
          ...updated[index], 
          audio: sound, 
          voiceId: selectedVoice 
        };
        return updated;
      });
      
      if (index === currentParagraphIndex) {
        setLoading(false);
      }
      
      return sound;
    } catch (err) {
      console.error(`Error loading audio for paragraph ${index}:`, err);
      if (index === currentParagraphIndex) {
        setError('Failed to load audio. Please try again.');
        setLoading(false);
      }
      throw err;
    }
  };

  const loadAudio = async (forCurrent = true) => {
    const index = forCurrent ? currentParagraphIndex : currentParagraphIndex + 1;
    
    if (index >= paragraphs.length) return;
    
    if (forCurrent) {
      setLoading(true);
    }
    
    await loadAudioParagraph(index);
  };

  // Function to preload the next paragraph's audio
  const preloadNextParagraph = async () => {
    if (paragraphs.length > 0 && currentParagraphIndex < paragraphs.length - 1) {
      try {
        await loadAudioParagraph(currentParagraphIndex + 1);
      } catch (err) {
        console.warn(`Error preloading next paragraph: ${err}`);
        // Don't throw the error - just log it as a warning since preloading failures are not critical
      }
    }
  };

  // Add a function to handle playback status updates
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      // Update isPlaying state based on status
      setIsPlaying(status.isPlaying);
      
      // If the audio has finished playing and there are more paragraphs, move to the next one
      if (status.didJustFinish && paragraphs.length > 0 && 
          currentParagraphIndex < paragraphs.length - 1 && 
          !transitioningRef.current && !isTransitioning) {
        transitioningRef.current = true;
        // Use setTimeout to avoid state update conflicts
        setTimeout(() => {
          transitionToNextParagraph()
            .catch(err => console.error('Error in automatic transition:', err));
        }, 100);
      }
    }
  };

  // Handle the transition to the next paragraph using the preloaded audio
  const transitionToNextParagraph = async () => {
    if (isTransitioning) return; // Prevent multiple transitions
    
    setIsTransitioning(true);
    setError(null); // Clear any previous errors
    
    const nextIndex = currentParagraphIndex + 1;
    
    try {
      // Stop the current sound if it's playing
      const currentAudio = paragraphAudios[currentParagraphIndex]?.audio;
      if (currentAudio) {
        try {
          await currentAudio.stopAsync();
          // Don't unload, just stop since we're caching
        } catch (err: any) {
          console.warn(`Error stopping current audio: ${err}`);
          // Continue with transition even if there's an error with stopping
        }
      }

      // Update state before trying to play audio
      setCurrentParagraphIndex(nextIndex);

      // Update the navigation params to reflect the new paragraph
      navigation.setParams({
        text: paragraphs[nextIndex],
        title: `Paragraph ${nextIndex + 1}`,
        paragraphs,
        paragraphIndex: nextIndex
      });

      // If we have the next audio loaded, play it
      let nextAudio = paragraphAudios[nextIndex]?.audio;
      
      // If next audio is not loaded, load it now
      if (!nextAudio || paragraphAudios[nextIndex]?.voiceId !== selectedVoice) {
        console.log(`Next audio not preloaded or voice changed, loading paragraph ${nextIndex} now`);
        await loadAudioParagraph(nextIndex);
        
        // Get reference to the newly loaded audio
        const updatedParagraphAudios = paragraphAudios.map(item => item);
        nextAudio = updatedParagraphAudios[nextIndex]?.audio;
      }
      
      if (nextAudio) {
        try {
          // Validate sound before playing
          if (await validateSoundBeforeSeeking(nextAudio, 'playback')) {
            // Set up the playback status handler for the new audio
            nextAudio.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
            
            // Play the audio
            await nextAudio.playAsync();
            setIsPlaying(true);
          } else {
            console.warn(`Next audio for paragraph ${nextIndex} is not valid, reloading`);
            await loadAudioParagraph(nextIndex);
            // Try playing again with the newly loaded audio
            const reloadedAudio = paragraphAudios[nextIndex]?.audio;
            if (reloadedAudio) {
              reloadedAudio.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
              await reloadedAudio.playAsync();
              setIsPlaying(true);
            } else {
              throw new Error('Failed to load valid audio after retry');
            }
          }
        } catch (playErr: any) {
          console.error('Error playing next audio:', playErr);
          if (playErr.code === 'E_AV_SEEKING') {
            setError('Audio seeking error. Please try again.');
          } else {
            throw new Error('Failed to play next paragraph audio');
          }
        }
        
        // Preload the next paragraph in the background
        setTimeout(() => {
          if (nextIndex < paragraphs.length - 1) {
            loadAudioParagraph(nextIndex + 1)
              .catch(err => console.warn(`Failed to preload future paragraph: ${err}`));
          }
        }, 500);
      } else {
        throw new Error('Failed to load next paragraph audio');
      }
    } catch (err: any) {
      console.error('Error transitioning to next paragraph:', err);
      if (err.code === 'E_AV_SEEKING') {
        setError('Failed to transition to next paragraph. Audio seeking error.');
      } else {
        setError('Failed to transition to next paragraph. Please try again.');
      }
    } finally {
      setIsTransitioning(false);
      transitioningRef.current = false;
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: title,
    });

    // Initial loading of paragraphs
    const loadInitialParagraphs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Load current paragraph
        await loadAudioParagraph(currentParagraphIndex);
        
        // Preload next paragraph
        for (let i = currentParagraphIndex + 1; i < paragraphs.length; i++) {
          setTimeout(() => {
            loadAudioParagraph(currentParagraphIndex + 1)
              .catch(err => console.warn(`Failed to preload next paragraph: ${err}`));
          }, 500);
        }
        // if (currentParagraphIndex < paragraphs.length - 1) {
        //   setTimeout(() => {
        //     loadAudioParagraph(currentParagraphIndex + 1)
        //       .catch(err => console.warn(`Failed to preload next paragraph: ${err}`));
        //   }, 500);
        // }
      } catch (err) {
        console.error('Error loading initial paragraphs:', err);
        setError('Failed to load audio. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialParagraphs();

    // Cleanup function to unload sounds when the component unmounts
    return () => {
      // Clear audio cache on unmount
      Object.values(audioCacheRef.current).forEach(sound => {
        try {
          sound.unloadAsync();
        } catch (err) {
          console.warn(`Error unloading cached audio:`, err);
        }
      });
      audioCacheRef.current = {};
    };
  }, [navigation, title]);

  // Update audio references when voice changes
  useEffect(() => {
    // Update paragraph audio references when voice changes
    const updateAudioForVoiceChange = async () => {
      if (paragraphAudios.length > 0) {
        // Check if we need to update the current audio
        const currentAudio = paragraphAudios[currentParagraphIndex];
        if (currentAudio && currentAudio.voiceId !== selectedVoice) {
          // Voice changed, need to load with new voice
          setLoading(true);
          setError(null);
          
          try {
            await loadAudioParagraph(currentParagraphIndex);
            
            // Preload next paragraph with new voice
            if (currentParagraphIndex < paragraphs.length - 1) {
              setTimeout(() => {
                loadAudioParagraph(currentParagraphIndex + 1)
                  .catch(err => console.warn(`Failed to preload next paragraph with new voice: ${err}`));
              }, 500);
            }
          } catch (err) {
            console.error('Error updating audio for voice change:', err);
            setError('Failed to load audio with new voice. Please try again.');
          } finally {
            setLoading(false);
          }
        }
      }
    };
    
    updateAudioForVoiceChange();
  }, [selectedVoice]);

  const handlePlayPause = async () => {
    const currentAudio = paragraphAudios[currentParagraphIndex]?.audio;
    if (!currentAudio) {
      // If audio not loaded, try loading it
      await loadAudioParagraph(currentParagraphIndex);
      return;
    }

    try {
      // Validate sound before action
      if (await validateSoundBeforeSeeking(currentAudio, 'play/pause')) {
        if (isPlaying) {
          await currentAudio.pauseAsync();
        } else {
          await currentAudio.playAsync();
        }
        setIsPlaying(!isPlaying);
      } else {
        console.warn('Current audio is invalid, will reload');
        // Reload the audio
        await loadAudioParagraph(currentParagraphIndex);
      }
    } catch (err: any) {
      console.error('Error playing/pausing audio:', err);
      if (err.code === 'E_AV_SEEKING') {
        setError('Audio seeking error. Please try again.');
        // Try to reload the audio
        const cacheKey = getCacheKey(paragraphs[currentParagraphIndex], selectedVoice);
        delete audioCacheRef.current[cacheKey];
        await loadAudioParagraph(currentParagraphIndex);
      } else {
        setError('Failed to play audio. Please try again.');
      }
    }
  };

  const handleRestart = async () => {
    const currentAudio = paragraphAudios[currentParagraphIndex]?.audio;
    if (!currentAudio) {
      // If audio not loaded, try loading it
      await loadAudioParagraph(currentParagraphIndex);
      return;
    }

    try {
      // Validate sound before seeking
      if (await validateSoundBeforeSeeking(currentAudio, 'restart')) {
        await currentAudio.stopAsync();
        await currentAudio.playFromPositionAsync(0);
        setIsPlaying(true);
      } else {
        console.warn('Current audio is invalid, will reload');
        // Reload the audio
        await loadAudioParagraph(currentParagraphIndex);
      }
    } catch (err: any) {
      console.error('Error restarting audio:', err);
      if (err.code === 'E_AV_SEEKING') {
        setError('Audio seeking error. Please try again.');
        // Try to reload the audio
        const cacheKey = getCacheKey(paragraphs[currentParagraphIndex], selectedVoice);
        delete audioCacheRef.current[cacheKey];
        await loadAudioParagraph(currentParagraphIndex);
      } else {
        setError('Failed to restart audio. Please try again.');
      }
    }
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    setShowVoiceDropdown(false);
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedDropdown(false);

    // Apply new playback speed to all loaded audio
    paragraphAudios.forEach(async (item) => {
      if (item.audio) {
        try {
          if (await validateSoundBeforeSeeking(item.audio, 'setRate')) {
            await item.audio.setRateAsync(speed, true);
          }
        } catch (err: any) {
          console.error(`Error changing playback speed for paragraph ${item.index}:`, err);
          // If there's a seeking error, remove it from cache
          if (err.code === 'E_AV_SEEKING' && item.index !== undefined) {
            const cacheKey = getCacheKey(paragraphs[item.index], selectedVoice);
            delete audioCacheRef.current[cacheKey];
          }
        }
      }
    });
  };

  const handleNextParagraph = async () => {
    // Check if there are more paragraphs and we're not already transitioning
    if (paragraphs.length > 0 && 
        currentParagraphIndex < paragraphs.length - 1 && 
        !isTransitioning && 
        !transitioningRef.current) {
      
      transitioningRef.current = true;
      setError(null); // Clear any previous errors
      await transitionToNextParagraph();
    }
  };

  const isCurrentAudioLoading = !paragraphAudios[currentParagraphIndex]?.audio || 
                               paragraphAudios[currentParagraphIndex]?.voiceId !== selectedVoice;

  if ((loading || isCurrentAudioLoading) && !isTransitioning) {
    return <Loading message="Loading audio..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={() => {
          loadAudioParagraph(currentParagraphIndex);
          if (currentParagraphIndex < paragraphs.length - 1) {
            loadAudioParagraph(currentParagraphIndex + 1);
          }
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
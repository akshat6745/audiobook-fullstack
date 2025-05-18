import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { getTtsStreamUrl } from '../services/api';
import { DEFAULT_VOICE } from '../utils/config';

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

type AudioCacheType = {
  [key: string]: Audio.Sound;
};

interface LoadingTracker {
  [key: string]: boolean;
}

type FloatingAudioPlayerProps = {
  paragraphs: string[];
  initialParagraphIndex: number;
  setActiveParagraphIndex: (index: number) => void;
  onParagraphComplete: (index: number) => void;
  onChapterComplete?: () => void; // Callback when all paragraphs in chapter are finished
  isVisible: boolean;
  onClose: () => void;
};

const FloatingAudioPlayer = ({
  paragraphs,
  initialParagraphIndex,
  setActiveParagraphIndex,
  onParagraphComplete,
  onChapterComplete,
  isVisible,
  onClose
}: FloatingAudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showSpeedDropdown, setShowSpeedDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLastParagraph, setIsLastParagraph] = useState(false);
  
  // Animation for the player
  const slideAnim = useRef(new Animated.Value(100)).current;
  
  // Audio references
  const currentSound = useRef<Audio.Sound | null>(null);
  const audioCacheRef = useRef<AudioCacheType>({});
  const isTransitioning = useRef(false);
  const loadingTrackerRef = useRef<LoadingTracker>({});

  // Track the last update time to prevent duplicate calls
  const lastUpdateRef = useRef(0);

  // Helper to generate a cache key based on text and voice
  const getCacheKey = (text: string, voice: string, speed?: number) => {
    // Use a consistent approach - trim text to avoid whitespace differences
    const trimmedText = text.trim();
    // Include speed in cache key if provided
    const speedSuffix = speed ? `:${speed}` : '';
    return `${voice}:${trimmedText}${speedSuffix}`;
  };

  // Add a debug helper function near the top of the component
  const logCacheStatus = (message: string) => {
    const cacheKeys = Object.keys(audioCacheRef.current);
    const loadingKeys = Object.keys(loadingTrackerRef.current).filter(k => loadingTrackerRef.current[k]);
    console.log(`=== CACHE STATUS [${message}] ===`);
    console.log(`Current paragraph: ${initialParagraphIndex}`);
    console.log(`Cache has ${cacheKeys.length} items`);
    console.log(`Loading tracker has ${loadingKeys.length} active items`);
    
    // Log cache keys in a more readable format
    if (cacheKeys.length > 0) {
      console.log('Cached items:');
      cacheKeys.forEach(key => {
        // Extract paragraph number if possible
        const keyParts = key.split(':');
        console.log(`- ${key.substring(0, 40)}...`);
      });
    }
  };

  // Add a helper to check if a sound is valid
  const isValidSound = async (sound: Audio.Sound): Promise<boolean> => {
    try {
      // Try to get the status to verify the sound is still loaded
      const status = await sound.getStatusAsync();
      return status.isLoaded;
    } catch (err) {
      console.warn('Error checking sound validity:', err);
      return false;
    }
  };

  // Update the loadAudioForText function
  const loadAudioForText = async (text: string, index: number, retryCount = 0): Promise<boolean> => {
    if (!text || text.trim().length === 0) {
      console.warn(`Cannot load audio for empty text at index ${index}`);
      setError('Cannot play empty text');
      return false;
    }
    
    try {
      // Unload current sound if exists
      if (currentSound.current) {
        // Remove the playback status update handler first
        currentSound.current.setOnPlaybackStatusUpdate(null);
        await currentSound.current.unloadAsync();
        currentSound.current = null;
      }
      
      setLoading(true);
      setError(null); // Clear any previous errors
      
      const cacheKey = getCacheKey(text, selectedVoice);
      console.log(`loadAudioForText: Looking for cached audio at index ${index}, key: ${cacheKey.substring(0, 30)}...`);
      
      // Check if audio is in cache
      if (audioCacheRef.current[cacheKey]) {
        try {
          console.log(`CACHE HIT: Testing cached audio for paragraph ${index}`);
          const sound = audioCacheRef.current[cacheKey];
          
          // Verify the sound is still valid
          if (await isValidSound(sound)) {
            console.log(`Cached audio for paragraph ${index} is valid, using it`);
            currentSound.current = sound;
            
            // Reset position and set playback status update
            await currentSound.current.setPositionAsync(0);
            await currentSound.current.setRateAsync(playbackSpeed, true);
            // Set the playback status update handler
            currentSound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
            return true;
          } else {
            console.warn(`Cached audio for paragraph ${index} is invalid, will reload`);
            delete audioCacheRef.current[cacheKey];
          }
        } catch (err) {
          console.warn(`Error reusing cached audio, will reload from API:`, err);
          // If there's an error with cached audio, delete it and try loading fresh
          delete audioCacheRef.current[cacheKey];
        }
      } else {
        console.log(`CACHE MISS: No cached audio found for paragraph ${index}`);
      }
      
      // Check if we're already loading this audio to prevent duplicate API calls
      const inProgressKey = `loading:${cacheKey}`;
      if (loadingTrackerRef.current[inProgressKey]) {
        console.log(`Audio ${cacheKey} is already being loaded, waiting...`);
        
        // Wait for the existing load to complete
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (!loadingTrackerRef.current[inProgressKey]) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);
        });
        
        // If the audio is now in cache, use it
        if (audioCacheRef.current[cacheKey]) {
          console.log(`Using newly cached audio for ${cacheKey}`);
          currentSound.current = audioCacheRef.current[cacheKey];
          await currentSound.current.setPositionAsync(0);
          await currentSound.current.setRateAsync(playbackSpeed, true);
          currentSound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
          return true;
        }
      }
      
      // Mark this audio as loading to prevent duplicate calls
      loadingTrackerRef.current[inProgressKey] = true;
      
      try {
        // Load from API with timeout
        const url = getTtsStreamUrl(text, selectedVoice);
        console.log(`API CALL: Fetching audio from URL: ${url}`);
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Audio loading timeout')), 10000);
        });
        
        const loadPromise = Audio.Sound.createAsync(
          { 
            uri: url,
            headers: {
              'Accept': 'audio/mp3',
              'Cache-Control': 'no-cache' 
            }
          },
          { shouldPlay: false }
        );
        
        // Race between loading and timeout
        const { sound } = await Promise.race([
          loadPromise,
          timeoutPromise
        ]) as { sound: Audio.Sound };
        
        await sound.setRateAsync(playbackSpeed, true);
        
        // Set the playback status update handler
        sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
        
        // Cache the sound
        audioCacheRef.current[cacheKey] = sound;
        currentSound.current = sound;
        
        console.log(`Successfully loaded and cached audio for paragraph ${index}`);
        logCacheStatus('After loading audio');
        
        setError(null);
        return true;
      } finally {
        // Clear the loading flag
        loadingTrackerRef.current[inProgressKey] = false;
      }
    } catch (err) {
      console.error(`Error loading audio for text at index ${index}:`, err);
      
      // Try to retry loading a few times before giving up
      if (retryCount < 2) {
        console.log(`Retrying audio load (attempt ${retryCount + 1}/3)...`);
        // Short delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        return loadAudioForText(text, index, retryCount + 1);
      }
      
      setError('Failed to play next paragraph');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      // Slide up animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
      
      // Load initial audio
      loadAudio();
    } else {
      // Slide down animation
      Animated.spring(slideAnim, {
        toValue: 100,
        useNativeDriver: true,
      }).start();
      
      // Pause and unload audio when hidden
      if (currentSound.current) {
        try {
          currentSound.current.pauseAsync().catch(err => 
            console.warn('Error pausing sound on hide:', err)
          );
          setIsPlaying(false);
        } catch (err) {
          console.warn('Error in component hide cleanup:', err);
        }
      }
    }

    return () => {
      // Cleanup all audio when component unmounts
      cleanupAudio();
    };
  }, [isVisible]);

  // Update when initialParagraphIndex changes from parent
  useEffect(() => {
    // Only proceed if the index is valid
    if (initialParagraphIndex >= 0 && initialParagraphIndex < paragraphs.length) {
      console.log(`initialParagraphIndex changed to ${initialParagraphIndex}`);
      logCacheStatus('Before paragraph index change');
      
      // Check if this is the last paragraph in the chapter
      setIsLastParagraph(initialParagraphIndex === paragraphs.length - 1);
      
      // Reset error state when paragraph changes
      setError(null);
      
      // Stop current audio
      if (currentSound.current) {
        currentSound.current.pauseAsync().catch(err => 
          console.warn('Error pausing sound during paragraph change:', err)
        );
      }
      
      // Handle auto-play when transitioning to index 0 (new chapter)
      const isNewChapter = initialParagraphIndex === 0;
      
      // Don't immediately load audio if not visible
      if (isVisible) {
        // Use setTimeout to avoid state update collisions
        setTimeout(() => {
          const paragraphText = paragraphs[initialParagraphIndex];
          
          if (paragraphText && paragraphText.trim().length > 0) {
            console.log(`Loading audio after index change to ${initialParagraphIndex}: "${paragraphText.substring(0, 30)}..."`);
            
            // Check if we have this paragraph in cache
            const cacheKey = getCacheKey(paragraphText, selectedVoice);
            console.log(`Looking for cache key: ${cacheKey.substring(0, 30)}...`);
            
            if (audioCacheRef.current[cacheKey]) {
              console.log(`CACHE HIT: Using cached audio for paragraph ${initialParagraphIndex}`);
              
              try {
                // Get from cache and prepare it
                currentSound.current = audioCacheRef.current[cacheKey];
                
                // Reset position and update handlers
                currentSound.current.setPositionAsync(0)
                  .then(() => currentSound.current?.setRateAsync(playbackSpeed, true))
                  .then(() => {
                    // Set the playback status update handler
                    if (currentSound.current) {
                      currentSound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
                      
                      // Auto-play if we were already playing or if this is a new chapter
                      if ((isPlaying || isNewChapter) && currentSound.current) {
                        console.log(`Auto-playing paragraph ${initialParagraphIndex} after index change`);
                        currentSound.current.playAsync()
                          .then(() => {
                            // Ensure isPlaying state is updated
                            setIsPlaying(true);
                          })
                          .catch(err => 
                            console.warn('Error auto-playing after paragraph change:', err)
                          );
                      }
                      
                      // Preload next paragraphs
                      setTimeout(() => {
                        preloadNextParagraph();
                      }, 300);
                    }
                  })
                  .catch(err => {
                    console.warn('Error setting up cached audio:', err);
                    // If there's an error with cached audio, fall back to fresh load
                    delete audioCacheRef.current[cacheKey];
                    loadAudioForText(paragraphText, initialParagraphIndex).then(() => {
                      // Auto-play the new paragraph if we were already playing or if this is a new chapter
                      if ((isPlaying || isNewChapter) && currentSound.current) {
                        console.log(`Auto-playing paragraph ${initialParagraphIndex} after fresh load`);
                        currentSound.current.playAsync()
                          .then(() => {
                            setIsPlaying(true);
                          })
                          .catch(err => 
                            console.warn('Error auto-playing after paragraph change:', err)
                          );
                      }
                    });
                  });
              } catch (err) {
                console.warn('Error using cached audio:', err);
                loadAudioForText(paragraphText, initialParagraphIndex).then(() => {
                  // Auto-play the new paragraph if we were already playing or if this is a new chapter
                  if ((isPlaying || isNewChapter) && currentSound.current) {
                    console.log(`Auto-playing paragraph ${initialParagraphIndex} after error recovery`);
                    currentSound.current.playAsync()
                      .then(() => {
                        setIsPlaying(true);
                      })
                      .catch(err => 
                        console.warn('Error auto-playing after paragraph change:', err)
                      );
                  }
                });
              }
            } else {
              console.log(`CACHE MISS: Loading audio for paragraph ${initialParagraphIndex} from API`);
              loadAudioForText(paragraphText, initialParagraphIndex).then(() => {
                // Auto-play the new paragraph if we were already playing or if this is a new chapter
                if ((isPlaying || isNewChapter) && currentSound.current) {
                  console.log(`Auto-playing paragraph ${initialParagraphIndex} after API load`);
                  currentSound.current.playAsync()
                    .then(() => {
                      setIsPlaying(true);
                    })
                    .catch(err => 
                      console.warn('Error auto-playing after paragraph change:', err)
                    );
                }
              });
            }
          } else {
            console.warn(`Cannot load audio for paragraph ${initialParagraphIndex}: invalid or empty text`);
            setError('Cannot play this paragraph: empty or invalid text');
          }
        }, 100);
      }
    }
  }, [initialParagraphIndex, isVisible, paragraphs]);

  const cleanupAudio = async () => {
    // Set flags first to prevent callbacks from firing during cleanup
    isTransitioning.current = true;
    setIsPlaying(false);
    
    try {
      console.log('Cleaning up audio resources');
      // First, stop any currently playing audio
      if (currentSound.current) {
        try {
          // Remove the callback first to prevent unexpected behavior
          currentSound.current.setOnPlaybackStatusUpdate(null);
          await currentSound.current.stopAsync().catch(() => {});
          await currentSound.current.unloadAsync().catch(() => {});
        } catch (err) {
          console.warn('Error unloading current sound:', err);
        }
        currentSound.current = null;
      }
      
      // Clear loading trackers
      loadingTrackerRef.current = {};
      
      // Clean up cache one by one to prevent overwhelming the audio system
      const cacheKeys = Object.keys(audioCacheRef.current);
      console.log(`Unloading ${cacheKeys.length} cached sounds`);
      
      for (const key of cacheKeys) {
        try {
          const sound = audioCacheRef.current[key];
          if (sound) {
            // Try to unload this sound
            await sound.unloadAsync().catch(() => {});
            delete audioCacheRef.current[key];
          }
        } catch (err) {
          console.warn(`Error unloading cached audio ${key}:`, err);
        }
      }
      
      audioCacheRef.current = {};
    } catch (err) {
      console.error('Error in audio cleanup:', err);
    } finally {
      // Reset transition flag
      isTransitioning.current = false;
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    // Skip if status update is not relevant or too frequent
    if (!status || !status.isLoaded) return;
    
    // Prevent multiple rapid status updates from causing multiple transitions
    const now = Date.now();
    if (now - lastUpdateRef.current < 300) return; // Throttle updates
    
    if (status.didJustFinish && !status.isLooping) {
      lastUpdateRef.current = now;
      console.log("Audio finished, moving to next paragraph");
      
      // Check if we can move to next paragraph
      const nextIndex = initialParagraphIndex + 1;
      if (nextIndex < paragraphs.length && !isTransitioning.current) {
        // If we have more paragraphs, move to the next
        handleNextParagraph();
      } else if (nextIndex >= paragraphs.length) {
        // If we're at the end of all paragraphs, trigger chapter complete
        console.log("Reached end of all paragraphs, chapter complete");
        setIsPlaying(false);
        if (onChapterComplete) {
          onChapterComplete();
        }
        setIsLastParagraph(true);
      }
    }
  };

  const loadAudio = async () => {
    if (isTransitioning.current) return;
    
    try {
      setLoading(true);
      
      if (initialParagraphIndex >= paragraphs.length || initialParagraphIndex < 0) {
        console.warn(`Invalid paragraph index: ${initialParagraphIndex}`);
        setLoading(false);
        setError('Invalid paragraph index');
        return;
      }
      
      const currentText = paragraphs[initialParagraphIndex];
      
      if (!currentText || currentText.trim().length === 0) {
        console.warn(`Empty text for paragraph ${initialParagraphIndex}`);
        setLoading(false);
        setError('Cannot play: empty paragraph text');
        return;
      }
      
      console.log(`loadAudio called for paragraph ${initialParagraphIndex}: "${currentText.substring(0, 30)}..."`);
      
      const success = await loadAudioForText(currentText, initialParagraphIndex);
      
      // Auto-play if this is the first paragraph (likely a new chapter)
      if (success && currentSound.current && initialParagraphIndex === 0) {
        console.log(`Auto-playing first paragraph of chapter`);
        await currentSound.current.playAsync();
        setIsPlaying(true);
      }
      
      // Preload next paragraphs if available
      if (initialParagraphIndex < paragraphs.length - 1) {
        // Use setTimeout to not block the main audio loading
        setTimeout(() => {
          preloadNextParagraph();
        }, 500);
      }
    } catch (err) {
      console.error('Error in loadAudio:', err);
      setError('Failed to load audio');
    } finally {
      setLoading(false);
    }
  };

  const preloadNextParagraph = async () => {
    try {
      logCacheStatus('Before preload');
      console.log(`Starting preload from paragraph ${initialParagraphIndex}`);
      
      // Preload the next 4 paragraphs instead of just the next one
      const maxPreloadCount = 4;
      
      for (let i = 1; i <= maxPreloadCount; i++) {
        const nextIndex = initialParagraphIndex + i;
        if (nextIndex >= paragraphs.length) break;
        
        const nextText = paragraphs[nextIndex];
        if (!nextText || nextText.trim().length === 0) continue;
        
        const cacheKey = getCacheKey(nextText, selectedVoice);
        
        // Only preload if not already in cache and not already loading
        const inProgressKey = `loading:${cacheKey}`;
        if (!audioCacheRef.current[cacheKey] && !loadingTrackerRef.current[inProgressKey]) {
          console.log(`Preloading audio for paragraph ${nextIndex} (${i}/${maxPreloadCount}) with key ${cacheKey.substring(0, 30)}...`);
          
          // Mark as loading to prevent duplicate requests
          loadingTrackerRef.current[inProgressKey] = true;
          
          try {
            // Use a different approach for preloading to avoid conflicts with main audio
            const url = getTtsStreamUrl(nextText, selectedVoice);
            
            // Use a timeout to limit how long we wait for preloading
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Preload timeout')), 5000);
            });
            
            const loadPromise = Audio.Sound.createAsync(
              { 
                uri: url,
                headers: {
                  'Accept': 'audio/mp3',
                  'Cache-Control': 'no-cache'
                }
              },
              { shouldPlay: false }
            );
            
            // Race the promises
            const { sound } = await Promise.race([
              loadPromise,
              timeoutPromise
            ]) as { sound: Audio.Sound };
            
            // Set the right playback rate
            await sound.setRateAsync(playbackSpeed, true);
            
            // Store in cache only if successful
            audioCacheRef.current[cacheKey] = sound;
            console.log(`Successfully preloaded audio for paragraph ${nextIndex} with key ${cacheKey.substring(0, 30)}...`);
          } catch (err) {
            // Just log the error for preloading, no need to show to user
            console.warn(`Error preloading paragraph ${nextIndex}:`, err);
          } finally {
            // Always clear the loading flag
            loadingTrackerRef.current[inProgressKey] = false;
          }
        } else {
          console.log(`Paragraph ${nextIndex} already cached or loading, skipping preload (cache: ${!!audioCacheRef.current[cacheKey]}, loading: ${!!loadingTrackerRef.current[inProgressKey]})`);
        }
      }
      
      logCacheStatus('After preload');
    } catch (err) {
      console.warn('Error during preload:', err);
      // Errors during preload are not critical, so just log them
    }
  };

  const handlePlayPause = async () => {
    if (!currentSound.current) {
      await loadAudio();
      if (!currentSound.current) return;
    }
    
    try {
      if (isPlaying) {
        await currentSound.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await currentSound.current.playAsync();
        setIsPlaying(true);
        
        // When starting playback, ensure next paragraphs are preloaded
        setTimeout(() => {
          preloadNextParagraph();
        }, 300);
      }
    } catch (err) {
      console.error('Error playing/pausing audio:', err);
      setError('Failed to play audio');
    }
  };

  const handleRestart = async () => {
    if (!currentSound.current) {
      await loadAudio();
      if (!currentSound.current) return;
    }
    
    try {
      await currentSound.current.stopAsync();
      await currentSound.current.playFromPositionAsync(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Error restarting audio:', err);
      setError('Failed to restart audio');
    }
  };

  const handleRetry = async () => {
    if (initialParagraphIndex >= 0 && initialParagraphIndex < paragraphs.length) {
      const text = paragraphs[initialParagraphIndex];
      console.log(`Manually retrying audio load for paragraph ${initialParagraphIndex}`);
      
      const success = await loadAudioForText(text, initialParagraphIndex);
      if (success && currentSound.current && isPlaying) {
        await currentSound.current.playAsync();
      }
    }
  };

  const handleNextParagraph = async () => {
    if (isTransitioning.current) {
      console.log("Already transitioning, ignoring duplicate call");
      return;
    }
    
    const nextIndex = initialParagraphIndex + 1;
    if (nextIndex >= paragraphs.length) {
      setIsPlaying(false);
      return;
    }
    
    // Check if the next paragraph has valid text
    const nextText = paragraphs[nextIndex];
    if (!nextText || nextText.trim().length === 0) {
      console.warn(`Cannot transition to paragraph ${nextIndex}: empty or invalid text`);
      setError('Cannot play next paragraph: empty text');
      return;
    }
    
    isTransitioning.current = true;
    console.log(`Transitioning from paragraph ${initialParagraphIndex} to ${nextIndex}`);
    logCacheStatus('Before transition');
    
    try {
      // Stop current audio first
      if (currentSound.current) {
        await currentSound.current.stopAsync();
        // Remove the playback status update handler to prevent recursion
        currentSound.current.setOnPlaybackStatusUpdate(null);
      }
      
      // First update the parent's index by calling the setter directly
      setActiveParagraphIndex(nextIndex);
      
      // Then notify parent about completion
      onParagraphComplete(nextIndex);
      
      // Check if we already have this audio in cache
      const cacheKey = getCacheKey(nextText, selectedVoice);
      console.log(`Looking for cache key: ${cacheKey.substring(0, 30)}...`);
      const inProgressKey = `loading:${cacheKey}`;
      
      // Set loading state to give visual feedback
      setLoading(true);
      setError(null);
      
      // Show immediate feedback for the transition
      const wasPlaying = isPlaying;
      
      // If audio is already in the cache, use it directly without loading
      if (audioCacheRef.current[cacheKey]) {
        console.log(`CACHE HIT: Testing cached audio for paragraph ${nextIndex}`);
        
        try {
          const sound = audioCacheRef.current[cacheKey];
          
          // Verify the sound is still valid
          if (await isValidSound(sound)) {
            console.log(`Cached audio for paragraph ${nextIndex} is valid, using it`);
            
            // Get from cache and prepare it
            currentSound.current = sound;
            
            // Reset position and update handlers
            await currentSound.current.setPositionAsync(0);
            await currentSound.current.setRateAsync(playbackSpeed, true);
            currentSound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
            
            // Play it if we were playing before
            if (wasPlaying) {
              await currentSound.current.playAsync();
            }
            
            setLoading(false);
            
            // Try to preload next paragraphs 
            setTimeout(() => {
              preloadNextParagraph();
            }, 300);
            
            return;
          } else {
            console.warn(`Cached audio for paragraph ${nextIndex} is invalid, will reload`);
            delete audioCacheRef.current[cacheKey];
          }
        } catch (err) {
          console.warn(`Error using cached audio for paragraph ${nextIndex}:`, err);
          // If there's an error with cached audio, we'll fall back to loading from API
          delete audioCacheRef.current[cacheKey];
        }
      } else {
        console.log(`CACHE MISS: No cached audio found for paragraph ${nextIndex}`);
      }
      
      // If audio is currently being loaded, wait for it instead of making a new request
      if (loadingTrackerRef.current[inProgressKey]) {
        console.log(`Audio for paragraph ${nextIndex} is already loading, waiting for it...`);
        
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!loadingTrackerRef.current[inProgressKey]) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          
          // Set a timeout to prevent indefinite waiting
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
        
        // Check if it's now available in cache
        if (audioCacheRef.current[cacheKey]) {
          console.log(`Using newly loaded audio for paragraph ${nextIndex}`);
          currentSound.current = audioCacheRef.current[cacheKey];
          await currentSound.current.setPositionAsync(0);
          await currentSound.current.setRateAsync(playbackSpeed, true);
          currentSound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
          
          if (wasPlaying) {
            await currentSound.current.playAsync();
          }
          
          setLoading(false);
          return;
        }
      }
      
      // If we reach here, we need to load the audio from the API
      console.log(`API CALL: Loading audio for paragraph ${nextIndex} from API`);
      const success = await loadAudioForText(nextText, nextIndex);
      
      // Play it if we were playing before and loading was successful
      if (success && wasPlaying && currentSound.current) {
        try {
          await currentSound.current.playAsync();
        } catch (err) {
          console.error('Error playing next paragraph:', err);
          setError('Error playing audio');
        }
      }
      
      logCacheStatus('After transition');
    } catch (err) {
      console.error('Error transitioning to next paragraph:', err);
      setError('Failed to play next paragraph');
    } finally {
      setLoading(false);
      setTimeout(() => {
        isTransitioning.current = false;
      }, 500); // Add a small delay before allowing another transition
    }
  };

  const handleVoiceChange = async (voice: string) => {
    if (voice === selectedVoice) {
      setShowVoiceDropdown(false);
      return;
    }

    setSelectedVoice(voice);
    setShowVoiceDropdown(false);
    
    // Clear the audio cache since voice changed
    try {
      // Unload all cached audio with previous voice
      for (const key of Object.keys(audioCacheRef.current)) {
        if (key.startsWith(selectedVoice)) {
          try {
            const sound = audioCacheRef.current[key];
            await sound.unloadAsync().catch(() => {});
            delete audioCacheRef.current[key];
          } catch (err) {
            console.warn(`Error unloading cached audio ${key}:`, err);
          }
        }
      }
      
      console.log('Cache cleared due to voice change');
    } catch (err) {
      console.warn('Error clearing cache for voice change:', err);
    }
    
    // Reload audio with new voice
    await loadAudio();
  };

  const handleSpeedChange = async (speed: number) => {
    if (speed === playbackSpeed) {
      setShowSpeedDropdown(false);
      return;
    }
    
    setPlaybackSpeed(speed);
    setShowSpeedDropdown(false);
    
    // Apply new speed to current sound
    if (currentSound.current) {
      try {
        await currentSound.current.setRateAsync(speed, true);
      } catch (err) {
        console.error('Error changing playback speed:', err);
      }
    }
    
    // No need to clear cache, we'll just update speed when playing
  };

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
            <Text style={styles.modalTitle}>{title}</Text>
            <View style={styles.optionsContainer}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionItem,
                    option.value === (title.includes('Voice') ? selectedVoice : playbackSpeed) && 
                    styles.selectedOption
                  ]}
                  onPress={() => onSelect(option.value)}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    );
  };

  if (!isVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
      </View>

      {isLastParagraph && (
        <View style={styles.chapterStatusContainer}>
          <Text style={styles.lastParagraphText}>
            Last paragraph in this chapter
          </Text>
        </View>
      )}

      <View style={styles.controlsContainer}>
        {/* Voice and Speed Settings */}
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
            <Ionicons name="refresh" size={24} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.playButton]}
            onPress={handlePlayPause}
            disabled={loading}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={32}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton, 
              initialParagraphIndex < paragraphs.length - 1 ? {} : styles.disabledButton
            ]}
            onPress={handleNextParagraph}
            disabled={!(initialParagraphIndex < paragraphs.length - 1) || loading}
          >
            <Ionicons 
              name="arrow-forward" 
              size={24} 
              color={initialParagraphIndex < paragraphs.length - 1 ? "#333" : "#999"} 
            />
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

      {loading && (
        <View style={styles.loadingIndicator}>
          <Text>Loading audio...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    padding: 5,
  },
  controlsContainer: {
    marginTop: 10,
  },
  settingsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 5,
  },
  buttonIcon: {
    marginRight: 5,
  },
  dropdownButtonText: {
    color: '#007bff',
    marginRight: 4,
  },
  playerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButton: {
    padding: 12,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    marginHorizontal: 10,
  },
  playButton: {
    backgroundColor: '#007bff',
    width: 65,
    height: 65,
  },
  disabledButton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  optionsContainer: {
    marginBottom: 15,
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedOption: {
    backgroundColor: '#e6f2ff',
    borderColor: '#007bff',
    borderWidth: 1,
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  closeButton: {
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
  loadingIndicator: {
    padding: 10,
    alignItems: 'center',
  },
  errorContainer: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#ffebee',
    borderRadius: 8,
    margin: 10,
  },
  errorText: {
    color: '#d32f2f',
    marginBottom: 5,
  },
  retryButton: {
    padding: 6,
    backgroundColor: '#d32f2f',
    borderRadius: 4,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  chapterStatusContainer: {
    paddingVertical: 5,
    marginBottom: 8,
    alignItems: 'center',
  },
  lastParagraphText: {
    color: '#ff8800',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default FloatingAudioPlayer; 
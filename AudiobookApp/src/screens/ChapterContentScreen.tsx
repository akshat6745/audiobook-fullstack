import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchChapterContent, fetchChapters, logTtsMetrics } from '../services/api';
import { RootStackParamList, Chapter } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';
import FloatingAudioPlayer from '../components/FloatingAudioPlayer';
import ApiMonitor from '../components/ApiMonitor';
import { DEFAULT_VOICE } from '../utils/config';
import { Ionicons } from '@expo/vector-icons';

type ChapterContentScreenRouteProp = RouteProp<RootStackParamList, 'ChapterContent'>;
type ChapterContentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChapterContent'>;

// Interface for audio settings that should persist between chapters
interface AudioSettings {
  voice: string;
  playbackSpeed: number;
}

const ChapterContentScreen = () => {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0);
  const [availableChapters, setAvailableChapters] = useState<Chapter[]>([]);
  const [loadingNextChapter, setLoadingNextChapter] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    voice: DEFAULT_VOICE,
    playbackSpeed: 1
  });
  const [showApiMonitor, setShowApiMonitor] = useState(false);
  
  // Use ref to track last active paragraph index to prevent unnecessary scrolling
  const lastActiveIndexRef = useRef(-1);

  const route = useRoute<ChapterContentScreenRouteProp>();
  const navigation = useNavigation<ChapterContentScreenNavigationProp>();
  const { novelName, chapterNumber, chapterTitle } = route.params;
  const flatListRef = useRef<FlatList>(null);

  const loadChapterContent = async (novel: string = novelName, chapter: number = chapterNumber) => {
    try {
      setLoading(true);
      const content = await fetchChapterContent(novel, chapter);
      
      // Parse content properly - ensure it's an array before filtering
      let paragraphArray: string[] = [];
      if (typeof content === 'string') {
        // If content is a string, split it into paragraphs
        paragraphArray = content.split('\n\n').filter(para => para.trim().length > 0);
      } else if (Array.isArray(content)) {
        // If content is already an array, use type assertion and filter
        paragraphArray = (content as any[]).filter((para: any) => {
          // Ensure each item is a string and not empty
          return typeof para === 'string' && para.trim().length > 0;
        });
      }
      
      if (paragraphArray.length === 0) {
        setError('No readable content found in this chapter.');
      } else {
        setParagraphs(paragraphArray);
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch chapter content. Please try again.');
      console.error('Error loading chapter content:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllChapters = async () => {
    try {
      const chapters = await fetchChapters(novelName);
      
      // Type assertion to ensure the chapters match the expected type
      const typedChapters = chapters as unknown as typeof availableChapters;
      setAvailableChapters(typedChapters);
      return typedChapters;
    } catch (err) {
      console.error('Error loading all chapters:', err);
      return [] as typeof availableChapters;
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: `Chapter ${chapterNumber}`,
    });

    // Load current chapter content
    loadChapterContent(novelName, chapterNumber);
    
    // Load all available chapters for navigation
    loadAllChapters();
  }, [navigation, novelName, chapterNumber, chapterTitle]);

  // Add a custom back handler
  useEffect(() => {
    // Add a custom handler for when the user presses the back button
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Navigate back to chapters screen with the current chapter number
      if (e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        navigation.navigate('Chapters', {
          novelName,
          lastChapter: chapterNumber
        });
      }
    });

    return unsubscribe;
  }, [navigation, novelName, chapterNumber]);

  const handleParagraphPress = (index: number) => {
    console.log(`Paragraph ${index} pressed`);
    
    // Validate paragraph index
    if (index < 0 || index >= paragraphs.length) {
      console.warn(`Invalid paragraph index: ${index}`);
      return;
    }
    
    // Validate paragraph text
    const paragraphText = paragraphs[index];
    if (!paragraphText || paragraphText.trim().length === 0) {
      console.warn(`Empty paragraph at index ${index}`);
      return;
    }
    
    lastActiveIndexRef.current = index;
    setActiveParagraphIndex(index);
    setShowAudioPlayer(true);
  };

  const handleParagraphComplete = useCallback((newIndex: number) => {
    console.log(`Paragraph complete, moving to index ${newIndex}`);
    
    // Validate new index
    if (newIndex < 0 || newIndex >= paragraphs.length) {
      console.warn(`Invalid next paragraph index: ${newIndex}`);
      return;
    }
    
    // Only scroll if the index is different from our last scrolled position
    if (newIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = newIndex;
      
      // Use a small timeout to ensure the UI updates before scrolling
      setTimeout(() => {
        if (flatListRef.current && paragraphs.length > newIndex) {
          console.log(`Scrolling to paragraph ${newIndex}`);
          flatListRef.current.scrollToIndex({
            index: newIndex,
            animated: true,
            viewPosition: 0.3 // Position the item closer to the top (0 = top, 1 = bottom)
          });
        }
      }, 100);
    }
  }, [paragraphs.length]);

  const handleChapterComplete = useCallback(async () => {
    console.log('Chapter complete, checking for next chapter');
    
    // Don't proceed if we're already loading a new chapter
    if (loadingNextChapter) return;
    
    try {
      setLoadingNextChapter(true);
      
      // Get all chapters if we don't have them yet
      let chapters = availableChapters;
      if (chapters.length === 0) {
        chapters = await loadAllChapters();
      }
      
      // Find the current chapter index
      const currentChapterIndex = chapters.findIndex(c => c.chapterNumber === chapterNumber);
      
      // Check if there's a next chapter
      if (currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1) {
        const nextChapter = chapters[currentChapterIndex + 1];
        console.log(`Loading next chapter: ${nextChapter.chapterNumber} - ${nextChapter.chapterTitle}`);
        console.log(`Preserving audio settings: Voice=${audioSettings.voice}, Speed=${audioSettings.playbackSpeed}`);
        
        // Update navigation title first to give user feedback
        navigation.setOptions({
          title: `Chapter ${nextChapter.chapterNumber}`,
        });
        
        // Load the content of the next chapter
        const nextContent = await fetchChapterContent(novelName, nextChapter.chapterNumber);
        
        // Parse content properly
        let nextParagraphs: string[] = [];
        if (typeof nextContent === 'string') {
          nextParagraphs = nextContent.split('\n\n').filter(para => para.trim().length > 0);
        } else if (Array.isArray(nextContent)) {
          // Use type assertion for array filtering
          nextParagraphs = (nextContent as any[]).filter((para: any) => {
            return typeof para === 'string' && para.trim().length > 0;
          });
        }
        
        if (nextParagraphs.length === 0) {
          console.warn('Next chapter has no readable content');
          return;
        }
        
        // Update route params to match the new chapter
        // This is a workaround as we can't directly modify route.params
        // @ts-ignore (we know this exists on the navigation object)
        navigation.setParams({
          novelName,
          chapterNumber: nextChapter.chapterNumber,
          chapterTitle: nextChapter.chapterTitle,
        });
        
        // Update state with new chapter content
        setParagraphs(nextParagraphs);
        
        // Reset isPlaying state to ensure it's set to play mode
        const wasPlaying = true; // Always assume we want to continue playing
        
        // Start playing from the beginning
        lastActiveIndexRef.current = 0;
        
        // Important: Use a setTimeout to ensure the component has time to update before we trigger playback
        setTimeout(() => {
          // Set the active paragraph index which will trigger the audio to load
          setActiveParagraphIndex(0);
          
          // This ensures the audio player remains visible
          setShowAudioPlayer(true);
          
          // Scroll to top
          if (flatListRef.current) {
            flatListRef.current.scrollToOffset({ offset: 0, animated: true });
          }
        }, 100);
      } else {
        console.log('No more chapters available');
      }
    } catch (err) {
      console.error('Error loading next chapter:', err);
    } finally {
      setLoadingNextChapter(false);
    }
  }, [novelName, chapterNumber, availableChapters, navigation, loadingNextChapter, audioSettings]);

  const handleCloseAudioPlayer = () => {
    setShowAudioPlayer(false);
    setActiveParagraphIndex(-1);
    lastActiveIndexRef.current = -1;
  };

  // Handle voice change from the audio player
  const handleVoiceChange = useCallback((voice: string) => {
    setAudioSettings(prev => ({
      ...prev,
      voice
    }));
  }, []);

  // Handle speed change from the audio player
  const handleSpeedChange = useCallback((speed: number) => {
    setAudioSettings(prev => ({
      ...prev,
      playbackSpeed: speed
    }));
  }, []);

  // Add a function to show the API monitor
  const handleShowApiMonitor = () => {
    // Log metrics to console
    logTtsMetrics();
    // Show the monitor UI
    setShowApiMonitor(true);
  };

  // Add function to handle play button press
  const handlePlay = () => {
    if (paragraphs.length > 0) {
      setActiveParagraphIndex(0);
      setShowAudioPlayer(true);
    }
  };

  if (loading) {
    return <Loading message="Loading chapter content..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadChapterContent} />;
  }

  const renderParagraph = ({ item, index }: { item: string, index: number }) => {
    const isActive = index === activeParagraphIndex;
    
    return (
      <TouchableOpacity
        style={[
          styles.paragraphItem,
          isActive && styles.activeParagraphItem
        ]}
        onPress={() => handleParagraphPress(index)}
        activeOpacity={0.7}
      >
        <Text style={[
          styles.paragraphText,
          isActive && styles.activeParagraphText
        ]}>
          {item}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      {loadingNextChapter && (
        <Text style={styles.loadingNextChapter}>Loading next chapter...</Text>
      )}
      <FlatList
        ref={flatListRef}
        data={paragraphs}
        keyExtractor={(_, index) => `paragraph-${index}`}
        renderItem={renderParagraph}
        contentContainerStyle={styles.contentContainer}
        onScrollToIndexFailed={(info) => {
          console.warn('Scroll to index failed:', info);
          // Handle the error with a more robust approach
          setTimeout(() => {
            if (flatListRef.current && paragraphs.length > 0) {
              // Try to scroll to a nearby item instead
              const offset = Math.min(info.index, paragraphs.length - 1);
              flatListRef.current.scrollToIndex({
                index: Math.max(0, offset - 1),
                animated: false
              });
              
              // Then after a small delay, try the actual index
              setTimeout(() => {
                if (flatListRef.current) {
                  flatListRef.current.scrollToIndex({
                    index: Math.min(info.index, paragraphs.length - 1),
                    animated: true
                  });
                }
              }, 100);
            }
          }, 100);
        }}
        initialNumToRender={10}
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
      />
      
      <FloatingAudioPlayer
        paragraphs={paragraphs}
        initialParagraphIndex={activeParagraphIndex}
        setActiveParagraphIndex={setActiveParagraphIndex}
        onParagraphComplete={handleParagraphComplete}
        onChapterComplete={handleChapterComplete}
        isVisible={showAudioPlayer}
        onClose={handleCloseAudioPlayer}
        selectedVoice={audioSettings.voice}
        onVoiceChange={handleVoiceChange}
        playbackSpeed={audioSettings.playbackSpeed}
        onSpeedChange={handleSpeedChange}
      />

      {/* Use absolute positioning for buttons */}
      {!showAudioPlayer && (
        <TouchableOpacity 
          style={styles.floatingButton} 
          onPress={handlePlay}
        >
          <Ionicons name="play" size={24} color="#fff" />
        </TouchableOpacity>
      )}
      
      {/* Debug button */}
      <TouchableOpacity 
        style={styles.debugButton} 
        onPress={handleShowApiMonitor}
      >
        <Ionicons name="analytics-outline" size={20} color="#fff" />
        <Text style={styles.debugButtonText}>API Stats</Text>
      </TouchableOpacity>

      {/* API Monitor */}
      <ApiMonitor
        visible={showApiMonitor}
        onClose={() => setShowApiMonitor(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    paddingBottom: 100, // Add padding to ensure content is not hidden behind the audio player
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  loadingNextChapter: {
    color: '#007bff',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  paragraphItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  activeParagraphItem: {
    backgroundColor: '#e6f7e6', // Light green background for active paragraph
    borderColor: '#007bff',
    borderWidth: 1,
  },
  paragraphText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  activeParagraphText: {
    color: '#006400', // Darker green for text
    fontWeight: '500',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#007bff',
    width: 56,
    height: 56, 
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 98,
  },
  debugButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50,50,50,0.85)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    zIndex: 99,
  },
  debugButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});

export default ChapterContentScreen;
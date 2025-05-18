import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchChapterContent } from '../services/api';
import { RootStackParamList } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';
import FloatingAudioPlayer from '../components/FloatingAudioPlayer';

type ChapterContentScreenRouteProp = RouteProp<RootStackParamList, 'ChapterContent'>;
type ChapterContentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChapterContent'>;

const ChapterContentScreen = () => {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(-1);
  
  // Use ref to track last active paragraph index to prevent unnecessary scrolling
  const lastActiveIndexRef = useRef(-1);

  const route = useRoute<ChapterContentScreenRouteProp>();
  const navigation = useNavigation<ChapterContentScreenNavigationProp>();
  const { novelName, chapterNumber, chapterTitle } = route.params;
  const flatListRef = useRef<FlatList>(null);

  const loadChapterContent = async () => {
    try {
      setLoading(true);
      const content = await fetchChapterContent(novelName, chapterNumber);
      
      // Filter out empty paragraphs
      const filteredContent = content.filter((para: string) => 
        para && para.trim().length > 0
      );
      
      if (filteredContent.length === 0) {
        setError('No readable content found in this chapter.');
      } else {
        setParagraphs(filteredContent);
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch chapter content. Please try again.');
      console.error('Error loading chapter content:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: `Chapter ${chapterNumber}`,
    });

    loadChapterContent();
  }, [navigation, novelName, chapterNumber, chapterTitle]);

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

  const handleCloseAudioPlayer = () => {
    setShowAudioPlayer(false);
    setActiveParagraphIndex(-1);
    lastActiveIndexRef.current = -1;
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
        isVisible={showAudioPlayer}
        onClose={handleCloseAudioPlayer}
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
});

export default ChapterContentScreen;
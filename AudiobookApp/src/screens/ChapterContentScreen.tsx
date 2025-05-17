import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchChapterContent } from '../services/api';
import { RootStackParamList } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';

type ChapterContentScreenRouteProp = RouteProp<RootStackParamList, 'ChapterContent'>;
type ChapterContentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChapterContent'>;

const ChapterContentScreen = () => {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const route = useRoute<ChapterContentScreenRouteProp>();
  const navigation = useNavigation<ChapterContentScreenNavigationProp>();
  const { novelName, chapterNumber, chapterTitle } = route.params;

  const loadChapterContent = async () => {
    try {
      setLoading(true);
      const content = await fetchChapterContent(novelName, chapterNumber);
      setParagraphs(content);
      setError(null);
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

  const handleParagraphPress = (text: string, index: number) => {
    navigation.navigate('AudioPlayer', {
      text,
      title: `Paragraph ${index + 1}`,
      paragraphs,
      paragraphIndex: index
    });
  };

  if (loading) {
    return <Loading message="Loading chapter content..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadChapterContent} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <FlatList
        data={paragraphs}
        keyExtractor={(_, index) => `paragraph-${index}`}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.paragraphItem}
            onPress={() => handleParagraphPress(item, index)}
          >
            <Text style={styles.paragraphText}>{item}</Text>
          </TouchableOpacity>
        )}
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
  paragraphText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});

export default ChapterContentScreen;
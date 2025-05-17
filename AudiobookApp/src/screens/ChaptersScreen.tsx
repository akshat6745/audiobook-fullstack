import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchChapters } from '../services/api';
import { Chapter, RootStackParamList } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';

type ChaptersScreenRouteProp = RouteProp<RootStackParamList, 'Chapters'>;
type ChaptersScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chapters'>;

const ChaptersScreen = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const route = useRoute<ChaptersScreenRouteProp>();
  const navigation = useNavigation<ChaptersScreenNavigationProp>();
  const { novelName } = route.params;

  const loadChapters = async () => {
    try {
      setLoading(true);
      const data = await fetchChapters(novelName);
      setChapters(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch chapters. Please try again.');
      console.error('Error loading chapters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: novelName,
    });

    loadChapters();
  }, [navigation, novelName]);

  const handleChapterPress = (chapter: Chapter) => {
    navigation.navigate('ChapterContent', {
      novelName,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.chapterTitle,
    });
  };

  if (loading) {
    return <Loading message="Loading chapters..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadChapters} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{novelName} - Chapters</Text>
      <FlatList
        data={chapters}
        keyExtractor={(item) => `chapter-${item.chapterNumber}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chapterItem}
            onPress={() => handleChapterPress(item)}
          >
            <Text style={styles.chapterNumber}>Chapter {item.chapterNumber}</Text>
            <Text style={styles.chapterTitle}>{item.chapterTitle}</Text>
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
  chapterItem: {
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
  chapterNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  chapterTitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

export default ChaptersScreen; 
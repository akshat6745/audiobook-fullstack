import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchNovels } from '../services/api';
import { RootStackParamList } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';

type NovelsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Novels'>;

const NovelsScreen = () => {
  const [novels, setNovels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const navigation = useNavigation<NovelsScreenNavigationProp>();

  const loadNovels = async () => {
    try {
      setLoading(true);
      const data = await fetchNovels();
      setNovels(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch novels. Please try again.');
      console.error('Error loading novels:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNovels();
  }, []);

  const handleNovelPress = (novelName: string) => {
    navigation.navigate('Chapters', { novelName });
  };

  if (loading) {
    return <Loading message="Loading novels..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadNovels} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Novels</Text>
      <FlatList
        data={novels}
        keyExtractor={(item, index) => `novel-${index}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.novelItem}
            onPress={() => handleNovelPress(item)}
          >
            <Text style={styles.novelTitle}>{item}</Text>
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
  novelItem: {
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
  novelTitle: {
    fontSize: 18,
    color: '#333',
  },
});

export default NovelsScreen; 
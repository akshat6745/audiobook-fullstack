import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchChapters } from '../services/api';
import { Chapter, PaginatedChapters, RootStackParamList } from '../types';
import Loading from '../components/Loading';
import ErrorDisplay from '../components/ErrorDisplay';
import { Ionicons } from '@expo/vector-icons';

type ChaptersScreenRouteProp = RouteProp<RootStackParamList, 'Chapters'>;
type ChaptersScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chapters'>;

const ChaptersScreen = () => {
  const [chaptersData, setChaptersData] = useState<PaginatedChapters>({
    chapters: [],
    totalPages: 1,
    currentPage: 1
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReadChapter, setLastReadChapter] = useState<number | null>(null);
  const [latestChapter, setLatestChapter] = useState<Chapter | null>(null);
  
  const route = useRoute<ChaptersScreenRouteProp>();
  const navigation = useNavigation<ChaptersScreenNavigationProp>();
  const { novelName, lastChapter } = route.params;

  // If lastChapter is passed through navigation params, use it
  useEffect(() => {
    if (lastChapter) {
      setLastReadChapter(lastChapter);
    }
  }, [lastChapter]);

  const loadChapters = async (page: number = 1) => {
    try {
      setLoading(true);
      const data = await fetchChapters(novelName, page);
      
      // Extract the latest chapter (first chapter in the first page)
      if (page === 1 && data.chapters.length > 0) {
        // Check if the first chapter has the highest chapter number (indicating it's the newest)
        const possibleLatest = [...data.chapters].sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
        setLatestChapter(possibleLatest);
      }
      
      setChaptersData(data);
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
    // Update last read chapter
    setLastReadChapter(chapter.chapterNumber);
    
    navigation.navigate('ChapterContent', {
      novelName,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.chapterTitle,
    });
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= chaptersData.totalPages && page !== chaptersData.currentPage) {
      loadChapters(page);
    }
  };

  const renderPaginationControls = () => {
    if (chaptersData.totalPages <= 1) return null;
    
    const currentPage = chaptersData.currentPage;
    const totalPages = chaptersData.totalPages;
    
    // Generate page numbers to show (current, prev, next, first, last, and some neighbors)
    let pageNumbers: number[] = [currentPage];
    
    // Always add first and last pages
    if (currentPage > 1) pageNumbers.push(1);
    if (currentPage < totalPages) pageNumbers.push(totalPages);
    
    // Add some neighbors if we have pages between
    if (currentPage > 2) pageNumbers.push(currentPage - 1);
    if (currentPage < totalPages - 1) pageNumbers.push(currentPage + 1);
    
    // Add additional neighbors
    if (currentPage > 3) pageNumbers.push(currentPage - 2);
    if (currentPage < totalPages - 2) pageNumbers.push(currentPage + 2);
    
    // Sort and deduplicate
    pageNumbers = [...new Set(pageNumbers)].sort((a, b) => a - b);
    
    return (
      <View style={styles.paginationControlsContainer}>
        <TouchableOpacity 
          style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]} 
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <Ionicons name="chevron-back" size={18} color={currentPage === 1 ? "#ccc" : "#007bff"} />
        </TouchableOpacity>
        
        <View style={styles.pageNumbersContainer}>
          {pageNumbers.map((page, index) => {
            // Check if we need to render ellipsis
            const prevPage = pageNumbers[index - 1];
            const showLeftEllipsis = prevPage && page - prevPage > 1;
            
            return (
              <React.Fragment key={`page-${page}`}>
                {showLeftEllipsis && (
                  <Text style={styles.ellipsis}>...</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.pageNumberButton,
                    currentPage === page && styles.currentPageButton
                  ]}
                  onPress={() => goToPage(page)}
                >
                  <Text style={[
                    styles.pageNumberText,
                    currentPage === page && styles.currentPageText
                  ]}>
                    {page}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
        
        <TouchableOpacity 
          style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]} 
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <Ionicons name="chevron-forward" size={18} color={currentPage === totalPages ? "#ccc" : "#007bff"} />
        </TouchableOpacity>
      </View>
    );
  };

  // Add a utility function to parse the chapterTitle format
  const parseChapterTitle = (rawTitle: string): { title: string; publishedTime: string } => {
    try {
      // Format is typically: "91\nChapter 91 Escape\n2 years ago"
      const parts = rawTitle.split('\n');
      
      if (parts.length >= 3) {
        // First part is the chapter number, second is the actual title, third is time
        return {
          title: parts[1].trim(),
          publishedTime: parts[2].trim()
        };
      } else if (parts.length === 2) {
        // If format is different, try to extract time from the end
        return {
          title: parts[0].trim(),
          publishedTime: parts[1].trim()
        };
      } else {
        // Fallback if the format is unexpected
        return {
          title: rawTitle.trim(),
          publishedTime: '2 years ago' // Default time
        };
      }
    } catch (error) {
      console.error('Error parsing chapter title:', error);
      return {
        title: rawTitle || 'Unknown Title',
        publishedTime: '2 years ago'
      };
    }
  };

  const renderLatestChapter = () => {
    if (!latestChapter) return null;
    
    const { title, publishedTime } = parseChapterTitle(latestChapter.chapterTitle);
    
    return (
      <View style={styles.latestChapterContainer}>
        <View style={styles.latestChapterHeader}>
          <Text style={styles.latestChapterHeaderText}>Latest Chapter</Text>
          <View style={styles.newTag}>
            <Text style={styles.newTagText}>NEW</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.latestChapterCard}
          onPress={() => handleChapterPress(latestChapter)}
        >
          <View style={styles.chapterItemContent}>
            <Text style={styles.chapterMainTitle}>{title}</Text>
            <Text style={styles.chapterDetailDate}>{publishedTime}</Text>
          </View>
          <View style={styles.latestChapterAction}>
            <Ionicons name="book" size={24} color="#007bff" />
            <Text style={styles.readNowText}>Read Now</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <Loading message="Loading chapters..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={() => loadChapters(1)} />;
  }

  // Filter out the latest chapter from the regular chapter list if it's being featured
  const regularChapters = latestChapter 
    ? chaptersData.chapters.filter(c => c.chapterNumber !== latestChapter.chapterNumber)
    : chaptersData.chapters;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        <Text style={styles.title}>{novelName}</Text>
        
        {renderLatestChapter()}
        
        {lastReadChapter && (
          <TouchableOpacity 
            style={styles.resumeContainer}
            onPress={() => {
              const lastChapter = chaptersData.chapters.find(c => c.chapterNumber === lastReadChapter);
              if (lastChapter) {
                handleChapterPress(lastChapter);
              }
            }}
          >
            <Ionicons name="play-circle" size={24} color="#007bff" />
            <Text style={styles.resumeText}>
              Resume Chapter {lastReadChapter}
            </Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.chapterListContainer}>
          <View style={styles.chapterListHeader}>
            <Text style={styles.chapterListTitle}>All Chapters</Text>
            <View style={styles.chapterCountBadge}>
              <Text style={styles.chapterCountText}>
                {chaptersData.chapters.length} chapters
              </Text>
            </View>
          </View>
          
          {chaptersData.totalPages > 1 && (
            <View style={styles.paginationInfo}>
              <Text style={styles.paginationText}>
                Page {chaptersData.currentPage} of {chaptersData.totalPages}
              </Text>
            </View>
          )}
          
          {renderPaginationControls()}
          
          {regularChapters.map((item) => {
            const { title, publishedTime } = parseChapterTitle(item.chapterTitle);
            
            return (
              <TouchableOpacity
                key={`chapter-${item.chapterNumber}`}
                style={[
                  styles.chapterItem,
                  lastReadChapter === item.chapterNumber && styles.lastReadChapterItem
                ]}
                onPress={() => handleChapterPress(item)}
              >
                <View style={styles.chapterItemContent}>
                  <Text style={styles.chapterMainTitle}>{title}</Text>
                  <Text style={styles.chapterDetailDate}>{publishedTime}</Text>
                </View>
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color="#888" 
                  style={styles.chapterItemIcon} 
                />
              </TouchableOpacity>
            );
          })}
          
          {renderPaginationControls()}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  latestChapterContainer: {
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    overflow: 'hidden',
  },
  latestChapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    padding: 12,
  },
  latestChapterHeaderText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  newTag: {
    backgroundColor: '#ff3b30',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  newTagText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  latestChapterCard: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  latestChapterContent: {
    flex: 1,
  },
  chapterHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  latestChapterTitle: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  chapterDate: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  latestChapterAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  readNowText: {
    color: '#007bff',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  chapterListContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chapterListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  chapterListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  chapterCountBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  chapterCountText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  paginationInfo: {
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  paginationText: {
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  paginationControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  paginationButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#007bff',
    borderRadius: 4,
    marginHorizontal: 4,
  },
  paginationButtonDisabled: {
    borderColor: '#ccc',
  },
  pageNumbersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    flex: 1,
  },
  pageNumberButton: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  currentPageButton: {
    backgroundColor: '#007bff',
  },
  pageNumberText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  currentPageText: {
    color: 'white',
  },
  ellipsis: {
    color: '#666',
    marginHorizontal: 4,
  },
  resumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f7ff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  resumeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
    marginLeft: 8,
  },
  chapterItem: {
    backgroundColor: 'white',
    padding: 16,
    paddingVertical: 20,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chapterItemContent: {
    flex: 1,
  },
  chapterItemIcon: {
    marginLeft: 8,
  },
  lastReadChapterItem: {
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: '#c0d8ff',
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  chapterMainTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  chapterDetailNumber: {
    fontSize: 15,
    color: '#555',
  },
  chapterDetailTitle: {
    fontSize: 15,
    color: '#555',
  },
  chapterDetailDate: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
});

export default ChaptersScreen; 
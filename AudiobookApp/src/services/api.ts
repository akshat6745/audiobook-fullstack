import ky from 'ky';
import { API_URL, DEFAULT_VOICE } from '../utils/config';

// Define interface types for API responses
interface Novel {
  id: string;
  title: string;
  author: string;
  coverImage?: string;
}

interface Chapter {
  id: string;
  title: string;
  number: number;
}

interface ChapterContent {
  content: string;
}

// Add a counter to track TTS API calls
// This will be used for monitoring and debugging
export const apiMetrics = {
  ttsCallCount: 0,
  ttsCallHistory: [] as {
    timestamp: number;
    textLength: number;
    voice: string;
    paragraph: number;
    url?: string;
    success?: boolean;
    duration?: number;
  }[],
  resetCounters: () => {
    apiMetrics.ttsCallCount = 0;
    apiMetrics.ttsCallHistory = [];
  },
  getCallCount: () => apiMetrics.ttsCallCount,
  getCallHistory: () => apiMetrics.ttsCallHistory,
  getCallsSummary: () => {
    return {
      totalCalls: apiMetrics.ttsCallCount,
      callsIn5Min: apiMetrics.ttsCallHistory.filter(call => 
        (Date.now() - call.timestamp) < 5 * 60 * 1000
      ).length,
      callsIn1Hour: apiMetrics.ttsCallHistory.filter(call => 
        (Date.now() - call.timestamp) < 60 * 60 * 1000
      ).length,
      successRate: apiMetrics.ttsCallHistory.length > 0 
        ? apiMetrics.ttsCallHistory.filter(call => call.success).length / apiMetrics.ttsCallHistory.length
        : 0
    };
  }
};

// Create a ky instance with improved configuration
const api = ky.create({
  prefixUrl: API_URL,
  timeout: 10000, // 10 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
  hooks: {
    beforeRequest: [
      request => {
        console.log(`API Request: ${request.method} ${request.url}`);
      }
    ],
    afterResponse: [
      (request, options, response) => {
        if (!response.ok) {
          console.error('API Error Response:', response.status);
        }
        return response;
      }
    ],
    beforeError: [
      error => {
        console.error('API Request Error:', error.message);
        return error;
      }
    ]
  }
});

// API functions
export const fetchNovels = async () => {
  try {
    const response = await api.get('novels').json<Novel[]>();
    return response;
  } catch (error) {
    console.error('Error fetching novels:', error);
    throw error;
  }
};

export const fetchChapters = async (novelName: string) => {
  try {
    const response = await api.get(`chapters/${novelName}`).json<Chapter[]>();
    return response;
  } catch (error) {
    console.error(`Error fetching chapters for ${novelName}:`, error);
    throw error;
  }
};

export const fetchChapterContent = async (novelName: string, chapterNumber: number) => {
  try {
    const response = await api.get('chapter', {
      searchParams: {
        novelName,
        chapterNumber,
      }
    }).json<{content: string}>();
    return response.content;
  } catch (error) {
    console.error(`Error fetching chapter content:`, error);
    throw error;
  }
};

export const getAudioUrl = (text: string, voice: string = DEFAULT_VOICE) => {
  return `${API_URL}/tts`;
};

export const fetchAudio = async (text: string, voice: string = DEFAULT_VOICE) => {
  try {
    const startTime = Date.now();
    
    // Track API call
    apiMetrics.ttsCallCount++;
    const callIndex = apiMetrics.ttsCallHistory.length;
    apiMetrics.ttsCallHistory.push({
      timestamp: startTime,
      textLength: text.length,
      voice,
      paragraph: -1,
    });
    
    const response = await api.post('tts', {
      json: { text, voice },
    }).blob();
    
    // Update with success
    apiMetrics.ttsCallHistory[callIndex].success = true;
    apiMetrics.ttsCallHistory[callIndex].duration = Date.now() - startTime;
    
    return response;
  } catch (error) {
    // Update with failure if we have a history entry
    if (apiMetrics.ttsCallHistory.length > 0) {
      const lastIndex = apiMetrics.ttsCallHistory.length - 1;
      apiMetrics.ttsCallHistory[lastIndex].success = false;
    }
    
    console.error('Error fetching audio:', error);
    throw error;
  }
};

// Get a direct streaming URL for the TTS API (using GET method)
export const getTtsStreamUrl = (text: string, voice: string = DEFAULT_VOICE, paragraphIndex?: number) => {
  // Increment the counter each time a TTS URL is generated
  apiMetrics.ttsCallCount++;
  
  // Create a URL with query parameters for the streaming TTS endpoint
  // Make sure to use GET endpoint as expo-av works better with direct GET URLs
  const url = new URL(`${API_URL}/tts`);
  
  // Add text directly without encoding - the API expects unencoded text
  url.searchParams.append('text', text);
  url.searchParams.append('voice', voice);
  
  // Add cache busting to prevent browsers from caching the audio
  // Use a unique timestamp for each request
  const timestamp = Date.now();
  url.searchParams.append('_cb', timestamp.toString());
  
  // Log TTS call details
  console.log(`[TTS API Call #${apiMetrics.ttsCallCount}] Voice: ${voice}, Text length: ${text.length}, Paragraph: ${paragraphIndex ?? 'unknown'}`);
  
  // Record the API call in our history
  apiMetrics.ttsCallHistory.push({
    timestamp,
    textLength: text.length,
    voice,
    paragraph: paragraphIndex ?? -1,
    url: url.toString()
  });
  
  return url.toString();
};

// Helper function to log TTS call metrics
export const logTtsMetrics = () => {
  const summary = apiMetrics.getCallsSummary();
  console.log('=== TTS API Call Metrics ===');
  console.log(`Total calls: ${summary.totalCalls}`);
  console.log(`Calls in last 5 minutes: ${summary.callsIn5Min}`);
  console.log(`Calls in last hour: ${summary.callsIn1Hour}`);
  console.log(`Success rate: ${(summary.successRate * 100).toFixed(1)}%`);
  console.log('=========================');
  
  return summary;
};

export default api; 
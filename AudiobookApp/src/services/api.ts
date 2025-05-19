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
    const response = await api.post('tts', {
      json: { text, voice },
    }).blob();
    return response;
  } catch (error) {
    console.error('Error fetching audio:', error);
    throw error;
  }
};

// Get a direct streaming URL for the TTS API (using GET method)
export const getTtsStreamUrl = (text: string, voice: string = DEFAULT_VOICE) => {
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
  
  console.log(`Created TTS streaming URL for text: "${text.substring(0, 30)}..."`);
  return url.toString();
};

export default api; 
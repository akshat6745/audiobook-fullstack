import axios from 'axios';
import { API_URL, DEFAULT_VOICE } from '../utils/config';

// Create an axios instance with improved configuration
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Add request interceptor for logging
api.interceptors.request.use(
  config => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', error.response.status, error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API No Response Error:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Request Setup Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// API functions
export const fetchNovels = async () => {
  try {
    const response = await api.get('/novels');
    return response.data;
  } catch (error) {
    console.error('Error fetching novels:', error);
    throw error;
  }
};

export const fetchChapters = async (novelName: string) => {
  try {
    const response = await api.get(`/chapters/${novelName}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching chapters for ${novelName}:`, error);
    throw error;
  }
};

export const fetchChapterContent = async (novelName: string, chapterNumber: number) => {
  try {
    const response = await api.get('/chapter', {
      params: {
        novelName,
        chapterNumber,
      },
    });
    return response.data.content;
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
    const response = await api.post(
      '/tts',
      { text, voice },
      { responseType: 'blob' }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching audio:', error);
    throw error;
  }
};

export default api; 
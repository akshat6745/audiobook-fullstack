import axios from 'axios';
import { API_URL } from './utils/config';

console.log('API_URL:', API_URL);

// Simple function to test API connection
const testApiConnection = async () => {
  try {
    console.log('Testing API connection...');
    const response = await axios.get(`${API_URL}/novels`);
    console.log('API connection successful!', response.status);
    console.log('Data:', response.data);
    return true;
  } catch (error) {
    console.error('API connection failed:');
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(' - Status:', error.response.status);
        console.error(' - Data:', error.response.data);
      } else if (error.request) {
        console.error(' - No response received. Server might be down.');
      } else {
        console.error(' - Error:', error.message);
      }
    } else {
      console.error(' - Unexpected error:', error);
    }
    return false;
  }
};

// Execute the test
testApiConnection(); 
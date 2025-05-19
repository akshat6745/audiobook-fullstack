import ky from 'ky';
import { API_URL } from './utils/config';

console.log('API_URL:', API_URL);

// Simple function to test API connection
const testApiConnection = async () => {
  try {
    console.log('Testing API connection...');
    const response = await ky.get(`${API_URL}/novels`);
    const data = await response.json();
    console.log('API connection successful!', response.status);
    console.log('Data:', data);
    return true;
  } catch (error) {
    console.error('API connection failed:');
    if (error instanceof Error) {
      console.error(' - Error:', error.message);
      
      // Check if it's a response error (ky.HTTPError)
      if ('response' in error) {
        const httpError = error as { response: Response };
        console.error(' - Status:', httpError.response.status);
        console.error(' - Status Text:', httpError.response.statusText);
      } else {
        console.error(' - No response received. Server might be down.');
      }
    } else {
      console.error(' - Unexpected error:', error);
    }
    return false;
  }
};

// Execute the test
testApiConnection(); 
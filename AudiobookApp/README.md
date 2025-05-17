# Audiobook App

A React Native app that connects to a Python backend to display novels, chapters, and chapter content with audio playback functionality.

## Features

- Browse a list of novels
- View chapters for each novel
- Read chapter content in paragraph form
- Listen to audio of individual paragraphs

## Prerequisites

- Node.js (>= 14)
- npm or yarn
- Expo CLI
- Python (>= 3.8) and pip for the backend

## Setup Instructions

### 1. Start the Python Backend

First, make sure the Python backend is running:

```bash
cd ../python-backend
pip install -r requirements.txt
python main.py
```

This will start the FastAPI server on http://localhost:8000.

### 2. Start the React Native App

```bash
# Install dependencies
npm install

# Start the Expo development server
npm start
```

Then you can:
- Press `i` to open in iOS simulator (requires macOS and Xcode)
- Press `a` to open in Android emulator (requires Android Studio)
- Scan the QR code with Expo Go app on your physical device

## API Endpoints

The app connects to the following API endpoints:

- GET `/novels` - Fetch all available novels
- GET `/chapters/{novel_name}` - Fetch chapters for a specific novel
- GET `/chapter?novelName={novel_name}&chapterNumber={chapter_number}` - Fetch the content of a specific chapter
- POST `/tts` - Convert text to speech

## Technologies Used

- React Native
- Expo
- React Navigation
- Axios for API requests
- Expo AV for audio playback
- FastAPI (Python backend)
- Edge TTS for text-to-speech conversion

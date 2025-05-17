# Audiobook Application

This is a full-stack audiobook application with a Python backend (FastAPI) and a React Native mobile app frontend. The application allows users to browse novels, view their chapters, read chapter content, and listen to audio narrations of the text.

## Project Structure

- **python-backend**: FastAPI backend that provides endpoints for fetching novels, chapters, and text-to-speech conversion
- **AudiobookApp**: React Native / Expo mobile app that provides the user interface

## Features

- Browse a collection of novels
- View chapters for each novel
- Read chapter content in paragraph form
- Listen to audio narrations of paragraphs using Edge TTS

## Prerequisites

- Python 3.8+
- Node.js 14+
- npm or yarn
- Expo CLI

## Quick Start

1. Clone the repository
2. Use the startup script to launch both servers:

```bash
./start.sh
```

Alternatively, you can start each component separately:

### Start the Backend

```bash
cd python-backend
pip install -r requirements.txt
python main.py
```

The backend will be available at `http://localhost:8000`

### Start the Frontend

```bash
cd AudiobookApp
npm install
npm start
```

This will start the Expo development server.

## API Endpoints

The Python backend exposes the following API endpoints:

- `GET /novels` - Get a list of all available novels
- `GET /chapters/{novel_name}` - Get chapters for a specific novel
- `GET /chapter?novelName={name}&chapterNumber={num}` - Get content for a specific chapter
- `POST /tts` - Convert text to speech (returns audio file)

## Technologies Used

### Backend
- FastAPI - High-performance web framework
- Edge TTS - Microsoft Edge text-to-speech service
- Beautiful Soup - Web scraping for novel content

### Frontend
- React Native - Mobile app framework
- Expo - React Native development platform
- React Navigation - Navigation library
- Axios - HTTP client for API requests
- Expo AV - Audio playback

## License

MIT 
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bs4 import BeautifulSoup
import aiohttp
import requests
import tempfile
import asyncio
import edge_tts
import io
from typing import List, Dict
import os
from dotenv import load_dotenv
from fake_useragent import UserAgent
from contextlib import asynccontextmanager

import undetected_chromedriver as uc


# Load environment variables
load_dotenv()

# Initialize session
session = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create session
    global session
    session = aiohttp.ClientSession()
    yield
    # Shutdown: cleanup
    if session:
        await session.close()

app = FastAPI(title="Novel Reader API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create headers with rotating user agent
def get_headers():
    ua = UserAgent()
    return {
        "User-Agent": ua.random,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }

# Google Doc ID from environment variables
DOC_ID = os.getenv('SHEET_ID')

@app.get("/novels", response_model=List[str])
async def fetch_names():
    """
    Fetch all novel names from the Google Doc
    """
    try:
        # Access the document as a webpage
        url = f"https://docs.google.com/document/d/{DOC_ID}/export?format=txt"
        async with session.get(url, headers=get_headers()) as response:
            response.raise_for_status()
            text = await response.text()

        # Split the text into lines and remove empty lines
        novels = [line.strip() for line in text.split('\n') if line.strip()]
        return novels
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching novels: {str(e)}")

@app.get("/chapters/{novel_name}", response_model=List[Dict])
async def fetch_chapters(novel_name: str):
    """
    Fetch chapters for a specific novel
    """
    try:
        url = f"https://novelbin.com/ajax/chapter-archive?novelId={novel_name}"

        # Try multiple times with different user agents if needed
        for _ in range(3):
            try:
                async with session.get(url, headers=get_headers(), ssl=False) as response:
                    response.raise_for_status()
                    html = await response.text()

                    soup = BeautifulSoup(html, 'html.parser')
                    chapters = []

                    for li in soup.find_all('li'):
                        a_tag = li.find('a')
                        if a_tag:
                            chapter_info = {
                                "chapterNumber": len(chapters) + 1,
                                "chapterTitle": a_tag.text.strip(),
                                "link": a_tag['href'] if a_tag['href'].startswith('http') else f"https://novelbin.com{a_tag['href']}"
                            }
                            chapters.append(chapter_info)

                    if chapters:  # If we found chapters, return them
                        return chapters
            except Exception as e:
                print(f"Attempt failed: {e}")
                continue

        # If we get here, all attempts failed
        raise HTTPException(status_code=500, detail="Failed to fetch chapters after multiple attempts")

    except Exception as e:
        print(f"Error fetching chapters: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching chapters: {str(e)}")

@app.get("/chapter")
async def fetch_chapter(chapterNumber: int, novelName: str):
    """
    Fetch content of a specific chapter
    """
    try:
        link = f"https://novelfire.net/book/{novelName}/chapter-{chapterNumber}"
        print(f"Fetching: {link}")

        async with session.get(link, headers=get_headers(), ssl=False) as response:
            response.raise_for_status()
            html = await response.text()

        soup = BeautifulSoup(html, 'html.parser')

        # Try different selectors to find the chapter content
        content_div = (
            soup.find('div', {'class': 'chapter-content'}) or
            soup.find('div', {'id': 'chapter-content'}) or
            soup.find('div', {'class': 'text-left'}) or
            soup.find('div', {'class': 'chapter-content-inner'}) or
            soup.select_one('div.elementor-widget-container')
        )

        if content_div:
            # Find all paragraphs in the chapter content
            paragraphs = [p.text.strip() for p in content_div.find_all('p') if p.text.strip()]

            if not paragraphs:
                # If no paragraphs found, try getting direct text
                paragraphs = [text.strip() for text in content_div.stripped_strings if text.strip()]

            if paragraphs:  # If we found content, return it
                return {"content": paragraphs}

        # If we reached here, we didn't find the content with our selectors
        # Let's get the page source and look for more clues
        print(f"Could not extract content with standard selectors from: {link}")

        # Try alternative approach - some sites load content differently
        # Return broader content for debugging
        main_content = soup.find('main') or soup.find('article') or soup.body
        if main_content:
            paragraphs = [p.text.strip() for p in main_content.find_all('p') if p.text.strip()]
            if paragraphs:
                return {"content": paragraphs}

        raise HTTPException(
            status_code=500,
            detail="Could not find chapter content"
        )

    except Exception as e:
        print(f"Error fetching chapter: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching chapter content: {str(e)}")

class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-ChristopherNeural"  # Default voice

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    Convert text to speech using Edge TTS
    """
    try:
        # Create a temporary file to store the audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
            temp_path = temp_file.name

        # Communicate with Edge TTS service
        communicate = edge_tts.Communicate(request.text, request.voice)

        # Convert text to speech and save to file
        await communicate.save(temp_path)

        # Read the file into memory
        with open(temp_path, "rb") as audio_file:
            audio_data = audio_file.read()

        # Clean up the temporary file
        os.unlink(temp_path)

        # Create a bytes buffer with the audio data
        output = io.BytesIO(audio_data)

        # Reset buffer position to the beginning
        output.seek(0)

        # Return the audio file as a streaming response
        return StreamingResponse(
            output,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=speech.mp3"
            }
        )
    except Exception as e:
        print(f"Error in text-to-speech conversion: {e}")
        raise HTTPException(status_code=500, detail=f"Error in text-to-speech conversion: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
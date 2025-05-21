export interface Novel {
  name: string;
}

export interface Chapter {
  chapterNumber: number;
  chapterTitle: string;
  link: string;
}

export interface PaginatedChapters {
  chapters: Chapter[];
  totalPages: number;
  currentPage: number;
}

export type RootStackParamList = {
  Home: undefined;
  Novels: undefined;
  Chapters: { 
    novelName: string; 
    lastChapter?: number;
  };
  ChapterContent: { 
    novelName: string; 
    chapterNumber: number; 
    chapterTitle: string;
  };
  AudioPlayer: { text: string; title: string, paragraphs: string[], paragraphIndex: number };
  [key: string]: undefined | object;
} 
export interface Novel {
  name: string;
}

export interface Chapter {
  chapterNumber: number;
  chapterTitle: string;
  link: string;
}

export type RootStackParamList = {
  Novels: undefined;
  Chapters: { novelName: string; lastChapter?: number };
  ChapterContent: { novelName: string; chapterNumber: number; chapterTitle: string };
  AudioPlayer: { text: string; title: string, paragraphs: string[], paragraphIndex: number };
  [key: string]: undefined | object;
} 
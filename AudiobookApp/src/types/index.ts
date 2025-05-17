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
  Chapters: { novelName: string };
  ChapterContent: { novelName: string; chapterNumber: number; chapterTitle: string };
  AudioPlayer: { text: string; title: string };
  [key: string]: undefined | object;
} 
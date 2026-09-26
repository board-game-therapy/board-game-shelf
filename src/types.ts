export type Region = { x: number; y: number; width: number; height: number };
export type Evidence = { photoId: string; region: Region; location?: string };
export type Photo = {
  id: string;
  src: string;
  label: string;
  filename: string;
  width: number;
  height: number;
  addedAt?: string;
};
export type Range = { min: number; max: number };
export type Game = {
  key: string;
  aliases?: string[];
  title: string;
  tags: string[];
  kind: 'game' | 'expansion' | 'accessory' | 'unknown';
  confidence: 'confirmed' | 'uncertain';
  summary: string;
  description: string;
  notes: string;
  evidence: Evidence[];
  sources: string[];
  players?: Range;
  minutes?: Range;
  minAge?: number;
  image?: { thumbnail: string; full: string; source: string; credit: string };
  reference?: { name: string; bggId: number; url: string; checkedAt: string };
};
export type Catalog = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  photos: Photo[];
  games: Game[];
};

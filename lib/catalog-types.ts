export type Region = { x: number; y: number; width: number; height: number };
export type Evidence = { photoId: string; location: string; region?: Region };
export type Game = {
  id: number; catalog_key: string|null; title: string; tags: string[];
  confidence: "confirmed"|"uncertain"; kind: "game"|"expansion"|"accessory"|"unknown";
  notes: string; summary: string; description: string; evidence: Evidence[]; position: number; sources?: string[];
};

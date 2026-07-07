export interface GestureCardData {
  _id: string;
  name: string;
  playbackId: string;
  concept: string[];
  info: string;
  categories: Array<{ _id: string; name: string } | undefined>;
}

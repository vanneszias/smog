export interface GestureCardData {
  _id: string;
  categories: Array<{ _id: string; name: string } | undefined>;
  concept: string[];
  info: string;
  name: string;
  playbackId: string;
}

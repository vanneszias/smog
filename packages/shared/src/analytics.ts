export interface AnalyticsEventMap {
  gesture_collection_changed: {
    action: "added" | "removed";
    collection: "favorites" | "list";
    gesture_id: string;
    source: "gesture_detail" | "gesture_list" | "search_results";
  };
  gesture_viewed: {
    gesture_id: string;
    source: "direct" | "favorites" | "related_gestures" | "search_results";
  };
  search_performed: {
    category_count: number;
    has_results: boolean;
    query_length: number;
    result_count: number;
    source: "filter_change" | "recent_search" | "submit";
  };
  video_playback_completed: {
    gesture_id: string;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

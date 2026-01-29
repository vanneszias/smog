import type { GestureDetailData } from "@smog/ui";

// Mock categories used across gestures
export const MOCK_CATEGORIES = [
  { _id: "cat-1", name: "Greetings" },
  { _id: "cat-2", name: "Basic" },
  { _id: "cat-3", name: "Questions" },
  { _id: "cat-4", name: "Emotions" },
  { _id: "cat-5", name: "Actions" },
  { _id: "cat-6", name: "Food" },
  { _id: "cat-7", name: "Family" },
  { _id: "cat-8", name: "Time" },
];

// 12 diverse mock gestures for testing various UI scenarios
export const MOCK_GESTURES: GestureDetailData[] = [
  {
    _id: "gesture-1",
    name: "Hello",
    categories: [MOCK_CATEGORIES[0], MOCK_CATEGORIES[1]],
    concept: ["greeting", "introduction", "friendly", "wave"],
    info: "The most common greeting in sign language. This gesture involves a simple wave or hand movement near the head, often accompanied by a smile. It's one of the first signs that beginners learn.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-2",
    name: "Thank You",
    categories: [MOCK_CATEGORIES[1], MOCK_CATEGORIES[3]],
    concept: ["gratitude", "appreciation", "polite"],
    info: "Express gratitude and appreciation with this important gesture. The sign starts at the chin and moves forward, symbolizing giving thanks from the heart.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-3",
    name: "How are you feeling today?",
    categories: [MOCK_CATEGORIES[2], MOCK_CATEGORIES[3]],
    concept: [
      "question",
      "emotion",
      "wellbeing",
      "health",
      "feelings",
      "inquiry",
      "care",
      "concern",
    ],
    info: "A complex gesture combining multiple signs to ask about someone's emotional state and general wellbeing. This is commonly used in daily conversations to show care and interest.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-4",
    name: "Yes",
    categories: [MOCK_CATEGORIES[1]],
    concept: ["affirmation", "agreement"],
    info: "Simple affirmative gesture used to express agreement or confirmation.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-5",
    name: "No",
    categories: [MOCK_CATEGORIES[1]],
    concept: ["negation", "disagreement", "refusal"],
    info: "Express disagreement or negation. This is one of the most essential signs in any sign language vocabulary.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-6",
    name: "Happy",
    categories: [MOCK_CATEGORIES[3]],
    concept: ["joy", "emotion", "positive", "smile", "cheerful"],
    info: "Show happiness and joy with this uplifting gesture. The sign typically involves upward movements that reflect positive emotions and energy.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",

    sponsorship: {
      status: "active",
      sponsorName: "Happy Foundation",
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
    },
  },
  {
    _id: "gesture-7",
    name: "Eat",
    categories: [MOCK_CATEGORIES[4], MOCK_CATEGORIES[5]],
    concept: ["food", "meal", "consume"],
    info: "Universal gesture for eating and consuming food.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-8",
    name: "Mother",
    categories: [MOCK_CATEGORIES[6], MOCK_CATEGORIES[1]],
    concept: ["family", "parent", "female", "mom"],
    info: "Refer to your mother or maternal figure with this family-related sign. It's an important part of family vocabulary in sign language.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-9",
    name: "Father",
    categories: [MOCK_CATEGORIES[6], MOCK_CATEGORIES[1]],
    concept: ["family", "parent", "male", "dad"],
    info: "Refer to your father or paternal figure. Similar to 'Mother' but with distinct hand positioning that differentiates gender in family signs.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-10",
    name: "What time is it?",
    categories: [MOCK_CATEGORIES[2], MOCK_CATEGORIES[7]],
    concept: ["question", "time", "clock", "inquiry"],
    info: "Ask about the current time with this commonly used question. The gesture typically involves pointing to the wrist where a watch would be worn.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",

    sponsorship: {
      status: "available",
    },
  },
  {
    _id: "gesture-11",
    name: "Please",
    categories: [MOCK_CATEGORIES[1]],
    concept: ["polite", "request", "manners", "courtesy", "asking"],
    info: "A polite way to make requests or ask for something. This gesture is essential for courteous communication and is often taught alongside 'Thank You' as basic manners.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
  {
    _id: "gesture-12",
    name: "Sorry",
    categories: [MOCK_CATEGORIES[3], MOCK_CATEGORIES[1]],
    concept: ["apology", "regret", "emotion"],
    info: "Express apologies and regret with this important gesture.",
    playbackId: "Dv01ilbW8V9mhtppKd8Qz3FdJgvr7LRD01ZiLNDvb02x0c",
  },
];

// Helper to get all unique categories from gestures
export function getAllCategories() {
  return MOCK_CATEGORIES;
}

// Helper to find gesture by ID
export function getGestureById(id: string) {
  return MOCK_GESTURES.find((g) => g._id === id);
}

// Helper to filter gestures by search and categories
export function filterGestures(
  gestures: GestureDetailData[],
  searchQuery: string,
  selectedCategories: string[]
) {
  let filtered = gestures;

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (gesture) =>
        gesture.name.toLowerCase().includes(query) ||
        gesture.concept.some((c) => c.toLowerCase().includes(query)) ||
        gesture.info?.toLowerCase().includes(query)
    );
  }

  // Filter by selected categories
  if (selectedCategories.length > 0) {
    filtered = filtered.filter((gesture) =>
      gesture.categories.some((cat) =>
        cat ? selectedCategories.includes(cat._id) : false
      )
    );
  }

  return filtered;
}

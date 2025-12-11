# Agent Guidelines for SMOG App

## App Overview

**SMOG** is a comprehensive sign language learning application that helps users discover, learn, and practice sign language gestures through an intuitive mobile interface.

### Purpose & Mission
The app enables users to:
- **Search & Discover**: Find sign language gestures using keyword-based search.
- **Learn Visually**: Watch high-quality video demonstrations of signs.
- **Practice & Track**: Save favorites and track learning progress.
- **Multilingual Support**: Learn in English, French, or Dutch.

### Target Users
- Sign language learners (beginners to advanced)
- Family members of deaf/hard-of-hearing individuals
- Educators and interpreters
- Anyone interested in learning sign language

## Technical Architecture

### Frontend Stack
- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **UI**: React Native components with Reanimated for animations
- **State Management**: React Context API
- **Styling**: StyleSheet with a theme system
- **Linting & Formatting**: Biome

### Backend & Data
- **Database**: Convex for real-time data and server-side functions
- **Local Storage**: SQLite for offline caching and favorites
- **Sync**: Custom sync service for online/offline data management
- **Video Storage**: Mux for video streaming

### Key Services
- `gestureService.ts`: Manages gesture data and search logic.
- `databaseService.ts`: Handles local SQLite operations.
- `convexSyncService.ts`: Synchronizes data between Convex and the local database.
- `analyticsService.ts`: Tracks user events with PostHog.

## Project Structure
```
smog/
├── app/                    # Expo Router pages (screens)
│   ├── (tabs)/             # Tab navigation layout
│   ├── gesture/[id].tsx    # Dynamic gesture detail screen
│   └── settings/           # Settings screens
├── assets/                 # Fonts and images
├── components/             # Reusable UI components
├── context/                # React Context providers for global state
├── convex/                 # Convex backend schema and functions
├── hooks/                  # Custom React hooks
├── navigation/             # Navigation setup
├── services/               # Business logic and API clients
├── styles/                 # Theming and style constants
├── translations/           # i18n localization files
└── types/                  # TypeScript type definitions
```

## Getting Started

### Prerequisites
- Node.js (LTS)
- bun
- Expo Go app (for mobile development)

### Installation
1. **Clone the repository:** `git clone <repository-url>`
2. **Install dependencies:** `bun install`
3. **Set up environment variables:** Create a `.env` file and add your Convex deployment URL:
   ```
   EXPO_PUBLIC_CONVEX_URL=your-convex-url
   ```

### Running the App
- **Start the development server:** `bun start`
- Scan the QR code with the Expo Go app.

## Build and Test Commands
- `bun test`: Runs tests with Jest.
- `bun lint`: Lints the code with Biome.
- `bun format:fix`: Formats the code with Biome.
- `bun check:fix`: Runs both linting and formatting.

## Convex Backend

The `convex/` directory contains the backend logic, including the database schema and server-side functions.

### Data Schema
The schema is defined in `convex/schema.ts` using `defineSchema` and `defineTable`. It includes two main tables:
- `categories`: Stores gesture categories.
- `gestures`: Stores gesture details, including `name`, `categoryIds`, `playbackId`, and `concept`.

### Server Functions
Server-side logic is placed in files like `convex/gestures.ts`. These functions are used to query and mutate data and can be accessed from the frontend using Convex client hooks.

### Local Development
To run the Convex backend locally for development:
1. **Install the Convex CLI:** `bun dlx convex`
2. **Run the dev server:** `bun convex dev`

This command watches for changes in the `convex/` directory and pushes them to your development deployment.

### Deployment
To deploy your backend to production, run:
```bash
bun convex deploy
```

## Analytics
The app uses PostHog for analytics, configured in `services/analyticsService.ts`. Key events tracked include:
- `Search Performed`
- `Gesture Viewed`
- `Favorite Added/Removed`
- `Video Playback Started/Completed`

This provides insights into user engagement and learning patterns.

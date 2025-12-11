# SMOG Sign Language App

**SMOG** is a comprehensive sign language learning application that helps users discover, learn, and practice sign language gestures through an intuitive mobile interface.

## Core Features

- **Smart Search**: Keyword-based search with autocomplete and category filtering.
- **Video Library**: High-quality sign language gesture videos.
- **Favorites System**: Save frequently used signs for quick access.
- **Categories**: Organized gesture categories (greetings, numbers, family, etc.).
- **Offline Support**: Basic functionality works without internet through local caching.
- **Multilingual**: Support for English, French, and Dutch.
- **Learning Analytics**: Tracks user progress and learning patterns using PostHog.

## Technology Stack

- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing)
- **Language**: TypeScript
- **UI**: React Native components with Reanimated for animations
- **State Management**: React Context API
- **Backend & Data**:
    - **Database**: Convex for real-time data
    - **Local Storage**: SQLite for offline caching
    - **Sync**: Custom sync service for online/offline data management
- **Linting & Formatting**: Biome

## Project Structure

The project uses a feature-based structure with Expo Router for navigation.

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

- Node.js (LTS version)
- bun package manager
- Expo Go app on your mobile device (for development)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd smog
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Set up environment variables:**

    Create a `.env` file in the root of the project and add the necessary environment variables:

    ```bash
    # WorkOS Authentication
    EXPO_PUBLIC_WORKOS_CLIENT_ID=client_123456789
    EXPO_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:8081/auth-callback
    EXPO_PUBLIC_WORKOS_DEV_MODE=true
    
    # Convex Database
    EXPO_PUBLIC_CONVEX_URL=your-convex-url
    ```

    See `WORKOS_MIGRATION.md` for detailed setup instructions.

### Running the App

1.  **Start the development server:**
    ```bash
    bun start
    ```
2.  Scan the QR code with the Expo Go app on your iOS or Android device.

## Available Scripts

- `bun start`: Starts the Expo development server.
- `bun ios`: Starts the app on the iOS simulator.
- `bun android`: Starts the app on the Android emulator.
- `bun web`: Runs the app in a web browser.
- `bun test`: Runs tests using Jest.
- `bun lint`: Lints the codebase using Biome.
- `bun format:fix`: Formats the code using Biome.
- `bun check:fix`: Runs both the linter and formatter.



Use `npx expo run:ios --configuration Debug --device` to make a local debug install

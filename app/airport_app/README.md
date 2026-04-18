# Airport App

A Flutter application for searching and browsing airports, built with a modern UI design following an MVP (Minimum Viable Product) structure.

## MVP Flow

The app follows a three-screen MVP structure:

1. **Screen 1 (Explore)**: Home screen with search bar and quick actions
   - Clean landing page with app title
   - Search bar that redirects to airport search
   - Quick action cards for popular features

2. **Screen 2 (Airport Search)**: Airport search and listing
   - Functional search bar with real-time filtering
   - List of airports with airplane icons
   - Tap on airport to view details
   - Matches the original design from the reference image

3. **Screen 3 (Airport Detail)**: Airport details (placeholder)
   - Placeholder screen for future airport details
   - Shows airport ID and construction message
   - Back navigation to search screen

## Features

- **Three-Screen MVP Flow**: Clean navigation between screens
- **Airport Search**: Search airports by name, city, country, or IATA code
- **Clean UI**: Modern interface with the primary color #3e6bc1
- **Navigation**: Bottom navigation with Explore, Account, and More tabs
- **Responsive Design**: Works on both iOS and Android
- **Routing**: Proper navigation using go_router

## Screenshots

The app includes:
- **Explore Screen**: Home screen with search functionality
- **Airport Search Screen**: Main airport search interface with search functionality
- **Airport Detail Screen**: Placeholder for airport details
- **Account Screen**: User account management (placeholder)
- **More Screen**: Additional options (placeholder)

## Getting Started

### Prerequisites

- Flutter SDK (latest stable version)
- Dart SDK
- iOS Simulator or Android Emulator

### Installation

1. Clone the repository
2. Navigate to the project directory:
   ```bash
   cd airport_app
   ```

3. Install dependencies:
   ```bash
   flutter pub get
   ```

4. Run the app:
   ```bash
   flutter run
   ```

## Project Structure

```
lib/
├── main.dart                    # App entry point and routing
├── screens/
│   ├── explore_screen.dart      # Screen 1: Home with search bar
│   ├── airport_search_screen.dart # Screen 2: Airport search and list
│   ├── airport_detail_screen.dart # Screen 3: Airport details (placeholder)
│   ├── account_screen.dart      # Account management screen
│   └── more_screen.dart         # Additional options screen
```

## Dependencies

- `flutter`: Core Flutter framework
- `go_router`: Navigation and routing

## Theme

The app uses a custom theme with:
- Primary Color: #3e6bc1 (Blue)
- Background: White
- Text Colors: Dark gray for readability

## Navigation Flow

1. **Home** → Tap search bar → **Airport Search**
2. **Airport Search** → Tap airport → **Airport Detail**
3. **Airport Detail** → Back button → **Airport Search**
4. Bottom navigation for **Account** and **More** screens

## Future Enhancements

- Backend integration for real airport data
- Complete airport detail screen implementation
- User authentication
- Flight booking functionality
- Airport details and information
- Favorites and recent searches
- Offline support

## Development

This is currently a UI-only implementation following the MVP structure. The backend integration and airport detail screen will be added in future iterations.

import 'package:cloud_firestore/cloud_firestore.dart';

class FavouritesService {
  static final _db = FirebaseFirestore.instance;

  // ── Airport ID stream (for bookmark button state) ─────────────
  static Stream<Set<String>> savedAirportIds(String uid) =>
      _db.collection('users/$uid/savedAirports')
          .snapshots()
          .map((s) => s.docs.map((d) => d.id).toSet());

  static Stream<List<SavedAirport>> savedAirports(String uid) =>
      _db.collection('users/$uid/savedAirports')
          .orderBy('savedAt', descending: true)
          .snapshots()
          .map((s) => s.docs.map((d) => SavedAirport.fromMap(d.data())).toList());

  static Future<void> toggleSavedAirport(
    String uid,
    String airportCode,
    Map<String, dynamic> data,
  ) =>
      _toggle(_db.doc('users/$uid/savedAirports/$airportCode'), data);

  // ── ID streams (for button active state) ─────────────────────
  static Stream<Set<String>> savedIds(String uid) =>
      _db.collection('users/$uid/savedRestaurants')
          .snapshots()
          .map((s) => s.docs.map((d) => d.id).toSet());

  static Stream<Set<String>> favouriteIds(String uid) =>
      _db.collection('users/$uid/favouriteRestaurants')
          .snapshots()
          .map((s) => s.docs.map((d) => d.id).toSet());

  // ── Full-data streams (for account screen lists) ──────────────
  static Stream<List<SavedRestaurant>> savedRestaurants(String uid) =>
      _db.collection('users/$uid/savedRestaurants')
          .orderBy('savedAt', descending: true)
          .snapshots()
          .map((s) => s.docs.map((d) => SavedRestaurant.fromMap(d.data())).toList());

  static Stream<List<SavedRestaurant>> favouriteRestaurants(String uid) =>
      _db.collection('users/$uid/favouriteRestaurants')
          .orderBy('savedAt', descending: true)
          .snapshots()
          .map((s) => s.docs.map((d) => SavedRestaurant.fromMap(d.data())).toList());

  // ── Toggle operations ─────────────────────────────────────────
  static Future<void> toggleSaved(
    String uid,
    String restaurantId,
    Map<String, dynamic> data,
  ) =>
      _toggle(_db.doc('users/$uid/savedRestaurants/$restaurantId'), data);

  static Future<void> toggleFavourite(
    String uid,
    String restaurantId,
    Map<String, dynamic> data,
  ) =>
      _toggle(_db.doc('users/$uid/favouriteRestaurants/$restaurantId'), data);

  static Future<void> _toggle(
    DocumentReference doc,
    Map<String, dynamic> data,
  ) async {
    if ((await doc.get()).exists) {
      await doc.delete();
    } else {
      await doc.set({...data, 'savedAt': FieldValue.serverTimestamp()});
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  MODEL
// ─────────────────────────────────────────────────────────────
class SavedAirport {
  final String airportCode;
  final String name;
  final String city;
  final String country;

  const SavedAirport({
    required this.airportCode,
    required this.name,
    required this.city,
    required this.country,
  });

  factory SavedAirport.fromMap(Map<String, dynamic> m) => SavedAirport(
        airportCode: m['airportCode'] as String? ?? '',
        name: m['name'] as String? ?? '',
        city: m['city'] as String? ?? '',
        country: m['country'] as String? ?? '',
      );
}

class SavedRestaurant {
  final String name;
  final String cuisine;
  final String logoUrl;
  final bool isLounge;
  final String terminalName;
  final String airportCode;
  final String airportName;

  const SavedRestaurant({
    required this.name,
    required this.cuisine,
    required this.logoUrl,
    required this.isLounge,
    required this.terminalName,
    required this.airportCode,
    required this.airportName,
  });

  factory SavedRestaurant.fromMap(Map<String, dynamic> m) => SavedRestaurant(
        name: m['name'] as String? ?? '',
        cuisine: m['cuisine'] as String? ?? '',
        logoUrl: m['logoUrl'] as String? ?? '',
        isLounge: m['isLounge'] as bool? ?? false,
        terminalName: m['terminalName'] as String? ?? '',
        airportCode: m['airportCode'] as String? ?? '',
        airportName: m['airportName'] as String? ?? '',
      );
}

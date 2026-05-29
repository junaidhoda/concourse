import 'package:cloud_firestore/cloud_firestore.dart';

class FirebaseService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static const _codeToSlug = {
    'LGW': 'gatwick',
    'LHR': 'heathrow',
    'BHX': 'birmingham',
    'MAN': 'manchester',
    'CDG': 'cdg',
    'FRA': 'fra',
  };

  static String _slug(String airportCode) =>
      _codeToSlug[airportCode.toUpperCase()] ?? airportCode.toLowerCase();

  static Future<Map<String, dynamic>?> getAirportData(String airportCode) async {
    try {
      final doc = await _firestore
          .collection('airports')
          .doc(_slug(airportCode))
          .get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      print('Error fetching airport data: $e');
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> getTerminals(String airportCode) async {
    try {
      final snap = await _firestore
          .collection('airports')
          .doc(_slug(airportCode))
          .collection('terminals')
          .get();
      return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    } catch (e) {
      print('Error fetching terminals: $e');
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> getRestaurantsByTerminal(
      String airportCode, String terminalId) async {
    try {
      final snap = await _firestore
          .collection('airports')
          .doc(_slug(airportCode))
          .collection('terminals')
          .doc(terminalId)
          .collection('restaurants')
          .get();
      return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    } catch (e) {
      print('Error fetching restaurants for $terminalId: $e');
      return [];
    }
  }

  // Fetches all restaurants across all terminals, injecting _terminalId and _terminalName.
  static Future<List<Map<String, dynamic>>> getRestaurants(String airportCode) async {
    final terminals = await getTerminals(airportCode);
    final all = <Map<String, dynamic>>[];
    for (final t in terminals) {
      final terminalId = t['id'] as String;
      final terminalName = t['name'] as String? ?? terminalId;
      final rests = await getRestaurantsByTerminal(airportCode, terminalId);
      for (final r in rests) {
        all.add({...r, '_terminalId': terminalId, '_terminalName': terminalName});
      }
    }
    return all;
  }

  static String getAirportName(String airportCode) {
    const airportNames = {
      'LHR': 'London Heathrow',
      'LGW': 'London Gatwick',
      'JFK': 'New York JFK',
      'LAX': 'Los Angeles International',
      'CDG': 'Paris Charles de Gaulle',
      'FRA': 'Frankfurt Airport',
      'SIN': 'Singapore Changi',
      'DXB': 'Dubai International',
      'BKK': 'Bangkok Suvarnabhumi',
      'IST': 'Istanbul Airport',
      'MAN': 'Manchester Airport',
      'BHX': 'Birmingham Airport',
    };
    return airportNames[airportCode] ?? airportCode;
  }

  static String getAirportLocation(String airportCode) {
    const airportLocations = {
      'LHR': 'London, United Kingdom',
      'LGW': 'London, United Kingdom',
      'JFK': 'New York, United States',
      'LAX': 'Los Angeles, United States',
      'CDG': 'Paris, France',
      'FRA': 'Frankfurt, Germany',
      'SIN': 'Singapore',
      'DXB': 'Dubai, United Arab Emirates',
      'BKK': 'Bangkok, Thailand',
      'IST': 'Istanbul, Turkey',
      'MAN': 'Manchester, United Kingdom',
      'BHX': 'Birmingham, United Kingdom',
    };
    return airportLocations[airportCode] ?? 'Unknown Location';
  }
}

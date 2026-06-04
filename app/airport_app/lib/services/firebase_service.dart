import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

class FirebaseService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static String _slug(String airportCode) => airportCode.toLowerCase();

  static Future<Map<String, dynamic>?> getAirportData(String airportCode) async {
    try {
      final doc = await _firestore
          .collection('airports')
          .doc(_slug(airportCode))
          .get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      debugPrint('Error fetching airport data: $e');
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
      debugPrint('Error fetching terminals: $e');
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
      debugPrint('Error fetching restaurants for $terminalId: $e');
      return [];
    }
  }

  // Returns total restaurant count across all terminals without fetching full documents.
  static Future<int> getRestaurantCount(String airportCode) async {
    try {
      final terminals = await getTerminals(airportCode);
      if (terminals.isEmpty) return 0;
      final snaps = await Future.wait(
        terminals.map((t) => _firestore
            .collection('airports').doc(_slug(airportCode))
            .collection('terminals').doc(t['id'] as String)
            .collection('restaurants').get()),
      );
      return snaps.fold<int>(0, (total, s) => total + s.size);
    } catch (_) {
      return 0;
    }
  }

  // Fetches all restaurants across all terminals in parallel.
  static Future<List<Map<String, dynamic>>> getRestaurants(String airportCode) async {
    final terminals = await getTerminals(airportCode);
    final results = await Future.wait(terminals.map((t) async {
      final terminalId   = t['id'] as String;
      final terminalName = t['name'] as String? ?? terminalId;
      final rests = await getRestaurantsByTerminal(airportCode, terminalId);
      return rests.map((r) => {...r, '_terminalId': terminalId, '_terminalName': terminalName}).toList();
    }));
    return results.expand((list) => list).toList();
  }

  static Future<List<Map<String, dynamic>>> getAllAirports() async {
    try {
      final snap = await _firestore.collection('airports').get();
      return snap.docs.map((d) => {'_docId': d.id, ...d.data()}).toList();
    } catch (e) {
      debugPrint('Error fetching airports: $e');
      return [];
    }
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
      // Europe
      'LHR': 'London, United Kingdom',
      'LGW': 'London, United Kingdom',
      'MAN': 'Manchester, United Kingdom',
      'BHX': 'Birmingham, United Kingdom',
      'CDG': 'Paris, France',
      'FRA': 'Frankfurt, Germany',
      'MUC': 'Munich, Germany',
      'IST': 'Istanbul, Turkey',
      'AMS': 'Amsterdam, Netherlands',
      'ATH': 'Athens, Greece',
      'BRU': 'Brussels, Belgium',
      'DUB': 'Dublin, Ireland',
      'FCO': 'Rome, Italy',
      'LIS': 'Lisbon, Portugal',
      'MAD': 'Madrid, Spain',
      'ZRH': 'Zurich, Switzerland',
      // Middle East
      'DXB': 'Dubai, United Arab Emirates',
      'AUH': 'Abu Dhabi, United Arab Emirates',
      'DOH': 'Doha, Qatar',
      // North America
      'JFK': 'New York, United States',
      'LGA': 'New York, United States',
      'LAX': 'Los Angeles, United States',
      'ATL': 'Atlanta, United States',
      'ORD': 'Chicago, United States',
      'DFW': 'Dallas, United States',
      'DEN': 'Denver, United States',
      'SFO': 'San Francisco, United States',
      'SEA': 'Seattle, United States',
      'MIA': 'Miami, United States',
      'BOS': 'Boston, United States',
      'IAH': 'Houston, United States',
      'LAS': 'Las Vegas, United States',
      'MCO': 'Orlando, United States',
      'YYZ': 'Toronto, Canada',
      'YVR': 'Vancouver, Canada',
      'MEX': 'Mexico City, Mexico',
      // Asia
      'SIN': 'Singapore',
      'BKK': 'Bangkok, Thailand',
      'HKG': 'Hong Kong',
      'ICN': 'Seoul, South Korea',
      'NRT': 'Tokyo, Japan',
      'HND': 'Tokyo, Japan',
      'KIX': 'Osaka, Japan',
      'PKX': 'Beijing, China',
      'CAN': 'Guangzhou, China',
      'TPE': 'Taipei, Taiwan',
      'KUL': 'Kuala Lumpur, Malaysia',
      'MNL': 'Manila, Philippines',
      'DEL': 'New Delhi, India',
      'BOM': 'Mumbai, India',
      'CMB': 'Colombo, Sri Lanka',
      'HAN': 'Hanoi, Vietnam',
      // South America
      'GIG': 'Rio de Janeiro, Brazil',
      'LIM': 'Lima, Peru',
      // Africa
      'LOS': 'Lagos, Nigeria',
      'JNB': 'Johannesburg, South Africa',
      // Oceania
      'SYD': 'Sydney, Australia',
      'MEL': 'Melbourne, Australia',
      'WLG': 'Wellington, New Zealand',
    };
    return airportLocations[airportCode] ?? '';
  }
}

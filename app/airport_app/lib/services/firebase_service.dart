import 'package:cloud_firestore/cloud_firestore.dart';

class FirebaseService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Fetch airport data including terminals
  static Future<Map<String, dynamic>?> getAirportData(String airportCode) async {
    try {
      final doc = await _firestore
          .collection('airports')
          .doc(airportCode)
          .get();
      
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (e) {
      print('Error fetching airport data: $e');
      return null;
    }
  }

  // Fetch restaurants for a specific airport
  static Future<List<Map<String, dynamic>>> getRestaurants(String airportCode) async {
    try {
      final querySnapshot = await _firestore
          .collection('airports')
          .doc(airportCode)
          .collection('restaurants')
          .get();
      
      return querySnapshot.docs
          .map((doc) => {
                'id': doc.id,
                ...doc.data(),
              })
          .toList();
    } catch (e) {
      print('Error fetching restaurants: $e');
      return [];
    }
  }

  // Get airport name from code
  static String getAirportName(String airportCode) {
    final airportNames = {
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

  // Get airport location from code
  static String getAirportLocation(String airportCode) {
    final airportLocations = {
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
import 'package:cloud_firestore/cloud_firestore.dart';

class AdminService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static const String _adminUsername = 'admin';
  static const String _adminPassword = 'MustafaJunaid';
  
  static bool _isAuthenticated = false;

  // Admin authentication
  static bool authenticateAdmin(String username, String password) {
    if (username == _adminUsername && password == _adminPassword) {
      _isAuthenticated = true;
      return true;
    }
    return false;
  }

  static bool get isAuthenticated => _isAuthenticated;

  static void logout() {
    _isAuthenticated = false;
  }

  // Get all airports
  static Future<List<Map<String, dynamic>>> getAllAirports() async {
    try {
      final querySnapshot = await _firestore.collection('airports').get();
      return querySnapshot.docs.map((doc) => {
        'id': doc.id,
        ...doc.data(),
      }).toList();
    } catch (e) {
      print('Error fetching airports: $e');
      return [];
    }
  }

  // Get restaurants for an airport
  static Future<List<Map<String, dynamic>>> getRestaurantsForAirport(String airportCode) async {
    try {
      final querySnapshot = await _firestore
          .collection('airports')
          .doc(airportCode)
          .collection('restaurants')
          .get();
      
      return querySnapshot.docs.map((doc) => {
        'id': doc.id,
        ...doc.data(),
      }).toList();
    } catch (e) {
      print('Error fetching restaurants: $e');
      return [];
    }
  }

  // Update restaurant data
  static Future<bool> updateRestaurant(String airportCode, String restaurantId, Map<String, dynamic> data) async {
    try {
      await _firestore
          .collection('airports')
          .doc(airportCode)
          .collection('restaurants')
          .doc(restaurantId)
          .update(data);
      return true;
    } catch (e) {
      print('Error updating restaurant: $e');
      return false;
    }
  }

  // Update airport data
  static Future<bool> updateAirport(String airportCode, Map<String, dynamic> data) async {
    try {
      await _firestore
          .collection('airports')
          .doc(airportCode)
          .update(data);
      return true;
    } catch (e) {
      print('Error updating airport: $e');
      return false;
    }
  }

  // Add new restaurant
  static Future<bool> addRestaurant(String airportCode, Map<String, dynamic> data) async {
    try {
      await _firestore
          .collection('airports')
          .doc(airportCode)
          .collection('restaurants')
          .add(data);
      return true;
    } catch (e) {
      print('Error adding restaurant: $e');
      return false;
    }
  }

  // Delete restaurant
  static Future<bool> deleteRestaurant(String airportCode, String restaurantId) async {
    try {
      await _firestore
          .collection('airports')
          .doc(airportCode)
          .collection('restaurants')
          .doc(restaurantId)
          .delete();
      return true;
    } catch (e) {
      print('Error deleting restaurant: $e');
      return false;
    }
  }
} 
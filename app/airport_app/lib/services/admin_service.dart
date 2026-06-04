import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class AdminService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static Future<bool> checkIsAdmin() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;
    try {
      final doc = await _firestore.collection('users').doc(user.uid).get();
      return doc.data()?['isAdmin'] == true;
    } catch (_) {
      return false;
    }
  }

  static void logout() {}

  // ── Airports ────────────────────────────────────────────────

  static Future<Map<String, dynamic>?> getAirportDetails(String airportSlug) async {
    try {
      final doc = await _firestore.collection('airports').doc(airportSlug).get();
      if (!doc.exists) return null;
      return {'id': doc.id, ...doc.data()!};
    } catch (e) {
      print('Error fetching airport details: $e');
      return null;
    }
  }

  static Future<bool> updateAirport(String airportSlug, Map<String, dynamic> data) async {
    try {
      await _firestore.collection('airports').doc(airportSlug).update(data);
      return true;
    } catch (e) {
      print('Error updating airport: $e');
      return false;
    }
  }

  static Future<List<Map<String, dynamic>>> getAllAirports() async {
    try {
      final snap = await _firestore.collection('airports').get();
      return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    } catch (e) {
      print('Error fetching airports: $e');
      return [];
    }
  }

  // Returns { 'terminals': n, 'restaurants': n } for a given airport slug.
  static Future<Map<String, int>> getAirportCounts(String airportSlug) async {
    try {
      final terminalsSnap = await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').get();
      int restaurantCount = 0;
      final snaps = await Future.wait(terminalsSnap.docs.map((t) => t.reference.collection('restaurants').get()));
      restaurantCount = snaps.fold(0, (sum, s) => sum + s.size);
      return {'terminals': terminalsSnap.size, 'restaurants': restaurantCount};
    } catch (e) {
      return {'terminals': 0, 'restaurants': 0};
    }
  }

  // ── Terminals ───────────────────────────────────────────────

  static Future<List<Map<String, dynamic>>> getTerminals(String airportSlug) async {
    try {
      final snap = await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').get();
      return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    } catch (e) {
      print('Error fetching terminals: $e');
      return [];
    }
  }

  // ── Restaurants ─────────────────────────────────────────────

  static Future<List<Map<String, dynamic>>> getRestaurantsForTerminal(
      String airportSlug, String terminalId) async {
    try {
      final snap = await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').doc(terminalId)
          .collection('restaurants').get();
      return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
    } catch (e) {
      print('Error fetching restaurants: $e');
      return [];
    }
  }

  static Future<bool> addRestaurant(
      String airportSlug, String terminalId, Map<String, dynamic> data) async {
    try {
      await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').doc(terminalId)
          .collection('restaurants').add(data);
      return true;
    } catch (e) {
      print('Error adding restaurant: $e');
      return false;
    }
  }

  static Future<bool> updateRestaurant(
      String airportSlug, String terminalId, String restaurantId,
      Map<String, dynamic> data) async {
    try {
      await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').doc(terminalId)
          .collection('restaurants').doc(restaurantId)
          .update(data);
      return true;
    } catch (e) {
      print('Error updating restaurant: $e');
      return false;
    }
  }

  static Future<bool> deleteRestaurant(
      String airportSlug, String terminalId, String restaurantId) async {
    try {
      await _firestore
          .collection('airports').doc(airportSlug)
          .collection('terminals').doc(terminalId)
          .collection('restaurants').doc(restaurantId)
          .delete();
      return true;
    } catch (e) {
      print('Error deleting restaurant: $e');
      return false;
    }
  }
}

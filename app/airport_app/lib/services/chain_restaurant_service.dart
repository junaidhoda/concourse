import 'dart:convert';
import 'package:flutter/services.dart';

class ChainRestaurantService {
  static List<Map<String, dynamic>>? _chains;
  static Map<String, String>? _logoByNormName; // norm(name) → logo_url

  static Future<List<Map<String, dynamic>>> load() async {
    if (_chains != null) return _chains!;
    final raw = await rootBundle.loadString('assets/data/chain_restaurants.json');
    _chains = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    return _chains!;
  }

  /// Pre-loads chains + independents and builds the logo lookup map.
  /// Call once during app startup (or before the airport detail screen loads).
  static Future<void> loadAll() async {
    await load();
    if (_logoByNormName != null) return;

    final map = <String, String>{};

    for (final e in _chains!) {
      final logo = e['logo_url'] as String? ?? '';
      if (logo.isNotEmpty) map[_norm(e['name'] as String)] = logo;
    }

    final rawIndep = await rootBundle.loadString('assets/data/independents_enriched.json');
    final indeps = (jsonDecode(rawIndep) as List).cast<Map<String, dynamic>>();
    for (final e in indeps) {
      final logo = e['logo_url'] as String? ?? '';
      if (logo.isNotEmpty) map[_norm(e['name'] as String)] = logo;
    }

    _logoByNormName = map;
  }

  /// Synchronous logo lookup — returns empty string if not found or not loaded.
  static String findLogoUrl(String name) {
    if (_logoByNormName == null) return '';
    return _logoByNormName![_norm(name)] ?? '';
  }

  static List<Map<String, dynamic>> search(
      List<Map<String, dynamic>> chains, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return [];
    return chains
        .where((c) => (c['name'] as String).toLowerCase().contains(q))
        .take(8)
        .toList();
  }

  static String _norm(String name) =>
      name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
}

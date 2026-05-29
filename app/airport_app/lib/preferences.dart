import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppPreferences extends ChangeNotifier {
  static final AppPreferences instance = AppPreferences._();
  AppPreferences._();

  static const _darkModeKey = 'dark_mode';

  String _language = 'English (UK)';
  String _currency = 'GBP — British Pound';
  bool _darkMode = false;

  String get language => _language;
  String get currency => _currency;
  bool get darkMode => _darkMode;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _darkMode = prefs.getBool(_darkModeKey) ?? false;
    notifyListeners();
  }

  void setLanguage(String value) {
    if (_language == value) return;
    _language = value;
    notifyListeners();
  }

  void setCurrency(String value) {
    if (_currency == value) return;
    _currency = value;
    notifyListeners();
  }

  void setDarkMode(bool value) async {
    if (_darkMode == value) return;
    _darkMode = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    prefs.setBool(_darkModeKey, value);
  }
}

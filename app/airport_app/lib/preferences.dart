import 'package:flutter/material.dart';

class AppPreferences extends ChangeNotifier {
  static final AppPreferences instance = AppPreferences._();
  AppPreferences._();

  String _language = 'English (UK)';
  String _currency = 'GBP — British Pound';
  bool _darkMode = false;

  String get language => _language;
  String get currency => _currency;
  bool get darkMode => _darkMode;

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

  void setDarkMode(bool value) {
    if (_darkMode == value) return;
    _darkMode = value;
    notifyListeners();
  }
}

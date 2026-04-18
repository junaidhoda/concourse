import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ─────────────────────────────────────────────────────────────
//  COLOUR PALETTE (matches welcome_screen.dart)
// ─────────────────────────────────────────────────────────────
const Color kTeal      = Color(0xFF1AABAB);
const Color kTealDeep  = Color(0xFF0F7A7A);
const Color kGold      = Color(0xFFA8834A);
const Color kGoldLight = Color(0xFFC9A96E);
const Color kInk       = Color(0xFF0F1214);
const Color kPage      = Color(0xFFFAF8F4);

// ─────────────────────────────────────────────────────────────
//  APP THEME
// ─────────────────────────────────────────────────────────────
ThemeData get appTheme => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: kPage,
  colorScheme: ColorScheme.light(
    primary: kTeal,
    onPrimary: Colors.white,
    secondary: kGold,
    onSecondary: kInk,
    surface: kPage,
    onSurface: kInk,
    error: const Color(0xFFB00020),
    onError: Colors.white,
  ),
  appBarTheme: AppBarTheme(
    backgroundColor: kPage,
    foregroundColor: kInk,
    elevation: 0,
    titleTextStyle: GoogleFonts.jost(
      fontSize: 18,
      fontWeight: FontWeight.w500,
      color: kInk,
    ),
    iconTheme: const IconThemeData(color: kInk),
  ),
  textTheme: TextTheme(
    headlineLarge: GoogleFonts.cormorant(
      fontSize: 24,
      fontWeight: FontWeight.w600,
      color: kInk,
    ),
    headlineMedium: GoogleFonts.jost(
      fontSize: 20,
      fontWeight: FontWeight.w500,
      color: kInk,
    ),
    bodyLarge: GoogleFonts.jost(
      fontSize: 16,
      fontWeight: FontWeight.w400,
      color: kInk,
    ),
    bodyMedium: GoogleFonts.jost(
      fontSize: 14,
      fontWeight: FontWeight.w400,
      color: kInk,
    ),
    bodySmall: GoogleFonts.jost(
      fontSize: 12,
      fontWeight: FontWeight.w400,
      color: kInk.withOpacity(0.7),
    ),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: kTeal,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(3),
      ),
      textStyle: GoogleFonts.jost(
        fontSize: 11,
        fontWeight: FontWeight.w400,
        letterSpacing: 2.2,
      ),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: kInk,
      side: BorderSide(color: kGoldLight.withOpacity(0.4)),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(3),
      ),
      textStyle: GoogleFonts.jost(
        fontSize: 11,
        fontWeight: FontWeight.w400,
        letterSpacing: 2.2,
      ),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: kPage,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(3),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(3),
      borderSide: BorderSide(color: kGoldLight.withOpacity(0.3)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(3),
      borderSide: const BorderSide(color: kTeal, width: 1.5),
    ),
    hintStyle: GoogleFonts.jost(
      fontSize: 14,
      color: kInk.withOpacity(0.4),
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: kPage,
    indicatorColor: kTeal.withOpacity(0.15),
    labelTextStyle: MaterialStateProperty.resolveWith((states) {
      if (states.contains(MaterialState.selected)) {
        return GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w500, color: kTeal);
      }
      return GoogleFonts.jost(fontSize: 12, color: kInk.withOpacity(0.6));
    }),
    iconTheme: MaterialStateProperty.resolveWith((states) {
      if (states.contains(MaterialState.selected)) {
        return const IconThemeData(color: kTeal, size: 24);
      }
      return IconThemeData(color: kInk.withOpacity(0.6), size: 24);
    }),
    height: 64,
    elevation: 0,
  ),
  cardTheme: CardThemeData(
    color: Colors.white,
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(3),
      side: BorderSide(color: kGoldLight.withOpacity(0.2)),
    ),
  ),
);

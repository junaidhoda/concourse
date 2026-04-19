import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

// ─────────────────────────────────────────────────────────────
//  COLOUR PALETTE (matches welcome_screen.dart)
// ─────────────────────────────────────────────────────────────
const Color kTeal = Color(0xFF1AABAB);
const Color kTealDeep = Color(0xFF0F7A7A);
const Color kGold = Color(0xFFA8834A);
const Color kGoldLight = Color(0xFFC9A96E);
const Color kInk = Color(0xFF0F1214);
const Color kPage = Color(0xFFFAF8F4);

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
      fontSize: 13,
      fontWeight: FontWeight.w400,
      color: kInk.withValues(alpha: 0.78),
    ),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: kTeal,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      textStyle: GoogleFonts.jost(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 2.0,
      ),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: kInk,
      side: BorderSide(color: kGoldLight.withOpacity(0.4)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      textStyle: GoogleFonts.jost(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 2.0,
      ),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: kPage,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(3)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(3),
      borderSide: BorderSide(color: kGoldLight.withOpacity(0.3)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(3),
      borderSide: const BorderSide(color: kTeal, width: 1.5),
    ),
    hintStyle: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: kInk.withValues(alpha: 0.52)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: kPage,
    indicatorColor: kTeal.withOpacity(0.15),
    labelTextStyle: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.selected)) {
        return GoogleFonts.jost(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: kTeal,
        );
      }
      return GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: kInk.withValues(alpha: 0.72));
    }),
    iconTheme: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.selected)) {
        return const IconThemeData(color: kTeal, size: 24);
      }
      return IconThemeData(color: kInk.withValues(alpha: 0.72), size: 24);
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

// ─────────────────────────────────────────────────────────────
//  DARK THEME
// ─────────────────────────────────────────────────────────────
const Color kDarkPage = Color(0xFF0D1012);
const Color kDarkSurface = Color(0xFF161B1E);
const Color kDarkCard = Color(0xFF1C2226);

ThemeData get darkAppTheme => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: kDarkPage,
  colorScheme: ColorScheme.dark(
    primary: kTeal,
    onPrimary: Colors.white,
    secondary: kGoldLight,
    onSecondary: kDarkPage,
    surface: kDarkSurface,
    onSurface: Colors.white,
    error: const Color(0xFFCF6679),
    onError: Colors.white,
  ),
  appBarTheme: AppBarTheme(
    backgroundColor: kDarkPage,
    foregroundColor: Colors.white,
    elevation: 0,
    titleTextStyle: GoogleFonts.jost(
      fontSize: 18,
      fontWeight: FontWeight.w500,
      color: Colors.white,
    ),
    iconTheme: const IconThemeData(color: Colors.white),
  ),
  textTheme: TextTheme(
    headlineLarge: GoogleFonts.cormorant(
      fontSize: 24,
      fontWeight: FontWeight.w600,
      color: Colors.white,
    ),
    headlineMedium: GoogleFonts.jost(
      fontSize: 20,
      fontWeight: FontWeight.w500,
      color: Colors.white,
    ),
    bodyLarge: GoogleFonts.jost(
      fontSize: 16,
      fontWeight: FontWeight.w400,
      color: Colors.white,
    ),
    bodyMedium: GoogleFonts.jost(
      fontSize: 14,
      fontWeight: FontWeight.w400,
      color: Colors.white,
    ),
    bodySmall: GoogleFonts.jost(
      fontSize: 13,
      fontWeight: FontWeight.w400,
      color: Colors.white.withValues(alpha: 0.84),
    ),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: kTeal,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      textStyle: GoogleFonts.jost(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 2.0,
      ),
    ),
  ),
  cardTheme: CardThemeData(
    color: kDarkCard,
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(3),
      side: BorderSide(color: kGoldLight.withOpacity(0.15)),
    ),
  ),
);

// ─────────────────────────────────────────────────────────────
//  THEME HELPERS (user-controlled light/dark via app toggle)
// ─────────────────────────────────────────────────────────────

const List<Color> _kLightPageGradient = [
  Color(0xFFFDFBF6),
  Color(0xFFF8F5EE),
  Color(0xFFF2EDE3),
];

const List<Color> _kDarkPageGradient = [
  Color(0xFF0D1012),
  Color(0xFF111518),
  Color(0xFF141A1E),
];

List<Color> appPageGradientColors(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark ? _kDarkPageGradient : _kLightPageGradient;
}

Color appCardSurface(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark ? kDarkCard : Colors.white;
}

Color appInputFill(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark ? kDarkSurface : Colors.white;
}

SystemUiOverlayStyle appSystemUiOverlayStyle(BuildContext context) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    systemNavigationBarColor: dark ? kDarkSurface : kPage,
    systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
  );
}

extension AppThemeContext on BuildContext {
  Color get appOnSurface => Theme.of(this).colorScheme.onSurface;

  /// Secondary labels, hints, and chrome icons — lifts very low opacities so small Jost type stays readable.
  Color appMutedFg(double alpha, {bool relaxed = false}) {
    final dark = Theme.of(this).brightness == Brightness.dark;
    final floor = relaxed
        ? (dark ? 0.40 : 0.34)
        : (dark ? 0.52 : 0.46);
    final a = alpha < floor ? floor : alpha;
    return appOnSurface.withValues(alpha: a);
  }
}

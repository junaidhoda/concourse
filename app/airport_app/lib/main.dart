import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'services/chain_restaurant_service.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'firebase_options.dart';
import 'preferences.dart';
import 'theme/app_theme.dart';
import 'screens/home_screen.dart';
import 'screens/airport_explore_screen.dart';
import 'screens/airport_detail_screen.dart';
import 'screens/account_screen.dart';
import 'screens/createaccount_screen.dart';
import 'screens/more_screen.dart';
import 'screens/restaurant_detail_screen.dart';
import 'screens/welcome_screen.dart';
import 'screens/loading_screen.dart';
import 'screens/login_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/admin_login_screen.dart';
import 'screens/admin_dashboard_screen.dart';
import 'screens/admin_airport_screen.dart';
import 'screens/admin_restaurant_editor_screen.dart';
import 'screens/nearby_airports_screen.dart';
import 'services/auth_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await AppPreferences.instance.load();
  ChainRestaurantService.loadAll(); // fire-and-forget; cached before first airport screen
  runApp(const MyApp());
}

final GoRouter _router = GoRouter(
  initialLocation: '/loading',
  routes: [
    GoRoute(
      path: '/loading',
      builder: (context, state) => LoadingScreen(
        onComplete: () {
          if (AuthService.currentUser != null) {
            context.go('/explore');
          } else {
            context.go('/welcome');
          }
        },
      ),
    ),
    GoRoute(
      path: '/welcome',
      builder: (context, state) => const WelcomeScreen(),
    ),
    GoRoute(
      path: '/login',
      pageBuilder: (context, state) => const CupertinoPage(child: LoginScreen()),
    ),
    GoRoute(
      path: '/forgot-password',
      pageBuilder: (context, state) => const CupertinoPage(child: ForgotPasswordScreen()),
    ),
    ShellRoute(
      builder: (context, state, child) {
        return ScaffoldWithNavBar(child: child);
      },
      routes: [
        GoRoute(
          path: '/explore',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: HomeScreen(),
          ),
        ),
        GoRoute(
          path: '/airport-search',
          pageBuilder: (context, state) {
            final query = state.uri.queryParameters['q'] ?? '';
            return NoTransitionPage(
              child: AirportExploreScreen(initialQuery: query),
            );
          },
        ),
        GoRoute(
          path: '/account',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: AccountScreen(),
          ),
        ),
        GoRoute(
          path: '/more',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: MoreScreen(),
          ),
        ),
      ],
    ),
    GoRoute(
      path: '/nearby-airports',
      pageBuilder: (context, state) => const CupertinoPage(child: NearbyAirportsScreen()),
    ),
    GoRoute(
      path: '/airport-detail/:id',
      pageBuilder: (context, state) => CupertinoPage(
        child: AirportDetailScreen(airportId: state.pathParameters['id']!),
      ),
    ),
    GoRoute(
      path: '/signup',
      pageBuilder: (context, state) => const CupertinoPage(child: CreateAccountScreen()),
    ),
    GoRoute(
      path: '/restaurant-detail',
      pageBuilder: (context, state) {
        final extra = state.extra as Map<String, dynamic>;
        return CupertinoPage(
          child: RestaurantDetailScreen(
            restaurant: extra['restaurant'] as Restaurant,
            airportName: extra['airportName'] as String? ?? '',
          ),
        );
      },
    ),
    GoRoute(
      path: '/admin',
      pageBuilder: (context, state) => const CupertinoPage(child: AdminLoginScreen()),
    ),
    GoRoute(
      path: '/admin/dashboard',
      pageBuilder: (context, state) => const CupertinoPage(child: AdminDashboardScreen()),
    ),
    GoRoute(
      path: '/admin/airport/:airportCode',
      pageBuilder: (context, state) => CupertinoPage(
        child: AdminAirportScreen(airportCode: state.pathParameters['airportCode']!),
      ),
    ),
    GoRoute(
      path: '/admin/restaurant/:airportCode/:terminalId/:restaurantId',
      pageBuilder: (context, state) => CupertinoPage(
        child: AdminRestaurantEditorScreen(
          airportCode: state.pathParameters['airportCode']!,
          terminalId: state.pathParameters['terminalId']!,
          restaurantId: state.pathParameters['restaurantId'],
        ),
      ),
    ),
  ],
);

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppPreferences.instance,
      builder: (context, _) {
        final prefs = AppPreferences.instance;
        return MaterialApp.router(
          title: 'Concourse',
          debugShowCheckedModeBanner: false,
          theme: appTheme,
          darkTheme: darkAppTheme,
          themeMode: prefs.darkMode ? ThemeMode.dark : ThemeMode.light,
          themeAnimationDuration: Duration.zero,
          routerConfig: _router,
          builder: (context, child) => GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => FocusScope.of(context).unfocus(),
            child: child!,
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SCAFFOLD WITH CUSTOM NAV BAR
// ─────────────────────────────────────────────────────────────
class ScaffoldWithNavBar extends StatelessWidget {
  final Widget child;

  const ScaffoldWithNavBar({super.key, required this.child});

  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    if (location.startsWith('/explore')) return 0;
    if (location.startsWith('/airport-search')) return 1;
    if (location.startsWith('/account')) return 2;
    if (location.startsWith('/more')) return 3;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0: context.go('/explore');
      case 1: context.go('/airport-search');
      case 2: context.go('/account');
      case 3: context.go('/more');
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _calculateSelectedIndex(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF161B1E) : Colors.white;
    final borderColor = isDark ? kGoldLight.withValues(alpha: 0.12) : kGoldLight.withValues(alpha: 0.30);
    final unselectedColor = isDark ? Colors.white.withValues(alpha: 0.48) : kInk.withValues(alpha: 0.42);

    final tabs = [
      (Icons.home_outlined, Icons.home_rounded, 'Home'),
      (Icons.explore_outlined, Icons.explore_rounded, 'Explore'),
      (Icons.person_outline_rounded, Icons.person_rounded, 'Account'),
      (Icons.more_horiz_rounded, Icons.more_horiz_rounded, 'More'),
    ];

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: bgColor,
          border: Border(top: BorderSide(color: borderColor, width: 1)),
          boxShadow: [
            BoxShadow(
              color: kInk.withValues(alpha: isDark ? 0.20 : 0.06),
              blurRadius: 12,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 62,
            child: Row(
              children: List.generate(tabs.length, (i) {
                final isSelected = i == selectedIndex;
                final (outlinedIcon, filledIcon, label) = tabs[i];
                return Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _onTap(context, i),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Teal indicator line above selected tab
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: isSelected ? 24 : 0,
                          height: 2,
                          margin: const EdgeInsets.only(bottom: 6),
                          decoration: BoxDecoration(
                            color: kTeal,
                            borderRadius: BorderRadius.circular(1),
                          ),
                        ),
                        Icon(
                          isSelected ? filledIcon : outlinedIcon,
                          size: 22,
                          color: isSelected ? kTeal : unselectedColor,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          label,
                          style: GoogleFonts.jost(
                            fontSize: 11,
                            fontWeight: isSelected ? FontWeight.w500 : FontWeight.w400,
                            letterSpacing: 0.5,
                            color: isSelected ? kTeal : unselectedColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

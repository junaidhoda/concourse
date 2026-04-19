import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      body: Stack(
        children: [
          const _Background(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
              children: [
                // Header
                Text(
                  'Account',
                  style: GoogleFonts.cormorant(
                    fontSize: 36,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.3,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  'Sign in to save your favourites',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    fontWeight: FontWeight.w300,
                    letterSpacing: 2.2,
                    color: kInk.withValues(alpha: 0.40),
                  ),
                ),
                const SizedBox(height: 14),
                _rule(),
                const SizedBox(height: 28),

                // Avatar
                Center(
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          color: kTeal.withValues(alpha: 0.10),
                          shape: BoxShape.circle,
                          border: Border.all(color: kGoldLight.withValues(alpha: 0.35), width: 1),
                        ),
                        child: Icon(Icons.person_outline_rounded, size: 40, color: kTeal.withValues(alpha: 0.70)),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: kTeal,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: const Icon(Icons.add, size: 14, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Guest label
                Center(
                  child: Text(
                    'Guest',
                    style: GoogleFonts.cormorant(
                      fontSize: 26,
                      fontWeight: FontWeight.w400,
                      color: kInk,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: Text(
                    'Not signed in',
                    style: GoogleFonts.jost(
                      fontSize: 11,
                      fontWeight: FontWeight.w300,
                      letterSpacing: 1.8,
                      color: kInk.withValues(alpha: 0.35),
                    ),
                  ),
                ),
                const SizedBox(height: 28),

                // Sign-in card
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                    boxShadow: [
                      BoxShadow(color: kInk.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Teal accent line
                      Container(
                        height: 2,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [kTeal.withValues(alpha: 0.5), Colors.transparent],
                          ),
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                      Text(
                        'Join Concourse',
                        style: GoogleFonts.cormorant(
                          fontSize: 22,
                          fontWeight: FontWeight.w500,
                          color: kInk,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Save favourite airports, bookmark restaurants, and get personalised dining recommendations.',
                        style: GoogleFonts.jost(
                          fontSize: 13,
                          fontWeight: FontWeight.w300,
                          color: kInk.withValues(alpha: 0.55),
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 20),
                      // Sign up button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => context.push('/signup'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: kTeal,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                            elevation: 0,
                          ),
                          child: Text(
                            'CREATE ACCOUNT',
                            style: GoogleFonts.jost(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 2.2,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      // Log in button
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => context.push('/login'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: kInk,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            side: BorderSide(color: kGoldLight.withValues(alpha: 0.50)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                          ),
                          child: Text(
                            'LOG IN',
                            style: GoogleFonts.jost(
                              fontSize: 11,
                              fontWeight: FontWeight.w400,
                              letterSpacing: 2.2,
                              color: kInk.withValues(alpha: 0.70),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Benefits section
                _SectionHeader(title: 'Benefits'),
                const SizedBox(height: 14),
                _BenefitRow(
                  icon: Icons.bookmark_outline_rounded,
                  title: 'Save Favourites',
                  subtitle: 'Bookmark airports and restaurants for quick access',
                ),
                const SizedBox(height: 10),
                _BenefitRow(
                  icon: Icons.notifications_none_rounded,
                  title: 'Flight Alerts',
                  subtitle: 'Get notified when dining options change at your airport',
                ),
                const SizedBox(height: 10),
                _BenefitRow(
                  icon: Icons.star_outline_rounded,
                  title: 'Personalised Picks',
                  subtitle: 'Recommendations based on your preferences',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rule() {
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            kGoldLight.withValues(alpha: 0.28),
            kInk.withValues(alpha: 0.08),
            Colors.transparent,
          ],
          stops: const [0.0, 0.3, 0.7, 1.0],
        ),
      ),
    );
  }
}

class _BenefitRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _BenefitRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [
          BoxShadow(color: kInk.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: kTeal.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Icon(icon, color: kTeal, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w400,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.w300,
                    color: kInk.withValues(alpha: 0.40),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: GoogleFonts.cormorant(
            fontSize: 22,
            fontWeight: FontWeight.w400,
            color: kInk,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent],
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Transform.rotate(
          angle: math.pi / 4,
          child: Container(
            width: 4,
            height: 4,
            color: kGoldLight.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  const _Background();
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFDFBF6), Color(0xFFF8F5EE), Color(0xFFF2EDE3)],
          stops: [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

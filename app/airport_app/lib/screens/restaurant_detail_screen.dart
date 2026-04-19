import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class RestaurantDetailScreen extends StatelessWidget {
  final String name;
  final String cuisine;
  final String location;
  final bool isOpen;
  final String logoUrl;
  final String airportName;

  const RestaurantDetailScreen({
    super.key,
    required this.name,
    required this.cuisine,
    required this.location,
    required this.isOpen,
    required this.logoUrl,
    this.airportName = '',
  });

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            _Background(),
            SafeArea(
            child: CustomScrollView(
              slivers: [
                // Header
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Back button row
                        Row(
                          children: [
                            GestureDetector(
                              onTap: () => context.pop(),
                              child: Container(
                                padding: const EdgeInsets.all(9),
                                decoration: BoxDecoration(
                                  color: appCardSurface(context),
                                  borderRadius: BorderRadius.circular(3),
                                  border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                                  boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2))],
                                ),
                                child: Icon(Icons.arrow_back_ios_new, size: 13, color: context.appOnSurface.withValues(alpha: 0.55)),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                cuisine,
                                style: GoogleFonts.jost(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w400,
                                  letterSpacing: 2.0,
                                  color: context.appMutedFg(0.40),
                                ),
                              ),
                            ),
                            // Status indicator
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 6, height: 6,
                                  decoration: BoxDecoration(color: isOpen ? kTeal : kGold, shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  isOpen ? 'Open' : 'Closed',
                                  style: GoogleFonts.jost(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w400,
                                    letterSpacing: 1.0,
                                    color: isOpen ? kTeal : kGold,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        // Gold rule
                        Container(
                          height: 1,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28), context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
                              stops: const [0.0, 0.3, 0.7, 1.0],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Logo header
                SliverToBoxAdapter(
                  child: Container(
                    width: double.infinity,
                    height: 180,
                    margin: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                    decoration: BoxDecoration(
                      color: kTeal.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: Stack(
                        children: [
                          // Teal accent line
                          Positioned(
                            top: 0, left: 0, right: 0,
                            child: Container(
                              height: 2,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(colors: [kTeal.withValues(alpha: 0.5), Colors.transparent]),
                              ),
                            ),
                          ),
                          Center(
                            child: Container(
                              width: 96, height: 96,
                              decoration: BoxDecoration(
                                color: appCardSurface(context),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                                boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Image.network(
                                  logoUrl,
                                  fit: BoxFit.contain,
                                  errorBuilder: (context, error, stackTrace) => Center(
                                    child: Icon(_getRestaurantIcon(cuisine), size: 40, color: kTeal),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // Content
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Name
                        Text(
                          name,
                          style: GoogleFonts.cormorant(
                            fontSize: 30,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.2,
                            color: context.appOnSurface,
                          ),
                        ),
                        const SizedBox(height: 18),

                        // Details section
                        _SectionHeader(title: 'Details'),
                        const SizedBox(height: 14),
                        _InfoCard(icon: Icons.restaurant_menu_rounded, label: 'Cuisine', value: cuisine),
                        const SizedBox(height: 10),
                        _InfoCard(icon: Icons.location_on_outlined, label: 'Location', value: location),
                        if (airportName.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          _InfoCard(icon: Icons.flight_rounded, label: 'Airport', value: airportName),
                        ],
                        const SizedBox(height: 24),

                        // Menu section
                        _SectionHeader(title: 'Menu'),
                        const SizedBox(height: 14),
                        _PlaceholderCard(
                          icon: Icons.menu_book_rounded,
                          message: 'Menu coming soon',
                          subtitle: 'Full menus will be available in a future update',
                        ),
                        const SizedBox(height: 24),

                        // Reviews section
                        _SectionHeader(title: 'Reviews'),
                        const SizedBox(height: 14),
                        _PlaceholderCard(
                          icon: Icons.rate_review_outlined,
                          message: 'No reviews yet',
                          subtitle: 'Be the first to review this restaurant',
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }

  IconData _getRestaurantIcon(String cuisine) {
    switch (cuisine.toLowerCase()) {
      case 'coffee': return Icons.coffee;
      case 'pub' || 'bar': return Icons.local_bar;
      case 'pizza': return Icons.local_pizza;
      case 'burger': return Icons.fastfood;
      case 'asian': return Icons.ramen_dining;
      case 'breakfast': return Icons.breakfast_dining;
      case 'sandwich': return Icons.lunch_dining;
      case 'dessert': return Icons.cake;
      case 'juice bar': return Icons.local_drink;
      default: return Icons.restaurant;
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  INFO CARD
// ─────────────────────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoCard({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(3)),
            child: Icon(icon, color: kTeal, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 1.8, color: context.appMutedFg(0.38)),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface),
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
//  PLACEHOLDER CARD
// ─────────────────────────────────────────────────────────────
class _PlaceholderCard extends StatelessWidget {
  final IconData icon;
  final String message;
  final String subtitle;

  const _PlaceholderCard({required this.icon, required this.message, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          Icon(icon, size: 36, color: context.appMutedFg(0.28, relaxed: true)),
          const SizedBox(height: 12),
          Text(message, style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44))),
          const SizedBox(height: 4),
          Text(subtitle, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: context.appMutedFg(0.36), letterSpacing: 0.3), textAlign: TextAlign.center),
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
        Text(title, style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w400, color: context.appOnSurface, letterSpacing: 0.2)),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])),
          ),
        ),
        const SizedBox(width: 6),
        Transform.rotate(angle: math.pi / 4, child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6))),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: appPageGradientColors(context),
          stops: const [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

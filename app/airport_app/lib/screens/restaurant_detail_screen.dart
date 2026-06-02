import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import 'airport_detail_screen.dart';

class RestaurantDetailScreen extends StatelessWidget {
  final Restaurant restaurant;
  final String airportName;

  const RestaurantDetailScreen({
    super.key,
    required this.restaurant,
    this.airportName = '',
  });

  @override
  Widget build(BuildContext context) {
    final dietaryLabels = [
      if (restaurant.isVegan) 'Vegan',
      if (restaurant.isVegetarian) 'Vegetarian',
      if (restaurant.isHalal) 'Halal',
      if (restaurant.isKosher) 'Kosher',
      if (restaurant.isGlutenFree) 'Gluten-Free',
    ];

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
                  // ── Header ─────────────────────────────────
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
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
                              Text(
                                restaurant.cuisine,
                                style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 2.0, color: context.appMutedFg(0.40)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
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

                  // ── Icon banner ────────────────────────────
                  SliverToBoxAdapter(
                    child: Container(
                      width: double.infinity,
                      height: 140,
                      margin: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                      decoration: BoxDecoration(
                        color: kTeal.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                      ),
                      child: Stack(
                        children: [
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
                              width: 80, height: 80,
                              decoration: BoxDecoration(
                                color: appCardSurface(context),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                                boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
                              ),
                              child: Icon(_getRestaurantIcon(restaurant.cuisine), size: 36, color: kTeal),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // ── Content ────────────────────────────────
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            restaurant.name,
                            style: GoogleFonts.cormorant(fontSize: 30, fontWeight: FontWeight.w500, letterSpacing: 0.2, color: context.appOnSurface),
                          ),

                          if (restaurant.description.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              restaurant.description,
                              style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: context.appMutedFg(0.60), height: 1.6),
                            ),
                          ],

                          const SizedBox(height: 22),

                          // Dietary badges
                          if (dietaryLabels.isNotEmpty) ...[
                            _SectionHeader(title: 'Dietary'),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: dietaryLabels.map((label) => _DietaryBadge(label: label)).toList(),
                            ),
                            const SizedBox(height: 24),
                          ],

                          // Locations
                          _SectionHeader(title: restaurant.outlets.length > 1 ? 'Locations' : 'Location'),
                          const SizedBox(height: 12),
                          ...restaurant.outlets.map((outlet) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _OutletCard(outlet: outlet),
                          )),

                          // Airport + website
                          if (airportName.isNotEmpty || restaurant.website.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            if (airportName.isNotEmpty) ...[
                              _InfoCard(icon: Icons.flight_rounded, label: 'Airport', value: airportName),
                              const SizedBox(height: 10),
                            ],
                            if (restaurant.website.isNotEmpty)
                              _InfoCard(icon: Icons.language_rounded, label: 'Website', value: restaurant.website),
                          ],

                          const SizedBox(height: 24),

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
    final c = cuisine.toLowerCase();
    if (c.contains('lounge')) return Icons.airline_seat_recline_extra_rounded;
    if (c.contains('coffee') || c.contains('café') || c.contains('cafe') || c.contains('espresso')) return Icons.coffee;
    if (c.contains('pub') || c.contains('bar')) return Icons.local_bar;
    if (c.contains('pizza')) return Icons.local_pizza;
    if (c.contains('burger') || c.contains('fast food')) return Icons.fastfood;
    if (c.contains('asian') || c.contains('sushi') || c.contains('noodle') || c.contains('ramen')) return Icons.ramen_dining;
    if (c.contains('breakfast')) return Icons.breakfast_dining;
    if (c.contains('sandwich')) return Icons.lunch_dining;
    if (c.contains('dessert') || c.contains('cake') || c.contains('doughnut') || c.contains('ice cream')) return Icons.cake;
    if (c.contains('juice')) return Icons.local_drink;
    if (c.contains('bakery') || c.contains('bread')) return Icons.bakery_dining;
    return Icons.restaurant;
  }
}

// ─────────────────────────────────────────────────────────────
//  OUTLET CARD
// ─────────────────────────────────────────────────────────────
class _OutletCard extends StatelessWidget {
  final RestaurantOutlet outlet;
  const _OutletCard({required this.outlet});

  String _airsideLabel(String airside) => switch (airside.toLowerCase()) {
    'airside' => 'After security',
    'landside' => 'Before security',
    'both' => 'Airside & landside',
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final security = _airsideLabel(outlet.airside);
    final subtitle = [security, outlet.level].where((s) => s.isNotEmpty).join(' · ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(3)),
            child: const Icon(Icons.location_on_rounded, color: kTeal, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (outlet.gateArea.isNotEmpty)
                  Text(
                    outlet.gateArea,
                    style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: context.appOnSurface),
                  ),
                if (subtitle.isNotEmpty) ...[
                  SizedBox(height: outlet.gateArea.isNotEmpty ? 2 : 0),
                  Text(
                    subtitle,
                    style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 0.3, color: context.appMutedFg(0.45)),
                  ),
                ],
                if (outlet.locationNotes.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.directions_rounded, size: 12, color: context.appMutedFg(0.40)),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          outlet.locationNotes,
                          style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: context.appMutedFg(0.55), height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  DIETARY BADGE
// ─────────────────────────────────────────────────────────────
class _DietaryBadge extends StatelessWidget {
  final String label;
  const _DietaryBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: kTeal.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kTeal.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 0.5, color: kTeal),
      ),
    );
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
                Text(label, style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 1.8, color: context.appMutedFg(0.38))),
                const SizedBox(height: 2),
                Text(value, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface)),
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

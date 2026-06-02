import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import 'airport_detail_screen.dart';

class RestaurantDetailScreen extends StatefulWidget {
  final Restaurant restaurant;
  final String airportName;

  const RestaurantDetailScreen({
    super.key,
    required this.restaurant,
    this.airportName = '',
  });

  @override
  State<RestaurantDetailScreen> createState() => _RestaurantDetailScreenState();
}

class _RestaurantDetailScreenState extends State<RestaurantDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Restaurant get r => widget.restaurant;

  // ── Helpers ──────────────────────────────────────────────────

  bool get _hasOpeningHours {
    if (r.open247 || r.openingHours.isNotEmpty) return true;
    return [r.openingMonday, r.openingTuesday, r.openingWednesday,
            r.openingThursday, r.openingFriday, r.openingSaturday, r.openingSunday]
        .any((s) => s.isNotEmpty);
  }

  bool get _hasFeatures =>
      r.takeaway.isNotEmpty || r.delivery.isNotEmpty ||
      r.reservable.isNotEmpty || r.wheelchairAccessible.isNotEmpty ||
      r.kidsMenu.isNotEmpty;

  List<(String, IconData)> get _featureLabels {
    final labels = <(String, IconData)>[];
    if (r.takeaway.toLowerCase() == 'yes')   labels.add(('Takeaway', Icons.takeout_dining_rounded));
    if (r.takeaway.toLowerCase() == 'only')  labels.add(('Takeaway only', Icons.takeout_dining_rounded));
    if (r.delivery.toLowerCase() == 'yes')   labels.add(('Delivery', Icons.delivery_dining_rounded));
    if (r.reservable.toLowerCase() == 'yes') labels.add(('Reservations', Icons.event_available_rounded));
    if (r.wheelchairAccessible.toLowerCase() == 'yes')     labels.add(('Wheelchair accessible', Icons.accessible_rounded));
    if (r.wheelchairAccessible.toLowerCase() == 'limited') labels.add(('Limited access', Icons.accessible_forward_rounded));
    if (r.kidsMenu.toLowerCase() == 'yes') labels.add(('Kids menu', Icons.child_care_rounded));
    return labels;
  }

  IconData get _cuisineIcon {
    final c = r.cuisine.toLowerCase();
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

  String _airsideLabel(String a) => switch (a.toLowerCase()) {
    'airside'  => 'After security',
    'landside' => 'Before security',
    'both'     => 'Airside & landside',
    _          => '',
  };

  // ── Build ─────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final firstOutlet = r.outlets.isNotEmpty ? r.outlets.first : null;
    final airsideLabel = firstOutlet != null ? _airsideLabel(firstOutlet.airside) : '';
    final floorLevel = firstOutlet?.level ?? '';
    final terminalName = r.terminalName ?? r.terminalId ?? '';

    final dietaryLabels = [
      if (r.isVegan) 'Vegan',
      if (r.isVegetarian) 'Vegetarian',
      if (r.isHalal) 'Halal',
      if (r.isKosher) 'Kosher',
      if (r.isGlutenFree) 'Gluten-Free',
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: bg,
        body: Stack(
          children: [
            _Background(),
            CustomScrollView(
              slivers: [
                // ── Collapsing hero ──────────────────────────
                SliverAppBar(
                  expandedHeight: 260,
                  pinned: true,
                  stretch: true,
                  backgroundColor: bg,
                  surfaceTintColor: Colors.transparent,
                  elevation: 0,
                  shadowColor: Colors.transparent,
                  automaticallyImplyLeading: false,
                  leading: Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 16),
                      child: _backButton(context),
                    ),
                  ),
                  title: Text(
                    r.name,
                    style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w600, color: context.appOnSurface, letterSpacing: 0.2),
                  ),
                  flexibleSpace: LayoutBuilder(
                    builder: (context, constraints) {
                      final topPadding = MediaQuery.of(context).padding.top;
                      final expandedMax = 260.0 + topPadding;
                      final collapsedMin = kToolbarHeight + topPadding;
                      final t = ((expandedMax - constraints.maxHeight) / (expandedMax - collapsedMin)).clamp(0.0, 1.0);
                      final textOpacity = (1.0 - t * 2.0).clamp(0.0, 1.0);

                      return Stack(
                        fit: StackFit.expand,
                        clipBehavior: Clip.none,
                        children: [
                          // Hero background
                          Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [Color(0xFF0A2530), Color(0xFF0F3D4E), Color(0xFF0A2530)],
                                stops: [0.0, 0.5, 1.0],
                              ),
                            ),
                          ),
                          // Subtle grid texture
                          Opacity(
                            opacity: 0.04,
                            child: CustomPaint(painter: _GridPainter()),
                          ),
                          // Teal top accent
                          Positioned(
                            top: 0, left: 0, right: 0,
                            child: Container(
                              height: 2,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(colors: [kTeal.withValues(alpha: 0.6), Colors.transparent]),
                              ),
                            ),
                          ),
                          // Centred icon
                          Center(
                            child: Container(
                              width: 80, height: 80,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: kTeal.withValues(alpha: 0.35)),
                                boxShadow: [BoxShadow(color: kTeal.withValues(alpha: 0.12), blurRadius: 20, spreadRadius: 2)],
                              ),
                              child: Icon(_cuisineIcon, size: 36, color: kTeal),
                            ),
                          ),
                          // Bottom fade into scaffold
                          Positioned(
                            bottom: 0, left: 0, right: 0,
                            child: Container(
                              height: 90,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [Colors.transparent, bg],
                                ),
                              ),
                            ),
                          ),
                          // Name + cuisine overlay (fades on collapse)
                          if (textOpacity > 0)
                            Positioned(
                              bottom: 16, left: 24, right: 24,
                              child: Opacity(
                                opacity: textOpacity,
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            r.name,
                                            style: GoogleFonts.cormorant(fontSize: 24, fontWeight: FontWeight.w600, color: context.appOnSurface, letterSpacing: 0.2, height: 1.15),
                                          ),
                                          if (r.cuisine.isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              r.cuisine,
                                              style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 1.4, color: context.appMutedFg(0.42)),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    if (terminalName.isNotEmpty)
                                      Text(
                                        terminalName,
                                        style: GoogleFonts.cormorant(fontSize: 16, fontWeight: FontWeight.w400, color: kTeal, letterSpacing: 0.6),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),

                // ── Location chips + dietary ─────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _rule(context),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (terminalName.isNotEmpty)
                              _LocationChip(icon: Icons.flight_takeoff_rounded, label: terminalName),
                            if (airsideLabel.isNotEmpty)
                              _LocationChip(icon: Icons.security_rounded, label: airsideLabel),
                            if (floorLevel.isNotEmpty)
                              _LocationChip(icon: Icons.layers_rounded, label: floorLevel),
                          ],
                        ),
                        if (dietaryLabels.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: dietaryLabels.map((l) => _DietaryBadge(label: l)).toList(),
                          ),
                        ],
                        const SizedBox(height: 14),
                      ],
                    ),
                  ),
                ),

                // ── Pinned tab bar ────────────────────────────
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _StickyHeaderDelegate(
                    minHeight: 62,
                    maxHeight: 62,
                    child: Container(
                      color: bg,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                            child: Row(
                              children: [
                                Expanded(child: _TabSegment(label: 'Info', icon: Icons.info_outline_rounded, index: 0, ctrl: _tabCtrl)),
                                const SizedBox(width: 10),
                                Expanded(child: _TabSegment(label: 'Reviews', icon: Icons.rate_review_outlined, index: 1, ctrl: _tabCtrl)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                      ),
                    ),
                  ),
                ),

                // ── Tab content ───────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 48),
                    child: _tabCtrl.index == 0
                        ? _buildInfoTab(context)
                        : _buildReviewsTab(context),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Info tab ──────────────────────────────────────────────────
  Widget _buildInfoTab(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: r.outlets.length > 1 ? 'Locations' : 'Location'),
        const SizedBox(height: 12),
        ...r.outlets.map((outlet) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _OutletCard(outlet: outlet),
        )),

        if (_hasOpeningHours) ...[
          const SizedBox(height: 24),
          const _SectionHeader(title: 'Opening Hours'),
          const SizedBox(height: 12),
          _OpeningHoursCard(restaurant: r),
        ],

        if (_hasFeatures) ...[
          const SizedBox(height: 24),
          const _SectionHeader(title: 'Features'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _featureLabels.map((f) => _FeatureBadge(label: f.$1, icon: f.$2)).toList(),
          ),
        ],

        if (widget.airportName.isNotEmpty || r.phone.isNotEmpty || r.website.isNotEmpty) ...[
          const SizedBox(height: 24),
          const _SectionHeader(title: 'Details'),
          const SizedBox(height: 12),
          if (widget.airportName.isNotEmpty) ...[
            _InfoCard(icon: Icons.flight_rounded, label: 'Airport', value: widget.airportName),
            const SizedBox(height: 10),
          ],
          if (r.phone.isNotEmpty) ...[
            _InfoCard(icon: Icons.phone_rounded, label: 'Phone', value: r.phone),
            const SizedBox(height: 10),
          ],
          if (r.website.isNotEmpty)
            _InfoCard(icon: Icons.language_rounded, label: 'Website', value: r.website),
        ],
      ],
    );
  }

  // ── Reviews tab ───────────────────────────────────────────────
  Widget _buildReviewsTab(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'Reviews'),
        const SizedBox(height: 14),
        _PlaceholderCard(
          icon: Icons.rate_review_outlined,
          message: 'No reviews yet',
          subtitle: 'Be the first to review this restaurant',
        ),
      ],
    );
  }

  // ── Shared helpers ────────────────────────────────────────────
  Widget _backButton(BuildContext context) {
    return GestureDetector(
      onTap: () => context.pop(),
      child: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        ),
        child: Icon(Icons.arrow_back_ios_new, size: 13, color: Colors.white.withValues(alpha: 0.85)),
      ),
    );
  }

  Widget _rule(BuildContext context) => Container(
    height: 1,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28), context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
        stops: const [0.0, 0.3, 0.7, 1.0],
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  GRID PAINTER (subtle texture for the hero)
// ─────────────────────────────────────────────────────────────
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 0.5;
    const step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => false;
}

// ─────────────────────────────────────────────────────────────
//  TAB SEGMENT
// ─────────────────────────────────────────────────────────────
class _TabSegment extends StatelessWidget {
  final String label;
  final IconData icon;
  final int index;
  final TabController ctrl;
  const _TabSegment({required this.label, required this.icon, required this.index, required this.ctrl});

  @override
  Widget build(BuildContext context) {
    final selected = ctrl.index == index;
    return GestureDetector(
      onTap: () => ctrl.animateTo(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 38,
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: selected ? kTeal : kGoldLight.withValues(alpha: 0.28),
            width: selected ? 1.5 : 1.0,
          ),
          boxShadow: selected
              ? [BoxShadow(color: kTeal.withValues(alpha: 0.14), blurRadius: 8, offset: const Offset(0, 2))]
              : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.05), blurRadius: 5, offset: const Offset(0, 1))],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: selected ? kTeal : context.appMutedFg(0.42)),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
                letterSpacing: 0.3,
                color: selected ? kTeal : context.appMutedFg(0.42),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  STICKY HEADER DELEGATE
// ─────────────────────────────────────────────────────────────
class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double minHeight;
  final double maxHeight;
  final Widget child;
  const _StickyHeaderDelegate({required this.minHeight, required this.maxHeight, required this.child});

  @override double get minExtent => minHeight;
  @override double get maxExtent => maxHeight;
  @override Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => child;
  @override bool shouldRebuild(_StickyHeaderDelegate old) =>
      minHeight != old.minHeight || maxHeight != old.maxHeight || child != old.child;
}

// ─────────────────────────────────────────────────────────────
//  LOCATION CHIP
// ─────────────────────────────────────────────────────────────
class _LocationChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _LocationChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: appCardSurface(context),
      borderRadius: BorderRadius.circular(3),
      border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
      boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 1))],
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: context.appMutedFg(0.40)),
        const SizedBox(width: 5),
        Text(label, style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 0.3, color: context.appMutedFg(0.55))),
      ],
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  OUTLET CARD
// ─────────────────────────────────────────────────────────────
class _OutletCard extends StatelessWidget {
  final RestaurantOutlet outlet;
  const _OutletCard({required this.outlet});

  String _airsideLabel(String a) => switch (a.toLowerCase()) {
    'airside'  => 'After security',
    'landside' => 'Before security',
    'both'     => 'Airside & landside',
    _          => '',
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
                  Text(outlet.gateArea, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: context.appOnSurface)),
                if (subtitle.isNotEmpty) ...[
                  SizedBox(height: outlet.gateArea.isNotEmpty ? 2 : 0),
                  Text(subtitle, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 0.3, color: context.appMutedFg(0.45))),
                ],
                if (outlet.locationNotes.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.directions_rounded, size: 12, color: context.appMutedFg(0.40)),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(outlet.locationNotes, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: context.appMutedFg(0.55), height: 1.4)),
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
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: kTeal.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(3),
      border: Border.all(color: kTeal.withValues(alpha: 0.25)),
    ),
    child: Text(label, style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 0.5, color: kTeal)),
  );
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
  Widget build(BuildContext context) => Container(
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

// ─────────────────────────────────────────────────────────────
//  PLACEHOLDER CARD
// ─────────────────────────────────────────────────────────────
class _PlaceholderCard extends StatelessWidget {
  final IconData icon;
  final String message;
  final String subtitle;
  const _PlaceholderCard({required this.icon, required this.message, required this.subtitle});

  @override
  Widget build(BuildContext context) => Container(
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

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) => Row(
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

// ─────────────────────────────────────────────────────────────
//  OPENING HOURS CARD
// ─────────────────────────────────────────────────────────────
class _OpeningHoursCard extends StatelessWidget {
  final Restaurant restaurant;
  const _OpeningHoursCard({required this.restaurant});

  @override
  Widget build(BuildContext context) {
    if (restaurant.open247) {
      return const _InfoCard(icon: Icons.access_time_rounded, label: 'Hours', value: 'Open 24/7');
    }

    final days = [
      ('Monday',    restaurant.openingMonday),
      ('Tuesday',   restaurant.openingTuesday),
      ('Wednesday', restaurant.openingWednesday),
      ('Thursday',  restaurant.openingThursday),
      ('Friday',    restaurant.openingFriday),
      ('Saturday',  restaurant.openingSaturday),
      ('Sunday',    restaurant.openingSunday),
    ];

    if (!days.any((d) => d.$2.isNotEmpty)) {
      return _InfoCard(icon: Icons.access_time_rounded, label: 'Hours', value: restaurant.openingHours);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: days.map((d) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              SizedBox(
                width: 96,
                child: Text(d.$1, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 0.3, color: context.appMutedFg(0.45))),
              ),
              Expanded(
                child: Text(
                  d.$2.isEmpty ? '—' : d.$2,
                  style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400,
                      color: d.$2.isEmpty ? context.appMutedFg(0.28) : context.appOnSurface),
                ),
              ),
            ],
          ),
        )).toList(),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  FEATURE BADGE
// ─────────────────────────────────────────────────────────────
class _FeatureBadge extends StatelessWidget {
  final String label;
  final IconData icon;
  const _FeatureBadge({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: kTeal.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(3),
      border: Border.all(color: kTeal.withValues(alpha: 0.25)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: kTeal),
        const SizedBox(width: 5),
        Text(label, style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 0.5, color: kTeal)),
      ],
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
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

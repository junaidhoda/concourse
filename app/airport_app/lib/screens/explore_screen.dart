import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  DATA MODEL
// ─────────────────────────────────────────────────────────────
class _Airport {
  final String id;
  final String iata;
  final String name;
  final String city;
  final String country;
  final String flag; // emoji flag
  final int venueCount;
  const _Airport({
    required this.id,
    required this.iata,
    required this.name,
    required this.city,
    required this.country,
    required this.flag,
    required this.venueCount,
  });
}

const _kAirports = [
  _Airport(id: 'BHX', iata: 'BHX', name: 'Birmingham Airport', city: 'Birmingham', country: 'United Kingdom', flag: '🇬🇧', venueCount: 28),
  _Airport(id: 'BKK', iata: 'BKK', name: 'Bangkok Suvarnabhumi', city: 'Bangkok', country: 'Thailand', flag: '🇹🇭', venueCount: 110),
  _Airport(id: 'CDG', iata: 'CDG', name: 'Paris Charles de Gaulle', city: 'Paris', country: 'France', flag: '🇫🇷', venueCount: 72),
  _Airport(id: 'DXB', iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'UAE', flag: '🇦🇪', venueCount: 120),
  _Airport(id: 'FRA', iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', flag: '🇩🇪', venueCount: 58),
  _Airport(id: 'IST', iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', flag: '🇹🇷', venueCount: 64),
  _Airport(id: 'JFK', iata: 'JFK', name: 'New York John F. Kennedy', city: 'New York', country: 'USA', flag: '🇺🇸', venueCount: 68),
  _Airport(id: 'LAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA', flag: '🇺🇸', venueCount: 52),
  _Airport(id: 'LGW', iata: 'LGW', name: 'London Gatwick', city: 'London', country: 'United Kingdom', flag: '🇬🇧', venueCount: 44),
  _Airport(id: 'LHR', iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'United Kingdom', flag: '🇬🇧', venueCount: 84),
  _Airport(id: 'MAN', iata: 'MAN', name: 'Manchester Airport', city: 'Manchester', country: 'United Kingdom', flag: '🇬🇧', venueCount: 36),
  _Airport(id: 'SIN', iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', flag: '🇸🇬', venueCount: 96),
];

const _kFeatured = [
  _Airport(id: 'LHR', iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'United Kingdom', flag: '🇬🇧', venueCount: 84),
  _Airport(id: 'DXB', iata: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'UAE', flag: '🇦🇪', venueCount: 120),
  _Airport(id: 'SIN', iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', flag: '🇸🇬', venueCount: 96),
  _Airport(id: 'CDG', iata: 'CDG', name: 'Paris CDG', city: 'Paris', country: 'France', flag: '🇫🇷', venueCount: 72),
  _Airport(id: 'JFK', iata: 'JFK', name: 'New York JFK', city: 'New York', country: 'USA', flag: '🇺🇸', venueCount: 68),
];

// ─────────────────────────────────────────────────────────────
//  EXPLORE SCREEN
// ─────────────────────────────────────────────────────────────
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> with TickerProviderStateMixin {
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  List<_Airport> _results = [];
  bool _hasQuery = false;

  // Staggered fade-up controllers
  late final AnimationController _headerCtrl;
  late final AnimationController _actionsCtrl;
  late final AnimationController _featuredCtrl;
  late final AnimationController _ruleCtrl;

  void _delayed(int ms, AnimationController c) => Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl = AnimationController(vsync: this, duration: dur);
    _actionsCtrl = AnimationController(vsync: this, duration: dur);
    _featuredCtrl = AnimationController(vsync: this, duration: dur);
    _ruleCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));

    _delayed(150, _headerCtrl);
    _delayed(250, _actionsCtrl);
    _delayed(380, _featuredCtrl);
    _delayed(500, _ruleCtrl);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    for (final c in [_headerCtrl, _actionsCtrl, _featuredCtrl, _ruleCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  void _onSearchChanged(String value) {
    final q = value.trim().toLowerCase();
    setState(() {
      _hasQuery = q.isNotEmpty;
      if (q.isEmpty) {
        _results = [];
      } else {
        _results = _kAirports
            .where((a) =>
                a.name.toLowerCase().contains(q) ||
                a.city.toLowerCase().contains(q) ||
                a.country.toLowerCase().contains(q) ||
                a.iata.toLowerCase().contains(q))
            .toList();
      }
    });
  }

  Widget _fadeUp(Widget child, AnimationController ctrl, {double slideDistance = 0.06}) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
      child: SlideTransition(
        position: Tween(begin: Offset(0, slideDistance), end: Offset.zero)
            .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
        child: child,
      ),
    );
  }

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            // Background gradient
            const _Background(),
            // Main content
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header
                  _fadeUp(
                    _Header(
                      searchCtrl: _searchCtrl,
                      searchFocus: _searchFocus,
                      hasQuery: _hasQuery,
                      onChanged: _onSearchChanged,
                      onClear: () {
                        _searchCtrl.clear();
                        _onSearchChanged('');
                        _searchFocus.requestFocus();
                      },
                      ruleCtrl: _ruleCtrl,
                    ),
                    _headerCtrl,
                  ),
                  // Scrollable body
                  Expanded(
                    child: _hasQuery ? _buildSearchResults() : _buildDefaultContent(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Search results ────────────────────────────────────────
  Widget _buildSearchResults() {
    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: kGold.withOpacity(0.07),
                shape: BoxShape.circle,
                border: Border.all(color: kGoldLight.withOpacity(0.28)),
              ),
              child: const Icon(Icons.search_off_rounded, color: kGold, size: 22),
            ),
            const SizedBox(height: 16),
            Text(
              'No airports found',
              style: GoogleFonts.cormorant(
                fontSize: 20,
                fontWeight: FontWeight.w400,
                color: context.appMutedFg(0.44),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Try a different search term',
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                letterSpacing: 0.6,
                color: context.appMutedFg(0.40),
              ),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      itemCount: _results.length,
      itemBuilder: (context, i) => _ResultCard(
        airport: _results[i],
        onTap: () => context.push('/airport-detail/${_results[i].id}'),
      ),
    );
  }

  // ─── Default content ───────────────────────────────────────
  Widget _buildDefaultContent() {
    return ListView(
      padding: const EdgeInsets.only(top: 16, bottom: 40),
      children: [
        // Quick Actions section
        _fadeUp(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionHeader(title: 'Quick Actions'),
                const SizedBox(height: 14),
                _ActionCard(
                  icon: Icons.flight_takeoff_rounded,
                  title: 'Popular Airports',
                  subtitle: 'Busiest hubs worldwide',
                  onTap: () => context.go('/airport-search'),
                ),
                const SizedBox(height: 10),
                _ActionCard(
                  icon: Icons.location_on_rounded,
                  title: 'Nearby Airports',
                  subtitle: 'Discover airports near you',
                  onTap: () => context.go('/airport-search'),
                ),
                const SizedBox(height: 10),
                _ActionCard(
                  icon: Icons.access_time_rounded,
                  title: 'Recent Searches',
                  subtitle: 'Pick up where you left off',
                  onTap: () => context.go('/airport-search'),
                ),
              ],
            ),
          ),
          _actionsCtrl,
        ),
        const SizedBox(height: 24),
        // Featured section
        _fadeUp(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: const _SectionHeader(title: 'Featured'),
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 140,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  itemCount: _kFeatured.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) => _FeaturedCard(
                    airport: _kFeatured[i],
                    onTap: () => context.push('/airport-detail/${_kFeatured[i].id}'),
                  ),
                ),
              ),
            ],
          ),
          _featuredCtrl,
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

// ─────────────────────────────────────────────────────────────
//  CORNER ORNAMENT
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  HEADER (wordmark + rule + subheading + search)
// ─────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final TextEditingController searchCtrl;
  final FocusNode searchFocus;
  final bool hasQuery;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final AnimationController ruleCtrl;

  const _Header({
    required this.searchCtrl,
    required this.searchFocus,
    required this.hasQuery,
    required this.onChanged,
    required this.onClear,
    required this.ruleCtrl,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Wordmark
          Text(
            'concourse',
            style: GoogleFonts.cormorant(
              fontSize: 36,
              fontWeight: FontWeight.w600,
              letterSpacing: 2.2,
              color: context.appOnSurface.withValues(alpha: 0.80),
            ),
          ),
          const SizedBox(height: 0),
          Text(
            'airport dining guide',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.lerp(FontWeight.w400, FontWeight.w500, 0.5),
              letterSpacing: 4.0,
              color: kTeal.withOpacity(0.75),
            ),
          ),
          const SizedBox(height: 12),
          // Gold rule with scale animation
          AnimatedBuilder(
            animation: ruleCtrl,
            builder: (_, __) => Transform.scale(
              scaleX: ruleCtrl.value,
              child: Container(
                height: 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      kGoldLight.withOpacity(0.28),
                      context.appOnSurface.withValues(alpha: 0.08),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.3, 0.7, 1.0],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Subheading
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Find airports around the world',
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                letterSpacing: 2.2,
                color: context.appMutedFg(0.40),
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Search bar
          _SearchBar(
            controller: searchCtrl,
            focusNode: searchFocus,
            hasQuery: hasQuery,
            onChanged: onChanged,
            onClear: onClear,
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SEARCH BAR
// ─────────────────────────────────────────────────────────────
class _SearchBar extends StatefulWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool hasQuery;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _SearchBar({
    required this.controller,
    required this.focusNode,
    required this.hasQuery,
    required this.onChanged,
    required this.onClear,
  });

  @override
  State<_SearchBar> createState() => _SearchBarState();
}

class _SearchBarState extends State<_SearchBar> {
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(() {
      setState(() => _focused = widget.focusNode.hasFocus);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      height: 44,
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(
          color: _focused ? kTeal : kGoldLight.withOpacity(0.28),
          width: 1,
        ),
        boxShadow: _focused ? [BoxShadow(color: kTeal.withOpacity(0.10), blurRadius: 0, spreadRadius: 2)] : [],
      ),
      child: Row(
        children: [
          const SizedBox(width: 13),
          Icon(Icons.search_rounded, size: 16, color: context.appMutedFg(0.40)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode: widget.focusNode,
              onChanged: widget.onChanged,
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: context.appOnSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Search airports, cities...',
                hintStyle: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  color: context.appMutedFg(0.40),
                ),
                filled: false,
                fillColor: Colors.transparent,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          if (widget.hasQuery)
            GestureDetector(
              onTap: widget.onClear,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Icon(Icons.close_rounded, size: 16, color: context.appMutedFg(0.40)),
              ),
            )
          else
            const SizedBox(width: 12),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER  (title + gold fade-line + diamond)
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
            color: context.appOnSurface,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [kGoldLight.withOpacity(0.28), Colors.transparent],
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
            color: kGoldLight.withOpacity(0.6),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  QUICK ACTION CARD
// ─────────────────────────────────────────────────────────────
class _ActionCard extends StatefulWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  @override
  State<_ActionCard> createState() => _ActionCardState();
}

class _ActionCardState extends State<_ActionCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.99 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: appCardSurface(context),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withOpacity(0.28)),
            boxShadow: _pressed
                ? []
                : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(
            children: [
              // Icon wrap
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: kTeal.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Icon(widget.icon, color: kTeal, size: 18),
              ),
              const SizedBox(width: 14),
              // Text
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w400,
                        color: context.appOnSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.subtitle,
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: context.appMutedFg(0.40),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: context.appMutedFg(0.35)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  FEATURED AIRPORT CARD  (horizontal scroll)
// ─────────────────────────────────────────────────────────────
class _FeaturedCard extends StatelessWidget {
  final _Airport airport;
  final VoidCallback onTap;
  const _FeaturedCard({required this.airport, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 128,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 9),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withOpacity(0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Teal top accent line
                Align(
                  alignment: Alignment.topLeft,
                  child: FractionallySizedBox(
                    widthFactor: 1,
                    child: Container(
                      height: 2,
                      margin: const EdgeInsets.only(bottom: 7),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [kTeal.withOpacity(0.5), Colors.transparent],
                        ),
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(3),
                          topRight: Radius.circular(3),
                        ),
                      ),
                    ),
                  ),
                ),
                Text(airport.flag, style: const TextStyle(fontSize: 20)),
                const SizedBox(height: 5),
                Text(
                  airport.iata,
                  style: GoogleFonts.cormorant(
                    fontSize: 18,
                    fontWeight: FontWeight.w400,
                    color: context.appOnSurface,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  airport.city,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: context.appMutedFg(0.40),
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 1, color: kGoldLight.withOpacity(0.28)),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Text(
                      '${airport.venueCount}',
                      style: GoogleFonts.cormorant(
                        fontSize: 15,
                        fontWeight: FontWeight.w400,
                        color: kTeal,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'restaurants',
                      style: GoogleFonts.jost(
                        fontSize: 10,
                        fontWeight: FontWeight.w400,
                        color: context.appMutedFg(0.40),
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  RESULT CARD  (search results)
// ─────────────────────────────────────────────────────────────
class _ResultCard extends StatelessWidget {
  final _Airport airport;
  final VoidCallback onTap;
  const _ResultCard({required this.airport, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withOpacity(0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            // Flag circle
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: kGold.withOpacity(0.07),
                shape: BoxShape.circle,
                border: Border.all(color: kGoldLight.withOpacity(0.28)),
              ),
              child: Center(
                child: Text(airport.flag, style: const TextStyle(fontSize: 22)),
              ),
            ),
            const SizedBox(width: 14),
            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    airport.iata,
                    style: GoogleFonts.cormorant(
                      fontSize: 13,
                      fontWeight: FontWeight.w400,
                      color: kTeal,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    airport.name,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      color: context.appOnSurface,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    '${airport.city}, ${airport.country}',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: context.appMutedFg(0.40),
                    ),
                  ),
                ],
              ),
            ),
            // Venue count
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${airport.venueCount}',
                  style: GoogleFonts.cormorant(
                    fontSize: 17,
                    fontWeight: FontWeight.w400,
                    color: kTeal,
                  ),
                ),
                Text(
                  'venues',
                  style: GoogleFonts.jost(
                    fontSize: 10,
                    fontWeight: FontWeight.w400,
                    color: context.appMutedFg(0.40),
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 10),
            Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}
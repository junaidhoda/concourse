import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  AIRPORT MODEL
// ─────────────────────────────────────────────────────────────
class Airport {
  final String id;
  final String name;
  final String iataCode;
  final String city;
  final String country;
  final String countryCode;

  const Airport({
    required this.id,
    required this.name,
    required this.iataCode,
    required this.city,
    required this.country,
    required this.countryCode,
  });

  String get flagAsset => 'assets/images/flag_${countryCode.toLowerCase()}.png';
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT SEARCH SCREEN
// ─────────────────────────────────────────────────────────────
class AirportSearchScreen extends StatefulWidget {
  final String initialQuery;
  const AirportSearchScreen({super.key, this.initialQuery = ''});

  @override
  State<AirportSearchScreen> createState() => _AirportSearchScreenState();
}

class _AirportSearchScreenState extends State<AirportSearchScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  List<Airport> _results = [];
  bool _hasQuery = false;
  String? _selectedContinent;

  final Map<String, List<Airport>> _airportsByContinent = const {
    'Europe': [
      Airport(id: 'BHX', name: 'Birmingham', iataCode: 'BHX', city: 'Birmingham', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'CDG', name: 'Paris Charles de Gaulle', iataCode: 'CDG', city: 'Paris', country: 'France', countryCode: 'FR'),
      Airport(id: 'FRA', name: 'Frankfurt Airport', iataCode: 'FRA', city: 'Frankfurt', country: 'Germany', countryCode: 'DE'),
      Airport(id: 'IST', name: 'Istanbul Airport', iataCode: 'IST', city: 'Istanbul', country: 'Turkey', countryCode: 'TR'),
      Airport(id: 'LGW', name: 'London Gatwick', iataCode: 'LGW', city: 'London', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'LHR', name: 'London Heathrow', iataCode: 'LHR', city: 'London', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'MAN', name: 'Manchester', iataCode: 'MAN', city: 'Manchester', country: 'United Kingdom', countryCode: 'GB'),
    ],
    'North America': [
      Airport(id: 'JFK', name: 'New York John F. Kennedy', iataCode: 'JFK', city: 'New York', country: 'USA', countryCode: 'US'),
      Airport(id: 'LAX', name: 'Los Angeles International', iataCode: 'LAX', city: 'Los Angeles', country: 'USA', countryCode: 'US'),
    ],
    'Asia': [
      Airport(id: 'BKK', name: 'Bangkok Suvarnabhumi', iataCode: 'BKK', city: 'Bangkok', country: 'Thailand', countryCode: 'TH'),
      Airport(id: 'SIN', name: 'Singapore Changi', iataCode: 'SIN', city: 'Singapore', country: 'Singapore', countryCode: 'SG'),
    ],
    'Middle East': [
      Airport(id: 'DXB', name: 'Dubai International', iataCode: 'DXB', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE'),
    ],
  };

  static const Map<String, String> _continentSubtitles = {
    'Europe': 'London · Paris · Frankfurt',
    'North America': 'New York · Los Angeles',
    'Asia': 'Bangkok · Singapore',
    'Middle East': 'Dubai',
  };

  static const Map<String, String> _continentImages = {
    'Europe': 'assets/images/europe.png',
    'North America': 'assets/images/north_america.png',
    'Asia': 'assets/images/asia.png',
    'Middle East': 'assets/images/middle_east.png',
  };

  List<Airport> get _allAirports =>
      _airportsByContinent.values.expand((list) => list).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  @override
  void initState() {
    super.initState();
    if (widget.initialQuery.isNotEmpty) {
      _searchCtrl.text = widget.initialQuery;
      _onSearchChanged(widget.initialQuery);
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    final q = value.trim().toLowerCase();
    setState(() {
      _hasQuery = q.isNotEmpty;
      if (q.isEmpty) {
        _results = [];
      } else {
        _results = _allAirports
            .where((a) =>
                a.name.toLowerCase().contains(q) ||
                a.city.toLowerCase().contains(q) ||
                a.country.toLowerCase().contains(q) ||
                a.iataCode.toLowerCase().contains(q))
            .toList();
      }
    });
  }

  void _clearSearch() {
    _searchCtrl.clear();
    _onSearchChanged('');
    _searchFocus.requestFocus();
  }

  void _selectContinent(String c) => setState(() => _selectedContinent = c);
  void _backToContinents() => setState(() => _selectedContinent = null);

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      body: Stack(
        children: [
          const _Background(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                Expanded(
                  child: _hasQuery
                      ? _buildSearchResults()
                      : AnimatedSwitcher(
                          duration: const Duration(milliseconds: 300),
                          switchInCurve: Curves.easeOut,
                          switchOutCurve: Curves.easeIn,
                          transitionBuilder: (child, animation) {
                            final isForward = child.key == ValueKey(_selectedContinent);
                            return SlideTransition(
                              position: Tween<Offset>(
                                begin: Offset(isForward ? 1.0 : -1.0, 0.0),
                                end: Offset.zero,
                              ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
                              child: FadeTransition(opacity: animation, child: child),
                            );
                          },
                          child: _selectedContinent != null
                              ? KeyedSubtree(
                                  key: ValueKey(_selectedContinent),
                                  child: _buildAirportList(),
                                )
                              : KeyedSubtree(
                                  key: const ValueKey('continents'),
                                  child: _buildContinentList(),
                                ),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Browse Airports',
            style: GoogleFonts.cormorant(
              fontSize: 30,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: kInk,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            'Search by airport, city or code',
            style: GoogleFonts.jost(
              fontSize: 11,
              fontWeight: FontWeight.w300,
              letterSpacing: 2.2,
              color: kInk.withValues(alpha: 0.40),
            ),
          ),
          const SizedBox(height: 12),
          _SearchBar(
            controller: _searchCtrl,
            focusNode: _searchFocus,
            hasQuery: _hasQuery,
            onChanged: _onSearchChanged,
            onClear: _clearSearch,
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  // ─── Continent list ───────────────────────────────────────
  Widget _buildContinentList() {
    final continents = _airportsByContinent.keys.toList();
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      itemCount: continents.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: _SectionHeader(title: 'Regions'),
          );
        }
        final continent = continents[index - 1];
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _ContinentCard(
            continent: continent,
            subtitle: _continentSubtitles[continent] ?? '',
            count: _airportsByContinent[continent]!.length,
            imagePath: _continentImages[continent] ?? '',
            onTap: () => _selectContinent(continent),
          ),
        );
      },
    );
  }

  // ─── Airport list (inside continent) ─────────────────────
  Widget _buildAirportList() {
    final airports = _airportsByContinent[_selectedContinent] ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
          child: Row(
            children: [
              GestureDetector(
                onTap: _backToContinents,
                child: Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                    boxShadow: [
                      BoxShadow(color: kInk.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Icon(Icons.arrow_back_ios_new, size: 13, color: kInk.withValues(alpha: 0.55)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(child: _SectionHeader(title: _selectedContinent!)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
            itemCount: airports.length,
            itemBuilder: (context, i) => _AirportCard(airport: airports[i]),
          ),
        ),
      ],
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
                color: kGold.withValues(alpha: 0.07),
                shape: BoxShape.circle,
                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
              ),
              child: const Icon(Icons.search_off_rounded, color: kGold, size: 22),
            ),
            const SizedBox(height: 16),
            Text(
              'No airports found',
              style: GoogleFonts.cormorant(
                fontSize: 20,
                fontWeight: FontWeight.w300,
                color: kInk.withValues(alpha: 0.40),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Try a different search term',
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.w300,
                letterSpacing: 0.6,
                color: kInk.withValues(alpha: 0.40),
              ),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      itemCount: _results.length,
      itemBuilder: (context, i) => _AirportCard(airport: _results[i]),
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

// ─────────────────────────────────────────────────────────────
//  SEARCH BAR  (mirrors explore_screen)
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(
          color: _focused ? kTeal : kGoldLight.withValues(alpha: 0.28),
          width: 1,
        ),
        boxShadow: _focused
            ? [BoxShadow(color: kTeal.withValues(alpha: 0.10), blurRadius: 0, spreadRadius: 2)]
            : [],
      ),
      child: Row(
        children: [
          const SizedBox(width: 13),
          Icon(Icons.search_rounded, size: 16, color: kInk.withValues(alpha: 0.40)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode: widget.focusNode,
              onChanged: widget.onChanged,
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w300,
                color: kInk,
              ),
              decoration: InputDecoration(
                hintText: 'Search airports, cities...',
                hintStyle: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w300,
                  color: kInk.withValues(alpha: 0.40),
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
                child: Icon(Icons.close_rounded, size: 16, color: kInk.withValues(alpha: 0.40)),
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
//  SECTION HEADER  (mirrors explore_screen)
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
//  CONTINENT CARD
// ─────────────────────────────────────────────────────────────
class _ContinentCard extends StatefulWidget {
  final String continent;
  final String subtitle;
  final int count;
  final String imagePath;
  final VoidCallback onTap;

  const _ContinentCard({
    required this.continent,
    required this.subtitle,
    required this.count,
    required this.imagePath,
    required this.onTap,
  });

  @override
  State<_ContinentCard> createState() => _ContinentCardState();
}

class _ContinentCardState extends State<_ContinentCard> {
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
          height: 112,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
            boxShadow: _pressed
                ? []
                : [BoxShadow(color: kInk.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: Stack(
              children: [
                // Teal top accent — matches _FeaturedCard
                Positioned(
                  top: 0, left: 0, right: 0,
                  child: Container(
                    height: 2,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [kTeal.withValues(alpha: 0.5), Colors.transparent],
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    // Text content
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              widget.continent,
                              style: GoogleFonts.cormorant(
                                fontSize: 22,
                                fontWeight: FontWeight.w400,
                                color: kInk,
                                letterSpacing: 0.2,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.subtitle,
                              style: GoogleFonts.jost(
                                fontSize: 11,
                                fontWeight: FontWeight.w300,
                                color: kInk.withValues(alpha: 0.40),
                                letterSpacing: 0.4,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Text(
                                  '${widget.count}',
                                  style: GoogleFonts.cormorant(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w400,
                                    color: kTeal,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  'airport${widget.count == 1 ? '' : 's'}',
                                  style: GoogleFonts.jost(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w300,
                                    color: kInk.withValues(alpha: 0.40),
                                    letterSpacing: 1.2,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    // Image thumbnail
                    ClipRRect(
                      borderRadius: const BorderRadius.only(
                        topRight: Radius.circular(3),
                        bottomRight: Radius.circular(3),
                      ),
                      child: SizedBox(
                        width: 140,
                        height: double.infinity,
                        child: Image.asset(
                          widget.imagePath,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                  ],
                ),
                // Chevron over image
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: kInk.withValues(alpha: 0.30),
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: Icon(Icons.chevron_right_rounded, size: 14, color: Colors.white.withValues(alpha: 0.85)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT CARD  (mirrors _ResultCard in explore_screen)
// ─────────────────────────────────────────────────────────────
class _AirportCard extends StatelessWidget {
  final Airport airport;
  const _AirportCard({required this.airport});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/airport-detail/${airport.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: kInk.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            // Plane icon
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(3),
              ),
              child: const Icon(Icons.flight_rounded, color: kTeal, size: 20),
            ),
            const SizedBox(width: 14),
            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    airport.iataCode,
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
                      color: kInk,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    '${airport.city}, ${airport.country}',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      fontWeight: FontWeight.w300,
                      color: kInk.withValues(alpha: 0.40),
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: kInk.withValues(alpha: 0.35)),
          ],
        ),
      ),
    );
  }
}

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/firebase_service.dart';

class AirportDetailScreen extends StatefulWidget {
  final String airportId;
  const AirportDetailScreen({super.key, required this.airportId});

  @override
  State<AirportDetailScreen> createState() => _AirportDetailScreenState();
}

class _AirportDetailScreenState extends State<AirportDetailScreen> {
  Set<String> _selectedTerminals = {'north', 'south'};
  bool _isLoading = true;
  Map<String, dynamic>? _airportData;
  List<Restaurant> _firebaseRestaurants = [];
  String? _selectedFirebaseTerminalId;
  final TextEditingController _restaurantSearchController = TextEditingController();
  bool _searchFocused = false;
  final FocusNode _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _loadFromFirebase();
    _restaurantSearchController.addListener(() => setState(() {}));
    _searchFocus.addListener(() => setState(() => _searchFocused = _searchFocus.hasFocus));
  }

  @override
  void dispose() {
    _restaurantSearchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  List<Restaurant> _filterRestaurantsByQuery(List<Restaurant> list) {
    final q = _restaurantSearchController.text.trim().toLowerCase();
    if (q.isEmpty) return list;
    return list.where((r) {
      return r.name.toLowerCase().contains(q) || r.cuisine.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _loadFromFirebase() async {
    final airportData = await FirebaseService.getAirportData(widget.airportId);
    final restaurantMaps = await FirebaseService.getRestaurants(widget.airportId);
    final restaurants = restaurantMaps.map(_mapToRestaurant).toList();
    if (mounted) {
      setState(() {
        _airportData = airportData;
        _firebaseRestaurants = restaurants;
        _selectedFirebaseTerminalId = null;
        _isLoading = false;
      });
    }
  }

  Restaurant _mapToRestaurant(Map<String, dynamic> map) {
    final terminalId = map['_terminalId'] as String? ?? '';
    final terminalName = map['_terminalName'] as String? ?? terminalId;

    // Prefer specific cuisine; fall back to categories (e.g. "Restaurant, Gluten-free")
    String cuisine = _stringFromMap(map, ['cuisine']) ?? '';
    if (cuisine.isEmpty) {
      final cats = _stringFromMap(map, ['categories']) ?? '';
      // Strip dietary tags to keep only the venue type
      cuisine = cats.split(',').map((s) => s.trim()).firstWhere(
        (s) => !{'Gluten-free', 'Halal', 'Vegan', 'Vegetarian'}.contains(s),
        orElse: () => cats,
      );
    }

    // Map airside field to a readable location string
    final airsideRaw = map['airside'] as String? ?? '';
    final location = switch (airsideRaw.toLowerCase()) {
      'airside' => 'After security',
      'landside' => 'Before security',
      'both' => 'Airside & landside',
      _ => '',
    };

    return Restaurant(
      name: _stringFromMap(map, ['name']) ?? 'Unknown',
      cuisine: cuisine,
      location: location,
      isOpen: true,
      logoUrl: '',
      terminalId: terminalId,
      terminalShort: terminalId,
      terminalName: terminalName,
    );
  }

  List<_TerminalEntry> get _firebaseTerminalEntries {
    final byId = <String, _TerminalEntry>{};
    for (final r in _firebaseRestaurants) {
      final id = r.terminalId;
      if (id == null || id.isEmpty || byId.containsKey(id)) continue;
      byId[id] = _TerminalEntry(
        id: id,
        short: r.terminalShort ?? id,
        name: r.terminalName ?? r.terminalShort ?? id,
      );
    }
    final list = byId.values.toList()..sort((a, b) => a.short.compareTo(b.short));
    return list;
  }

  void _setSelectedFirebaseTerminal(String? terminalId) =>
      setState(() => _selectedFirebaseTerminalId = terminalId);

  String? _stringFromMap(Map<String, dynamic> map, List<String> keys) {
    for (final k in keys) {
      final v = map[k];
      if (v != null && v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  void _selectTerminal(String terminal) {
    setState(() {
      if (_selectedTerminals.contains(terminal)) {
        _selectedTerminals.remove(terminal);
      } else {
        _selectedTerminals.add(terminal);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return _buildLoadingScreen(context);
    if (_firebaseRestaurants.isNotEmpty) return _buildFirebaseAirportScreen(context);
    if (widget.airportId == 'LGW') return _buildLondonGatwickScreen(context);
    return _buildPlaceholderScreen(context);
  }

  // ─── LOADING ─────────────────────────────────────────────
  Widget _buildLoadingScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          _Background(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildBackHeader(
                  context,
                  title: FirebaseService.getAirportName(widget.airportId),
                  subtitle: widget.airportId,
                ),
                const Expanded(
                  child: Center(
                    child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── FIREBASE AIRPORT SCREEN ─────────────────────────────
  Widget _buildFirebaseAirportScreen(BuildContext context) {
    final name = _airportData?['name'] as String? ?? FirebaseService.getAirportName(widget.airportId);
    final location = _airportData?['location'] as String? ?? FirebaseService.getAirportLocation(widget.airportId);
    final hasTerminals = _firebaseTerminalEntries.isNotEmpty;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          _Background(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Fixed header ──────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _backButton(context),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: GoogleFonts.cormorant(fontSize: 24, fontWeight: FontWeight.w600, letterSpacing: 0.2, color: context.appOnSurface)),
                                Text(location, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 1.5, color: context.appMutedFg(0.40))),
                              ],
                            ),
                          ),
                          Text(widget.airportId, style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, color: kTeal, letterSpacing: 0.5)),
                        ],
                      ),
                      const SizedBox(height: 14),
                      _rule(),
                    ],
                  ),
                ),
                // ── Fixed filter bar ──────────────────────────
                Container(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  padding: const EdgeInsets.fromLTRB(24, 10, 24, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (hasTerminals) ...[
                        Text('Terminal', style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 2.0, color: context.appMutedFg(0.40))),
                        const SizedBox(height: 5),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          decoration: BoxDecoration(
                            color: appCardSurface(context),
                            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                            borderRadius: BorderRadius.circular(3),
                            boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String?>(
                              value: _selectedFirebaseTerminalId,
                              isExpanded: true,
                              isDense: true,
                              style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface),
                              hint: Text('All terminals', style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appMutedFg(0.40))),
                              items: [
                                DropdownMenuItem<String?>(value: null, child: Text('All terminals', style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface))),
                                ..._firebaseTerminalEntries.map((t) => DropdownMenuItem<String?>(
                                  value: t.id,
                                  child: Text(t.name, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface)),
                                )),
                              ],
                              onChanged: _setSelectedFirebaseTerminal,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Text('Search', style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 2.0, color: context.appMutedFg(0.40))),
                      const SizedBox(height: 5),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        height: 40,
                        decoration: BoxDecoration(
                          color: appCardSurface(context),
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: _searchFocused ? kTeal : kGoldLight.withValues(alpha: 0.28)),
                          boxShadow: _searchFocused
                              ? [BoxShadow(color: kTeal.withValues(alpha: 0.10), blurRadius: 0, spreadRadius: 2)]
                              : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                        ),
                        child: Row(
                          children: [
                            const SizedBox(width: 12),
                            Icon(Icons.search_rounded, size: 15, color: context.appMutedFg(0.40)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: _restaurantSearchController,
                                focusNode: _searchFocus,
                                style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: context.appOnSurface),
                                decoration: InputDecoration(
                                  hintText: 'Name or cuisine...',
                                  hintStyle: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: context.appMutedFg(0.40)),
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  isDense: true,
                                  contentPadding: EdgeInsets.zero,
                                ),
                              ),
                            ),
                            if (_restaurantSearchController.text.isNotEmpty)
                              GestureDetector(
                                onTap: () { _restaurantSearchController.clear(); setState(() {}); },
                                child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.close_rounded, size: 15, color: context.appMutedFg(0.40))),
                              )
                            else
                              const SizedBox(width: 12),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // ── Scrollable restaurant list ─────────────────
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(top: 12, bottom: 40),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              _SectionHeader(title: 'Restaurants & Cafés'),
                              SizedBox(height: 16),
                            ],
                          ),
                        ),
                        _buildFirebaseRestaurantSections(context, name),
                      ],
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

  Widget _buildFirebaseRestaurantSections(BuildContext context, String airportName) {
    if (_firebaseTerminalEntries.isNotEmpty && _selectedFirebaseTerminalId != null) {
      for (final t in _firebaseTerminalEntries) {
        if (t.id == _selectedFirebaseTerminalId) {
          final filtered = _filterRestaurantsByQuery(_firebaseRestaurants.where((r) => r.terminalId == t.id).toList());
          if (filtered.isEmpty) return _buildEmptyRestaurantState();
          return _buildRestaurantSection(context, t.name, filtered, airportName);
        }
      }
    }
    if (_firebaseTerminalEntries.isNotEmpty) {
      final sections = <Widget>[];
      for (final t in _firebaseTerminalEntries) {
        final list = _filterRestaurantsByQuery(_firebaseRestaurants.where((r) => r.terminalId == t.id).toList());
        if (list.isEmpty) continue;
        if (sections.isNotEmpty) sections.add(const SizedBox(height: 20));
        sections.add(_buildRestaurantSection(context, t.name, list, airportName));
      }
      if (sections.isEmpty) return _buildEmptyRestaurantState();
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: sections);
    }
    final filtered = _filterRestaurantsByQuery(_firebaseRestaurants);
    if (filtered.isEmpty) return _buildEmptyRestaurantState();
    return _buildRestaurantSection(context, 'All', filtered, airportName);
  }

  Widget _buildEmptyRestaurantState() {
    final hasQuery = _restaurantSearchController.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(top: 32),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(color: kGold.withValues(alpha: 0.07), shape: BoxShape.circle, border: Border.all(color: kGoldLight.withValues(alpha: 0.28))),
              child: const Icon(Icons.search_off_rounded, color: kGold, size: 22),
            ),
            const SizedBox(height: 16),
            Text(
              hasQuery ? 'No restaurants match your search' : 'No restaurants here',
              style: GoogleFonts.cormorant(fontSize: 20, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ─── LONDON GATWICK SCREEN ────────────────────────────────
  Widget _buildLondonGatwickScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          _Background(),
          SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _backButton(context),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('London Gatwick', style: GoogleFonts.cormorant(fontSize: 24, fontWeight: FontWeight.w600, color: context.appOnSurface)),
                                  Text('London, United Kingdom', style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 1.5, color: context.appMutedFg(0.40))),
                                ],
                              ),
                            ),
                            Text('LGW', style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, color: kTeal, letterSpacing: 0.5)),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _rule(),
                        const SizedBox(height: 16),
                        const _SectionHeader(title: 'Terminals'),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(child: _buildTerminalCard(context, 'North Terminal', 'N', _selectedTerminals.contains('north'), () => _selectTerminal('north'))),
                            const SizedBox(width: 10),
                            Expanded(child: _buildTerminalCard(context, 'South Terminal', 'S', _selectedTerminals.contains('south'), () => _selectTerminal('south'))),
                          ],
                        ),
                        const SizedBox(height: 20),
                        const _SectionHeader(title: 'Restaurants & Cafés'),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 40),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_selectedTerminals.contains('north')) ...[
                          _buildRestaurantSection(context, 'North Terminal', _getNorthTerminalRestaurants(), 'London Gatwick (LGW)'),
                          if (_selectedTerminals.contains('south')) const SizedBox(height: 20),
                        ],
                        if (_selectedTerminals.contains('south'))
                          _buildRestaurantSection(context, 'South Terminal', _getSouthTerminalRestaurants(), 'London Gatwick (LGW)'),
                      ],
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

  // ─── PLACEHOLDER SCREEN ───────────────────────────────────
  Widget _buildPlaceholderScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          _Background(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildBackHeader(context, title: 'Airport Details', subtitle: widget.airportId),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(28),
                          decoration: BoxDecoration(
                            color: appCardSurface(context),
                            borderRadius: BorderRadius.circular(3),
                            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                            boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                          ),
                          child: Column(
                            children: [
                              Container(
                                width: 52, height: 52,
                                decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(3)),
                                child: const Icon(Icons.construction_rounded, color: kTeal, size: 24),
                              ),
                              const SizedBox(height: 16),
                              Text('Coming Soon', style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w400, color: context.appOnSurface)),
                              const SizedBox(height: 6),
                              Text(
                                'Detailed dining information for this airport will be available soon.',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: context.appMutedFg(0.52), height: 1.6),
                              ),
                              const SizedBox(height: 20),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: () => context.go('/airport-search'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: kTeal,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                                    elevation: 0,
                                  ),
                                  child: Text('BACK TO SEARCH', style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 2.2)),
                                ),
                              ),
                            ],
                          ),
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
    );
  }

  // ─── SHARED HELPERS ───────────────────────────────────────
  Widget _buildBackHeader(BuildContext context, {required String title, required String subtitle}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _backButton(context),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: GoogleFonts.cormorant(fontSize: 24, fontWeight: FontWeight.w600, color: context.appOnSurface)),
                    Text(subtitle, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 1.5, color: context.appMutedFg(0.40))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _rule(),
        ],
      ),
    );
  }

  Widget _backButton(BuildContext context) {
    return GestureDetector(
      onTap: () => context.go('/airport-search'),
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
    );
  }

  Widget _rule() {
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28), context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
          stops: const [0.0, 0.3, 0.7, 1.0],
        ),
      ),
    );
  }

  Widget _buildTerminalCard(BuildContext context, String label, String code, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isSelected ? kTeal.withValues(alpha: 0.08) : appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: isSelected ? kTeal : kGoldLight.withValues(alpha: 0.28), width: isSelected ? 1.5 : 1),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          children: [
            Text(code, style: GoogleFonts.cormorant(fontSize: 28, fontWeight: FontWeight.w600, color: isSelected ? kTeal : context.appMutedFg(0.35))),
            const SizedBox(height: 4),
            Text(label, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 0.5, color: isSelected ? kTeal : context.appMutedFg(0.40))),
          ],
        ),
      ),
    );
  }

  Widget _buildRestaurantSection(BuildContext context, String terminalName, List<Restaurant> restaurants, String airportDisplayName) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: _SectionHeader(title: terminalName),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(left: 24, right: 8),
            itemCount: restaurants.length,
            itemBuilder: (context, i) => _buildRestaurantCard(context, restaurants[i], airportDisplayName),
          ),
        ),
      ],
    );
  }

  Widget _buildRestaurantCard(BuildContext context, Restaurant restaurant, String airportDisplayName) {
    return GestureDetector(
      onTap: () {
        context.push('/restaurant-detail', extra: {
          'name': restaurant.name,
          'cuisine': restaurant.cuisine,
          'location': restaurant.location,
          'isOpen': restaurant.isOpen,
          'logoUrl': restaurant.logoUrl,
          'airportName': airportDisplayName,
        });
      },
      child: Container(
        width: 152,
        margin: const EdgeInsets.only(right: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon badge
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: kTeal.withValues(alpha: 0.18)),
              ),
              child: Icon(_getRestaurantIcon(restaurant.cuisine), color: kTeal, size: 24),
            ),
            const SizedBox(height: 12),
            // Name
            Text(
              restaurant.name,
              style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500, color: context.appOnSurface, height: 1.35),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            // Cuisine
            if (restaurant.cuisine.isNotEmpty)
              Text(
                restaurant.cuisine,
                style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, color: context.appMutedFg(0.42)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            const Spacer(),
            // Open status
            Row(
              children: [
                Container(width: 5, height: 5, decoration: BoxDecoration(color: restaurant.isOpen ? kTeal : kGold, shape: BoxShape.circle)),
                const SizedBox(width: 5),
                Text(
                  restaurant.isOpen ? 'Open' : 'Closed',
                  style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w400, letterSpacing: 0.5, color: restaurant.isOpen ? kTeal : kGold),
                ),
              ],
            ),
            if (restaurant.location.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                restaurant.location,
                style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w400, color: context.appMutedFg(0.35)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }

  IconData _getRestaurantIcon(String cuisine) {
    final c = cuisine.toLowerCase();
    if (c.contains('coffee') || c.contains('café') || c.contains('cafe')) return Icons.coffee;
    if (c.contains('pub') || c.contains('bar')) return Icons.local_bar;
    if (c.contains('pizza')) return Icons.local_pizza;
    if (c.contains('burger') || c.contains('fast food')) return Icons.fastfood;
    if (c.contains('asian') || c.contains('sushi') || c.contains('noodle')) return Icons.ramen_dining;
    if (c.contains('breakfast')) return Icons.breakfast_dining;
    if (c.contains('sandwich')) return Icons.lunch_dining;
    if (c.contains('dessert') || c.contains('cake') || c.contains('doughnut')) return Icons.cake;
    if (c.contains('juice')) return Icons.local_drink;
    return Icons.restaurant;
  }

  List<Restaurant> _getNorthTerminalRestaurants() {
    return [
      Restaurant(name: 'Bar on the Balcony', cuisine: 'Bar', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/bar-on-the-balcony.jpg'),
      Restaurant(name: 'Black Sheep Coffee', cuisine: 'Coffee', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/black-sheep-coffee.jpg'),
      Restaurant(name: 'The Breakfast Club', cuisine: 'Breakfast', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-breakfast-club.jpg'),
      Restaurant(name: 'BrewDog', cuisine: 'Pub', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/brewdog.jpg'),
      Restaurant(name: 'Juniper & Co', cuisine: 'Restaurant', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/juniper-co.jpg'),
      Restaurant(name: 'Krispy Kreme', cuisine: 'Dessert', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/krispy-kreme.jpg'),
      Restaurant(name: 'Pret a Manger', cuisine: 'Sandwich', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pret-a-manger.jpg'),
      Restaurant(name: 'Pure', cuisine: 'Café', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pure.jpg'),
      Restaurant(name: 'The Red Lion', cuisine: 'Pub', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/red-lion.jpg'),
      Restaurant(name: 'Shake Shack', cuisine: 'Burger', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/shake-shack.jpg'),
      Restaurant(name: 'Sonoma', cuisine: 'Restaurant', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/sonoma.jpg'),
      Restaurant(name: 'Starbucks', cuisine: 'Coffee', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/starbucks.jpg'),
      Restaurant(name: 'Sussex House', cuisine: 'Restaurant', location: 'Before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/sussex-house.jpg'),
      Restaurant(name: 'Tortilla', cuisine: 'Mexican', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/tortilla.jpg'),
      Restaurant(name: 'wagamama', cuisine: 'Asian', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wagamama.jpg'),
    ];
  }

  List<Restaurant> _getSouthTerminalRestaurants() {
    return [
      Restaurant(name: 'The Beehive', cuisine: 'Pub', location: 'Before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-beehive.jpg'),
      Restaurant(name: 'Big Smoke', cuisine: 'Bar', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/big-smoke.jpg'),
      Restaurant(name: 'Black Sheep Coffee', cuisine: 'Coffee', location: 'Before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/black-sheep-coffee.jpg'),
      Restaurant(name: 'Caffe Nero', cuisine: 'Coffee', location: 'Before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/caffe-nero.jpg'),
      Restaurant(name: 'The Flying Horse', cuisine: 'Pub', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-flying-horse.jpg'),
      Restaurant(name: 'Giraffe', cuisine: 'Restaurant', location: 'Before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/giraffe.jpg'),
      Restaurant(name: 'Greggs', cuisine: 'Sandwich', location: 'Arrivals', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/greggs.jpg'),
      Restaurant(name: 'itsu', cuisine: 'Asian', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/itsu.jpg'),
      Restaurant(name: 'Joe & The Juice', cuisine: 'Juice Bar', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/joe-and-the-juice.jpg'),
      Restaurant(name: 'Nandos', cuisine: 'Chicken', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/nandos.jpg'),
      Restaurant(name: 'PizzaExpress', cuisine: 'Pizza', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pizza-express.jpg'),
      Restaurant(name: 'Pret a Manger', cuisine: 'Sandwich', location: 'Arrivals and after security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pret-a-manger.jpg'),
      Restaurant(name: 'South Downs Bar', cuisine: 'Bar', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/south-downs-bar.jpg'),
      Restaurant(name: 'Starbucks', cuisine: 'Coffee', location: 'After security and before security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/starbucks.jpg'),
      Restaurant(name: 'wagamama', cuisine: 'Asian', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wagamama.jpg'),
      Restaurant(name: 'Wondertree', cuisine: 'Restaurant', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wondertree.jpg'),
      Restaurant(name: 'Small Batch Social', cuisine: 'Coffee', location: 'After security', isOpen: true, logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/small-batch-social.jpg'),
    ];
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
        Expanded(child: Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])))),
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


// ─────────────────────────────────────────────────────────────
//  MODELS
// ─────────────────────────────────────────────────────────────
class _TerminalEntry {
  final String id;
  final String short;
  final String name;
  const _TerminalEntry({required this.id, required this.short, required this.name});
}

class Restaurant {
  final String name;
  final String cuisine;
  final String location;
  final bool isOpen;
  final String logoUrl;
  final String? terminalId;
  final String? terminalShort;
  final String? terminalName;

  Restaurant({
    required this.name,
    required this.cuisine,
    required this.location,
    required this.isOpen,
    required this.logoUrl,
    this.terminalId,
    this.terminalShort,
    this.terminalName,
  });
}

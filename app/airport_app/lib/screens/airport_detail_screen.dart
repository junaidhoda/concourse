import 'dart:async';
import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/favourites_service.dart';
import '../services/firebase_service.dart';
import '../services/chain_restaurant_service.dart';

class AirportDetailScreen extends StatefulWidget {
  final String airportId;
  const AirportDetailScreen({super.key, required this.airportId});

  @override
  State<AirportDetailScreen> createState() => _AirportDetailScreenState();
}

class _AirportDetailScreenState extends State<AirportDetailScreen> {
  static const _assetImages = {
    'LHR': 'assets/images/airports/london.jpg',
    'LGW': 'assets/images/airports/london.jpg',
    'BHX': 'assets/images/airports/bhx.jpg',
    'MAN': 'assets/images/airports/man.jpg',
    'CDG': 'assets/images/airports/cdg.jpg',
    'FRA': 'assets/images/airports/fra.jpg',
  };

  int _tabIndex = 0; // 0 = Restaurants & Cafés, 1 = Lounges
  bool _isLoading = true;
  final Set<String> _expandedTerminals = {};
  final ScrollController _scrollController = ScrollController();
  Map<String, dynamic>? _airportData;
  List<Restaurant> _firebaseRestaurants = [];
  String? _selectedFirebaseTerminalId;
  final TextEditingController _restaurantSearchController = TextEditingController();
  bool _searchFocused = false;
  final FocusNode _searchFocus = FocusNode();
  bool _isAirportSaved = false;
  StreamSubscription<Set<String>>? _airportSavedSub;
  StreamSubscription<User?>? _authSub;

  @override
  void initState() {
    super.initState();
    _loadFromFirebase();
    _restaurantSearchController.addListener(() => setState(() {}));
    _searchFocus.addListener(() => setState(() => _searchFocused = _searchFocus.hasFocus));
    _authSub = FirebaseAuth.instance.authStateChanges().listen((_) => _setupAirportSavedStream());
    _setupAirportSavedStream();
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _airportSavedSub?.cancel();
    _restaurantSearchController.dispose();
    _searchFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _setupAirportSavedStream() {
    _airportSavedSub?.cancel();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      if (mounted) setState(() => _isAirportSaved = false);
      return;
    }
    _airportSavedSub = FavouritesService.savedAirportIds(uid).listen((ids) {
      if (mounted) setState(() => _isAirportSaved = ids.contains(widget.airportId));
    });
  }

  void _toggleSavedAirport(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Sign in to save airports', style: GoogleFonts.jost(fontSize: 13)),
        backgroundColor: kTeal,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      ));
      return;
    }
    FavouritesService.toggleSavedAirport(uid, widget.airportId, {
      'airportCode': widget.airportId,
      'name': _airportData?['name'] as String? ?? widget.airportId,
      'city': _airportData?['city'] as String? ?? '',
      'country': _airportData?['country'] as String? ?? '',
    });
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
    final categories = _stringFromMap(map, ['categories']) ?? '';
    final amenity = map['amenity'] as String? ?? 'restaurant';

    final isLounge = amenity == 'lounge' ||
        categories.toLowerCase().contains('lounge') ||
        terminalName.toLowerCase().contains('lounge') ||
        terminalId.toLowerCase().contains('lounge');

    String cuisine = _stringFromMap(map, ['cuisine']) ?? '';
    if (cuisine.isEmpty) {
      cuisine = categories.split(',').map((s) => s.trim()).firstWhere(
        (s) => !{'Gluten-free', 'Halal', 'Vegan', 'Vegetarian'}.contains(s),
        orElse: () => categories,
      );
    }
    cuisine = _formatCuisine(cuisine);

    final dietary = map['dietary'] as Map<String, dynamic>? ?? {};
    final additional = map['additional'] as Map<String, dynamic>? ?? {};

    final rawOutlets = map['outlets'] as List<dynamic>? ?? [];
    final List<RestaurantOutlet> outlets;
    if (rawOutlets.isNotEmpty) {
      outlets = rawOutlets.map((o) {
        final outlet = o as Map<String, dynamic>;
        return RestaurantOutlet(
          gateArea: outlet['gate_area'] as String? ?? '',
          airside: outlet['airside'] as String? ?? '',
          level: outlet['level'] as String? ?? '',
          locationNotes: outlet['location_notes'] as String? ?? '',
        );
      }).toList();
    } else {
      outlets = [
        RestaurantOutlet(
          gateArea: '',
          airside: map['airside'] as String? ?? '',
          level: additional['level'] as String? ??
              map['floor_level'] as String? ?? '',
          locationNotes: additional['location_notes'] as String? ?? '',
        ),
      ];
    }

    return Restaurant(
      airportCode: widget.airportId,
      name: _stringFromMap(map, ['name']) ?? 'Unknown',
      cuisine: cuisine,
      amenity: amenity,
      description: map['description'] as String? ?? additional['description'] as String? ?? '',
      website: map['website'] as String? ?? additional['website'] as String? ?? '',
      phone: map['phone'] as String? ?? '',
      logoUrl: (map['logo_url'] as String? ?? '').isNotEmpty
          ? map['logo_url'] as String
          : ChainRestaurantService.findLogoUrl(_stringFromMap(map, ['name']) ?? ''),
      isLounge: isLounge,
      terminalId: terminalId,
      terminalShort: terminalId,
      terminalName: terminalName,
      isVegan:       _boolField(map, dietary, 'vegan', 'vegan_options'),
      isVegetarian:  _boolField(map, dietary, 'vegetarian', 'vegetarian_options'),
      isHalal:       _boolField(map, dietary, 'halal', 'halal'),
      isKosher:      _boolField(map, dietary, 'kosher', 'kosher'),
      isGlutenFree:  _boolField(map, dietary, 'gluten_free', 'gluten_free'),
      // Prefer root-level; fall back to first outlet for data saved via new admin format
      open247:       map['open_24_7'] as bool? ?? (rawOutlets.isNotEmpty ? (rawOutlets.first as Map)['open_24_7'] as bool? ?? false : false),
      openingHours:  _outletFallback(map, rawOutlets, 'opening_hours'),
      openingMonday:    map['opening_monday']    as String? ?? '',
      openingTuesday:   map['opening_tuesday']   as String? ?? '',
      openingWednesday: map['opening_wednesday'] as String? ?? '',
      openingThursday:  map['opening_thursday']  as String? ?? '',
      openingFriday:    map['opening_friday']    as String? ?? '',
      openingSaturday:  map['opening_saturday']  as String? ?? '',
      openingSunday:    map['opening_sunday']    as String? ?? '',
      wheelchairAccessible: _outletFallback(map, rawOutlets, 'wheelchair_accessible'),
      takeaway:   _outletFallback(map, rawOutlets, 'takeaway'),
      delivery:   _outletFallback(map, rawOutlets, 'delivery'),
      reservable: _outletFallback(map, rawOutlets, 'reservable'),
      kidsMenu:   _outletFallback(map, rawOutlets, 'kids_menu'),
      outlets: outlets,
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

  Widget _buildTabBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Row(
        children: [
          Expanded(child: _buildTabSegment(
            context, Icons.restaurant_menu_rounded, 'Restaurants & Cafés', 0)),
          const SizedBox(width: 10),
          Expanded(child: _buildTabSegment(
            context, Icons.airline_seat_recline_extra_rounded, 'Lounges', 1)),
        ],
      ),
    );
  }

  Widget _buildTabSegment(BuildContext context, IconData icon, String label, int index) {
    final selected = _tabIndex == index;
    final activeColor = index == 1 ? kGold : kTeal;
    return GestureDetector(
      onTap: () => setState(() {
        _tabIndex = index;
        _selectedFirebaseTerminalId = null;
      }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 38,
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: selected ? activeColor : kGoldLight.withValues(alpha: 0.28),
            width: selected ? 1.5 : 1.0,
          ),
          boxShadow: selected
              ? [BoxShadow(color: activeColor.withValues(alpha: 0.14), blurRadius: 8, offset: const Offset(0, 2))]
              : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.05), blurRadius: 5, offset: const Offset(0, 1))],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: selected ? activeColor : context.appMutedFg(0.42)),
            const SizedBox(width: 6),
            Text(label, style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
              letterSpacing: 0.3,
              color: selected ? activeColor : context.appMutedFg(0.42),
            )),
          ],
        ),
      ),
    );
  }

  String? _stringFromMap(Map<String, dynamic> map, List<String> keys) {
    for (final k in keys) {
      final v = map[k];
      if (v != null && v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  String _outletFallback(Map<String, dynamic> map, List<dynamic> outlets, String key) {
    final root = map[key] as String? ?? '';
    if (root.isNotEmpty) return root;
    if (outlets.isEmpty) return '';
    return (outlets.first as Map<String, dynamic>)[key] as String? ?? '';
  }

  bool _boolField(Map<String, dynamic> map, Map<String, dynamic> dietary,
      String dietaryKey, String rootKey) {
    final d = dietary[dietaryKey];
    if (d is bool) return d;
    final r = map[rootKey];
    if (r is bool) return r;
    if (r is String) return r.toLowerCase() == 'yes';
    return false;
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return _buildLoadingScreen(context);
    if (_firebaseRestaurants.isNotEmpty) return _buildFirebaseAirportScreen(context);
    return _buildPlaceholderScreen(context);
  }

  // ─── LOADING ─────────────────────────────────────────────

  Widget _buildLoadingScreen(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    return Scaffold(
      backgroundColor: bg,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          _Background(),
          CustomScrollView(
            physics: const NeverScrollableScrollPhysics(),

            slivers: [
              // ── Hero skeleton ─────────────────────────────
              SliverAppBar(
                expandedHeight: 280,
                pinned: true,
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
                flexibleSpace: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(color: const Color(0xFF0B2D3A)),
                    Positioned(
                      bottom: 0, left: 0, right: 0,
                      child: Container(
                        height: 100,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, bg],
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 20, left: 16, right: 80,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _SkeletonBox(height: 22, width: 200),
                          const SizedBox(height: 6),
                          _SkeletonBox(height: 11, width: 110),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // ── Stats strip skeleton ──────────────────────
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                      child: _SkeletonBox(height: 1),
                    ),
                    const SizedBox(height: 12),
                    IntrinsicHeight(
                      child: Row(
                        children: [
                          Expanded(child: _buildStatSkeleton()),
                          Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 6), color: kGoldLight.withValues(alpha: 0.14)),
                          Expanded(child: _buildStatSkeleton()),
                          Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 6), color: kGoldLight.withValues(alpha: 0.14)),
                          Expanded(child: _buildStatSkeleton()),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),

              // ── Tab bar skeleton ──────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 12),
                  child: Row(
                    children: [
                      Expanded(child: _SkeletonBox(height: 38)),
                      const SizedBox(width: 10),
                      Expanded(child: _SkeletonBox(height: 38)),
                    ],
                  ),
                ),
              ),

              // ── Filter + grid skeleton ────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SkeletonBox(height: 11, width: 72),
                      const SizedBox(height: 5),
                      _SkeletonBox(height: 48),
                      const SizedBox(height: 8),
                      _SkeletonBox(height: 11, width: 52),
                      const SizedBox(height: 5),
                      _SkeletonBox(height: 40),
                      const SizedBox(height: 20),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: EdgeInsets.zero,
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                          mainAxisExtent: 190,
                        ),
                        itemCount: 6,
                        itemBuilder: (_, __) => _SkeletonBox(height: 190),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + kToolbarHeight + 16,
            left: 24,
            right: 24,
            child: const _AirplaneLoadingBar(),
          ),
        ],
      ),
    );
  }

  Widget _buildStatSkeleton() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      _SkeletonBox(height: 11, width: 52),
      const SizedBox(height: 4),
      _SkeletonBox(height: 26, width: 36),
    ],
  );

  // ─── FIREBASE AIRPORT SCREEN ─────────────────────────────
  Widget _buildFirebaseAirportScreen(BuildContext context) {
    final name = _airportData?['name'] as String? ?? FirebaseService.getAirportName(widget.airportId);
    final city    = _airportData?['city']    as String? ?? '';
    final country = _airportData?['country'] as String? ?? '';
    final locationParts = [city, country].where((s) => s.isNotEmpty).toList();
    final location = locationParts.isNotEmpty
        ? locationParts.join(', ')
        : FirebaseService.getAirportLocation(widget.airportId);
    final code = (_airportData?['code'] as String? ?? widget.airportId).toUpperCase();
    final hasTerminals = _firebaseTerminalEntries.isNotEmpty;

    final rawImageUrl = _airportData?['image_url'] as String? ?? '';
    final imageUrl = rawImageUrl.isNotEmpty ? rawImageUrl : null;
    // Try IATA code, then uppercased airportId, then any partial match
    final assetPath = _assetImages[code]
        ?? _assetImages[widget.airportId.toUpperCase()]
        ?? _assetImages.entries
            .where((e) => widget.airportId.toLowerCase().contains(e.key.toLowerCase()))
            .map((e) => e.value)
            .firstOrNull;

    final terminalCount   = _firebaseTerminalEntries
        .where((t) => !t.name.toLowerCase().contains('lounge') && !t.id.toLowerCase().contains('lounge'))
        .length;
    final restaurantCount = _firebaseRestaurants.where((r) => !r.isLounge).length;
    final loungeCount     = _firebaseRestaurants.where((r) => r.isLounge).length;

    final bg = Theme.of(context).scaffoldBackgroundColor;

    return Scaffold(
      backgroundColor: bg,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          _Background(),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => FocusScope.of(context).unfocus(),
            child: const SizedBox.expand(),
          ),
          CustomScrollView(
            controller: _scrollController,
            slivers: [
              // ── Collapsing hero (FlexibleSpaceBar handles animation) ──
              SliverAppBar(
                expandedHeight: 280,
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
                actions: [
                  GestureDetector(
                    onTap: () => _toggleSavedAirport(context),
                    child: Container(
                      margin: const EdgeInsets.only(right: 12),
                      padding: const EdgeInsets.all(9),
                      decoration: BoxDecoration(
                        color: appCardSurface(context),
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                        boxShadow: [BoxShadow(
                          color: context.appOnSurface.withValues(alpha: 0.06),
                          blurRadius: 6, offset: const Offset(0, 2),
                        )],
                      ),
                      child: Icon(
                        _isAirportSaved
                            ? Icons.bookmark_rounded
                            : Icons.bookmark_border_rounded,
                        size: 13,
                        color: _isAirportSaved
                            ? kTeal
                            : context.appOnSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                ],
                // Raw LayoutBuilder — no FlexibleSpaceBar so no internal ClipRect.
                // Stack has clipBehavior: Clip.none so iOS bounce never cuts text.
                flexibleSpace: LayoutBuilder(
                  builder: (context, constraints) {
                    final topPadding = MediaQuery.of(context).padding.top;
                    final expandedMax = 280.0 + topPadding;
                    final collapsedMin = kToolbarHeight + topPadding;
                    final t = ((expandedMax - constraints.maxHeight) / (expandedMax - collapsedMin)).clamp(0.0, 1.0);
                    final textOpacity  = (1.0 - t * 2.0).clamp(0.0, 1.0);
                    // Collapsed title fades in only after the hero text has gone
                    final titleOpacity = ((t - 0.5) * 2.0).clamp(0.0, 1.0);

                    return Stack(
                      fit: StackFit.expand,
                      clipBehavior: Clip.none,
                      children: [
                        _buildHeroImage(imageUrl, assetPath, context),
                        Positioned(
                          bottom: 0, left: 0, right: 0,
                          child: Container(
                            height: 100,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, bg],
                              ),
                            ),
                          ),
                        ),
                        if (textOpacity > 0)
                          Positioned(
                            bottom: 16, left: 16, right: 16,
                            child: Opacity(
                              opacity: textOpacity,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  color: Colors.black.withValues(alpha: 0.40),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(name, style: GoogleFonts.cormorant(
                                              fontSize: 24, fontWeight: FontWeight.w600,
                                              color: Colors.white, letterSpacing: 0.2, height: 1.15,
                                            )),
                                            const SizedBox(height: 2),
                                            Text(location, style: GoogleFonts.jost(
                                              fontSize: 12, fontWeight: FontWeight.w400,
                                              letterSpacing: 1.4, color: Colors.white.withValues(alpha: 0.60),
                                            )),
                                          ],
                                        ),
                                      ),
                                      Text(code, style: GoogleFonts.cormorant(
                                        fontSize: 20, fontWeight: FontWeight.w400,
                                        color: kTeal, letterSpacing: 0.8,
                                      )),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        // Collapsed title — fades in after hero text has gone
                        if (titleOpacity > 0)
                          Positioned(
                            top: topPadding,
                            left: 56,
                            right: 56,
                            height: kToolbarHeight,
                            child: Opacity(
                              opacity: titleOpacity,
                              child: Align(
                                alignment: Alignment.center,
                                child: Text(
                                  name,
                                  style: GoogleFonts.cormorant(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                    color: context.appOnSurface,
                                    letterSpacing: 0.2,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),

              // ── Stats strip (scrolls away) ────────────────────
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
                      child: _rule(),
                    ),
                    const SizedBox(height: 12),
                    IntrinsicHeight(
                      child: Row(
                        children: [
                          Expanded(child: _InfoStat(
                            value: '$terminalCount',
                            label: terminalCount == 1 ? 'Terminal' : 'Terminals',
                          )),
                          _VerticalRule(),
                          Expanded(child: _InfoStat(
                            value: '$restaurantCount',
                            label: 'Venues',
                          )),
                          _VerticalRule(),
                          Expanded(child: _InfoStat(
                            value: '$loungeCount',
                            label: loungeCount == 1 ? 'Lounge' : 'Lounges',
                          )),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),

              // ── Sticky tabs (fixed height — never changes) ────
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
                        _buildTabBar(context),
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                ),
              ),

              // ── Filter bar + content (scrolls) ───────────────
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (hasTerminals && _tabIndex == 0) ...[
                            Text('Terminal', style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, letterSpacing: 2.0, color: context.appMutedFg(0.40))),
                            const SizedBox(height: 5),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
                                  isDense: false,
                                  style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w500, color: context.appOnSurface),
                                  hint: Text('All terminals', style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appMutedFg(0.40))),
                                  items: [
                                    DropdownMenuItem<String?>(value: null, child: Text('All terminals', style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appOnSurface))),
                                    ..._firebaseTerminalEntries
                                        .where((t) => !t.name.toLowerCase().contains('lounge'))
                                        .map((t) => DropdownMenuItem<String?>(
                                          value: t.id,
                                          child: Text(t.name, style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appOnSurface)),
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
                                      hintText: _tabIndex == 0 ? 'Name or cuisine...' : 'Search lounges...',
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
                    const SizedBox(height: 4),
                    _buildFirebaseRestaurantSections(context, name),
                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeroImage(String? imageUrl, String? assetPath, BuildContext context) {
    if (imageUrl != null) {
      return Image.network(
        imageUrl,
        fit: BoxFit.cover,
        headers: const {'User-Agent': 'ConcourseApp/1.0 (airport-dining-guide)'},
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : Container(color: const Color(0xFF0B2D3A)),
        errorBuilder: (_, __, ___) => assetPath != null
            ? Image.asset(assetPath, fit: BoxFit.cover)
            : Container(color: const Color(0xFF0B2D3A)),
      );
    }
    if (assetPath != null) return Image.asset(assetPath, fit: BoxFit.cover);
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0B2D3A), Color(0xFF134555)],
        ),
      ),
    );
  }

  Widget _buildFirebaseRestaurantSections(BuildContext context, String airportName) {
    final showLounges = _tabIndex == 1;
    // Base set filtered by active tab
    final tabRestaurants = _firebaseRestaurants.where((r) => r.isLounge == showLounges).toList();

    if (showLounges) {
      // Lounges: group by terminal but don't use the terminal dropdown filter
      if (_firebaseTerminalEntries.isNotEmpty) {
        final sections = <Widget>[];
        for (final t in _firebaseTerminalEntries) {
          final list = _filterRestaurantsByQuery(
            tabRestaurants.where((r) => r.terminalId == t.id).toList());
          if (list.isEmpty) continue;
          if (sections.isNotEmpty) sections.add(const SizedBox(height: 20));
          sections.add(_buildRestaurantSection(context, t.name, list, airportName));
        }
        if (sections.isEmpty) return _buildEmptyState(isLounges: true);
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: sections);
      }
      final filtered = _filterRestaurantsByQuery(tabRestaurants);
      if (filtered.isEmpty) return _buildEmptyState(isLounges: true);
      return _buildRestaurantSection(context, 'Lounges', filtered, airportName);
    }

    // Restaurants & Cafés tab — respect terminal dropdown
    if (_firebaseTerminalEntries.isNotEmpty && _selectedFirebaseTerminalId != null) {
      for (final t in _firebaseTerminalEntries) {
        if (t.id == _selectedFirebaseTerminalId) {
          final filtered = _filterRestaurantsByQuery(
            tabRestaurants.where((r) => r.terminalId == t.id).toList());
          if (filtered.isEmpty) return _buildEmptyState(isLounges: false);
          return _buildRestaurantSection(context, t.name, filtered, airportName);
        }
      }
    }
    if (_firebaseTerminalEntries.isNotEmpty) {
      final sections = <Widget>[];
      for (final t in _firebaseTerminalEntries) {
        final list = _filterRestaurantsByQuery(
          tabRestaurants.where((r) => r.terminalId == t.id).toList());
        if (list.isEmpty) continue;
        if (sections.isNotEmpty) sections.add(const SizedBox(height: 20));
        sections.add(_buildRestaurantSection(context, t.name, list, airportName));
      }
      if (sections.isEmpty) return _buildEmptyState(isLounges: false);
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: sections);
    }
    final filtered = _filterRestaurantsByQuery(tabRestaurants);
    if (filtered.isEmpty) return _buildEmptyState(isLounges: false);
    return _buildRestaurantSection(context, 'All', filtered, airportName);
  }

  Widget _buildEmptyState({required bool isLounges}) {
    final hasQuery = _restaurantSearchController.text.trim().isNotEmpty;
    final String message;
    if (isLounges) {
      message = hasQuery
          ? 'No lounges match your search'
          : 'No lounge information available for this airport';
    } else {
      message = hasQuery ? 'No restaurants match your search' : 'No restaurants here';
    }
    return Padding(
      padding: const EdgeInsets.only(top: 32),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: kGold.withValues(alpha: 0.07),
                shape: BoxShape.circle,
                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
              ),
              child: Icon(
                isLounges ? Icons.airline_seat_recline_extra_rounded : Icons.search_off_rounded,
                color: kGold, size: 22,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              style: GoogleFonts.cormorant(fontSize: 20, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ─── PLACEHOLDER SCREEN ───────────────────────────────────
  Widget _buildPlaceholderScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      resizeToAvoidBottomInset: false,
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
                                  onPressed: () => context.pop(),
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

  Widget _buildRestaurantSection(BuildContext context, String terminalName, List<Restaurant> restaurants, String airportDisplayName) {
    final isExpanded = _expandedTerminals.contains(terminalName);
    final hasMore = restaurants.length > 4;
    final first4 = restaurants.take(4).toList();
    final extra  = restaurants.skip(4).toList();

    const gridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      mainAxisExtent: 190,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: _SectionHeader(title: terminalName),
        ),
        const SizedBox(height: 12),

        // First 4 — always static, never animated
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: GridView.builder(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: gridDelegate,
            itemCount: first4.length,
            itemBuilder: (context, i) =>
                _buildRestaurantCard(context, first4[i], airportDisplayName),
          ),
        ),

        // Extra items — reveal downward on expand, collapse upward on see less.
        // Child is always in the tree; only the height constraint changes so
        // AnimatedSize clips real content (not an empty box) in both directions.
        if (hasMore)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: AnimatedSize(
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              clipBehavior: Clip.antiAlias,
              child: SizedBox(
                height: isExpanded ? null : 0,
                child: Column(
                  children: [
                    const SizedBox(height: 10),
                    GridView.builder(
                      shrinkWrap: true,
                      padding: EdgeInsets.zero,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: gridDelegate,
                      itemCount: extra.length,
                      itemBuilder: (context, i) =>
                          _buildRestaurantCard(context, extra[i], airportDisplayName),
                    ),
                  ],
                ),
              ),
            ),
          ),

        if (hasMore) ...[
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: GestureDetector(
              onTap: () {
                final savedOffset = _scrollController.offset;
                setState(() => isExpanded
                    ? _expandedTerminals.remove(terminalName)
                    : _expandedTerminals.add(terminalName));
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (_scrollController.hasClients) {
                    _scrollController.jumpTo(savedOffset.clamp(
                        0.0, _scrollController.position.maxScrollExtent));
                  }
                });
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: kTeal.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: kTeal.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      isExpanded ? 'See less' : 'See more',
                      style: GoogleFonts.jost(fontSize: 13, color: kTeal, letterSpacing: 0.3),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 16, color: kTeal,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildRestaurantCard(BuildContext context, Restaurant restaurant, String airportDisplayName) {
    final outletCount = restaurant.outlets.length;
    final firstOutlet = restaurant.outlets.isNotEmpty ? restaurant.outlets.first : null;

    return GestureDetector(
      onTap: () {
        FocusScope.of(context).unfocus();
        context.push('/restaurant-detail', extra: {
          'restaurant': restaurant,
          'airportName': airportDisplayName,
        });
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: restaurant.logoUrl.isNotEmpty
                    ? Colors.white
                    : (restaurant.isLounge ? kGold : kTeal).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(
                  color: (restaurant.isLounge ? kGold : kTeal).withValues(alpha: 0.18),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: restaurant.logoUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: restaurant.logoUrl,
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) =>
                          Icon(_getRestaurantIcon(restaurant.cuisine),
                              color: restaurant.isLounge ? kGold : kTeal, size: 24),
                    )
                  : Icon(_getRestaurantIcon(restaurant.cuisine),
                      color: restaurant.isLounge ? kGold : kTeal, size: 24),
            ),
            const SizedBox(height: 12),
            Text(
              restaurant.name,
              style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w500, color: context.appOnSurface, height: 1.35),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            if (restaurant.cuisine.isNotEmpty)
              Text(
                restaurant.cuisine,
                style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, color: context.appMutedFg(0.42)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            const Spacer(),
            if (outletCount > 1)
              Row(
                children: [
                  Icon(Icons.location_on_rounded, size: 10, color: kTeal),
                  const SizedBox(width: 3),
                  Text(
                    '$outletCount locations',
                    style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w400, letterSpacing: 0.3, color: kTeal),
                  ),
                ],
              )
            else if (firstOutlet != null && firstOutlet.airside.isNotEmpty)
              Text(
                _airsideLabel(firstOutlet.airside),
                style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w400, color: context.appMutedFg(0.35)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
      ),
    );
  }

  String _airsideLabel(String airside) => switch (airside.toLowerCase()) {
    'airside' => 'After security',
    'landside' => 'Before security',
    'both' => 'Airside & landside',
    _ => '',
  };

  IconData _getRestaurantIcon(String cuisine) {
    final c = cuisine.toLowerCase();
    if (c.contains('lounge')) return Icons.airline_seat_recline_extra_rounded;
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

}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _InfoStat extends StatelessWidget {
  final String value;
  final String label;
  const _InfoStat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: GoogleFonts.jost(
            fontSize: 11, fontWeight: FontWeight.w500,
            letterSpacing: 1.4, color: kTeal,
          )),
          const SizedBox(height: 4),
          Text(value, style: GoogleFonts.cormorant(
            fontSize: 26, fontWeight: FontWeight.bold,
            color: kTeal, letterSpacing: 0.3,
          )),
        ],
      );
}

class _VerticalRule extends StatelessWidget {
  const _VerticalRule();

  @override
  Widget build(BuildContext context) => Container(
        width: 1,
        margin: const EdgeInsets.symmetric(vertical: 6),
        color: kGoldLight.withValues(alpha: 0.28),
      );
}

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
//  STICKY HEADER DELEGATE
// ─────────────────────────────────────────────────────────────
class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double minHeight;
  final double maxHeight;
  final Widget child;

  const _StickyHeaderDelegate({
    required this.minHeight,
    required this.maxHeight,
    required this.child,
  });

  @override
  double get minExtent => minHeight;

  @override
  double get maxExtent => maxHeight;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => child;

  @override
  bool shouldRebuild(_StickyHeaderDelegate old) =>
      minHeight != old.minHeight || maxHeight != old.maxHeight || child != old.child;
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
//  AIRPLANE LOADING BAR
// ─────────────────────────────────────────────────────────────
class _AirplaneLoadingBar extends StatefulWidget {
  const _AirplaneLoadingBar();

  @override
  State<_AirplaneLoadingBar> createState() => _AirplaneLoadingBarState();
}

class _AirplaneLoadingBarState extends State<_AirplaneLoadingBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _progress;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..forward();
    _progress = Tween<double>(begin: 0.0, end: 0.85)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _progress,
      builder: (_, __) {
        return LayoutBuilder(
          builder: (context, constraints) {
            final totalWidth = constraints.maxWidth;
            final fillWidth  = (totalWidth * _progress.value).clamp(0.0, totalWidth);
            return SizedBox(
              height: 28,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Track
                  Positioned(
                    bottom: 0, left: 0, right: 0,
                    child: Container(
                      height: 2,
                      decoration: BoxDecoration(
                        color: kTeal.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  // Fill
                  Positioned(
                    bottom: 0, left: 0,
                    child: Container(
                      width: fillWidth,
                      height: 2,
                      decoration: BoxDecoration(
                        color: kTeal,
                        borderRadius: BorderRadius.circular(2),
                        boxShadow: [BoxShadow(color: kTeal.withValues(alpha: 0.5), blurRadius: 6)],
                      ),
                    ),
                  ),
                  // Airplane at the tip of the fill
                  if (fillWidth > 8)
                    Positioned(
                      bottom: 1,
                      left: fillWidth - 10,
                      child: Transform.rotate(
                        angle: -math.pi / 4,
                        child: Icon(Icons.flight, size: 20, color: kTeal),
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SKELETON BOX
// ─────────────────────────────────────────────────────────────
class _SkeletonBox extends StatefulWidget {
  final double height;
  final double? width;
  const _SkeletonBox({required this.height, this.width});

  @override
  State<_SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<_SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.04, end: 0.12)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: context.appOnSurface.withValues(alpha: _anim.value),
          borderRadius: BorderRadius.circular(3),
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

class RestaurantOutlet {
  final String gateArea;
  final String airside;
  final String level;
  final String locationNotes;

  const RestaurantOutlet({
    required this.gateArea,
    required this.airside,
    required this.level,
    required this.locationNotes,
  });
}

class Restaurant {
  final String airportCode;
  final String name;
  final String cuisine;
  final String amenity;
  final String description;
  final String website;
  final String phone;
  final String logoUrl;
  final bool isLounge;
  final String? terminalId;
  final String? terminalShort;
  final String? terminalName;

  String get id {
    final safe = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    return '${airportCode}_${terminalId ?? ''}_$safe';
  }
  final bool isVegan;
  final bool isVegetarian;
  final bool isHalal;
  final bool isKosher;
  final bool isGlutenFree;
  final List<RestaurantOutlet> outlets;

  // Opening hours
  final bool open247;
  final String openingHours;
  final String openingMonday;
  final String openingTuesday;
  final String openingWednesday;
  final String openingThursday;
  final String openingFriday;
  final String openingSaturday;
  final String openingSunday;

  // Features
  final String wheelchairAccessible;
  final String takeaway;
  final String delivery;
  final String reservable;
  final String kidsMenu;

  const Restaurant({
    this.airportCode = '',
    required this.name,
    required this.cuisine,
    required this.amenity,
    required this.description,
    required this.website,
    required this.outlets,
    this.phone = '',
    this.logoUrl = '',
    this.isLounge = false,
    this.terminalId,
    this.terminalShort,
    this.terminalName,
    this.isVegan = false,
    this.isVegetarian = false,
    this.isHalal = false,
    this.isKosher = false,
    this.isGlutenFree = false,
    this.open247 = false,
    this.openingHours = '',
    this.openingMonday = '',
    this.openingTuesday = '',
    this.openingWednesday = '',
    this.openingThursday = '',
    this.openingFriday = '',
    this.openingSaturday = '',
    this.openingSunday = '',
    this.wheelchairAccessible = '',
    this.takeaway = '',
    this.delivery = '',
    this.reservable = '',
    this.kidsMenu = '',
  });
}

String _formatCuisine(String raw) => raw
    .split(RegExp(r'[_\s]+'))
    .where((w) => w.isNotEmpty)
    .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
    .join(' ');

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';
import '../services/firebase_service.dart';
import '../widgets/airport_map_widget.dart';

// ─────────────────────────────────────────────────────────────
//  DATA MODEL
// ─────────────────────────────────────────────────────────────
class _Airport {
  final String  id;
  final String  iata;
  final String  name;
  final String  city;
  final String  country;
  final String  flag;
  final int     venueCount;
  final double? lat;
  final double? lon;

  const _Airport({
    required this.id,
    required this.iata,
    required this.name,
    required this.city,
    required this.country,
    required this.flag,
    required this.venueCount,
    this.lat,
    this.lon,
  });
}

enum _NearbyStatus { loading, denied, noNearby, found }

const _kCountryFlags = {
  'Australia':            '🇦🇺',
  'Belgium':              '🇧🇪',
  'Brazil':               '🇧🇷',
  'Canada':               '🇨🇦',
  'China':                '🇨🇳',
  'France':               '🇫🇷',
  'Germany':              '🇩🇪',
  'Greece':               '🇬🇷',
  'Hong Kong':            '🇭🇰',
  'India':                '🇮🇳',
  'Ireland':              '🇮🇪',
  'Italy':                '🇮🇹',
  'Japan':                '🇯🇵',
  'Malaysia':             '🇲🇾',
  'Mexico':               '🇲🇽',
  'Netherlands':          '🇳🇱',
  'New Zealand':          '🇳🇿',
  'Nigeria':              '🇳🇬',
  'Peru':                 '🇵🇪',
  'Philippines':          '🇵🇭',
  'Portugal':             '🇵🇹',
  'Qatar':                '🇶🇦',
  'Singapore':            '🇸🇬',
  'South Africa':         '🇿🇦',
  'South Korea':          '🇰🇷',
  'Spain':                '🇪🇸',
  'Sri Lanka':            '🇱🇰',
  'Switzerland':          '🇨🇭',
  'Taiwan':               '🇹🇼',
  'Thailand':             '🇹🇭',
  'Turkey':               '🇹🇷',
  'UAE':                  '🇦🇪',
  'United Arab Emirates': '🇦🇪',
  'United Kingdom':       '🇬🇧',
  'USA':                  '🇺🇸',
  'Vietnam':              '🇻🇳',
};

const _kFeatured = [
  _Airport(id: 'heathrow', iata: 'LHR', name: 'London Heathrow',  city: 'London',    country: 'United Kingdom', flag: '🇬🇧', venueCount: 0),
  _Airport(id: 'dubai',    iata: 'DXB', name: 'Dubai Intl',       city: 'Dubai',     country: 'UAE',            flag: '🇦🇪', venueCount: 0),
  _Airport(id: 'changi',   iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore',      flag: '🇸🇬', venueCount: 0),
  _Airport(id: 'cdg',      iata: 'CDG', name: 'Paris CDG',        city: 'Paris',     country: 'France',         flag: '🇫🇷', venueCount: 0),
  _Airport(id: 'jfk',      iata: 'JFK', name: 'New York JFK',     city: 'New York',  country: 'USA',            flag: '🇺🇸', venueCount: 0),
];

const _kRecentSearchesKey = 'recent_airport_searches';

// 5 miles in km — threshold to show "You are near X"
const _kNearbyThresholdKm = 8.05;
// 100 miles in km — radius for "show nearby airports" list
const _kNearbyListRadiusKm = 160.9;

// ─────────────────────────────────────────────────────────────
//  HOME SCREEN
// ─────────────────────────────────────────────────────────────
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen>
    with TickerProviderStateMixin {
  final TextEditingController _searchCtrl   = TextEditingController();
  final FocusNode             _searchFocus  = FocusNode();

  List<_Airport> _results      = [];
  List<_Airport> _allAirports  = [];
  bool           _hasQuery      = false;
  bool           _searchFocused = false;

  final Map<String, int> _liveCounts   = {};
  final Map<String, int> _resultCounts = {};

  List<String>   _recentSearches = [];

  _NearbyStatus  _nearbyStatus   = _NearbyStatus.loading;
  _Airport?      _nearbyAirport;
  // Last known position for building the nearby list on demand
  Position?      _lastPosition;

  late final AnimationController _headerCtrl;
  late final AnimationController _actionsCtrl;
  late final AnimationController _featuredCtrl;
  late final AnimationController _ruleCtrl;

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl   = AnimationController(vsync: this, duration: dur);
    _actionsCtrl  = AnimationController(vsync: this, duration: dur);
    _featuredCtrl = AnimationController(vsync: this, duration: dur);
    _ruleCtrl     = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));

    _delayed(150, _headerCtrl);
    _delayed(250, _actionsCtrl);
    _delayed(380, _featuredCtrl);
    _delayed(500, _ruleCtrl);

    _searchFocus.addListener(() {
      if (mounted) setState(() => _searchFocused = _searchFocus.hasFocus);
    });

    _loadLiveCounts();
    _loadAirports();
    _loadRecentSearches();
    _findNearbyAirport();
  }

  // ── Data loading ──────────────────────────────────────────

  Future<void> _loadAirports() async {
    final raw = await FirebaseService.getAllAirports();
    if (!mounted) return;
    final airports = raw.map((a) {
      final code    = (a['code'] as String? ?? '').toUpperCase();
      final country = a['country'] as String? ?? '';
      return _Airport(
        id:         (a['_docId'] as String? ?? code).toLowerCase(),
        iata:       code,
        name:       a['name']  as String? ?? code,
        city:       a['city']  as String? ?? '',
        country:    country,
        flag:       _kCountryFlags[country] ?? '🌍',
        venueCount: 0,
        lat:        (a['lat'] as num?)?.toDouble(),
        lon:        (a['lon'] as num?)?.toDouble(),
      );
    }).where((a) => a.iata.isNotEmpty).toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    setState(() => _allAirports = airports);
    if (_nearbyStatus == _NearbyStatus.loading) _findNearbyAirport();
  }

  Future<void> _loadLiveCounts() async {
    final ids    = _kFeatured.map((a) => a.id).toList();
    final counts = await Future.wait(
      ids.map((id) => FirebaseService.getRestaurantCount(id)),
    );
    if (!mounted) return;
    setState(() {
      for (var i = 0; i < ids.length; i++) {
        _liveCounts[ids[i]] = counts[i];
      }
    });
  }

  Future<void> _loadResultCounts(List<_Airport> airports) async {
    final toLoad = airports
        .map((a) => a.id)
        .where((id) => !_resultCounts.containsKey(id))
        .toList();
    if (toLoad.isEmpty) return;
    final counts = await Future.wait(
      toLoad.map((id) => FirebaseService.getRestaurantCount(id)),
    );
    if (!mounted) return;
    setState(() {
      for (var i = 0; i < toLoad.length; i++) {
        _resultCounts[toLoad[i]] = counts[i];
      }
    });
  }

  // ── Recent searches ───────────────────────────────────────

  Future<void> _loadRecentSearches() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _recentSearches = prefs.getStringList(_kRecentSearchesKey) ?? [];
    });
  }

  Future<void> _saveSearch(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    final prefs  = await SharedPreferences.getInstance();
    final recent = List<String>.from(prefs.getStringList(_kRecentSearchesKey) ?? []);
    recent.remove(q);
    recent.insert(0, q);
    if (recent.length > 3) recent.length = 3;
    await prefs.setStringList(_kRecentSearchesKey, recent);
    if (mounted) setState(() => _recentSearches = recent);
  }

  // ── Nearby airport ────────────────────────────────────────

  Future<void> _findNearbyAirport() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) setState(() => _nearbyStatus = _NearbyStatus.denied);
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) setState(() => _nearbyStatus = _NearbyStatus.denied);
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low),
      );
      if (!mounted) return;
      _lastPosition = pos;

      if (_allAirports.isEmpty) {
        setState(() => _nearbyStatus = _NearbyStatus.loading);
        return;
      }
      _Airport? nearest;
      double nearestDist = double.infinity;
      for (final airport in _allAirports) {
        if (airport.lat == null || airport.lon == null) continue;
        final d = _haversineKm(pos.latitude, pos.longitude, airport.lat!, airport.lon!);
        if (d < nearestDist) {
          nearestDist = d;
          nearest     = airport;
        }
      }
      // Only "near" if within 5 miles (8.05 km)
      if (nearest != null && nearestDist <= _kNearbyThresholdKm) {
        setState(() {
          _nearbyAirport = nearest;
          _nearbyStatus  = _NearbyStatus.found;
        });
      } else {
        setState(() => _nearbyStatus = _NearbyStatus.noNearby);
      }
    } catch (_) {
      if (mounted) setState(() => _nearbyStatus = _NearbyStatus.denied);
    }
  }

  double _haversineKm(double lat1, double lon1, double lat2, double lon2) {
    const R    = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a    = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  /// Returns airports within 100 miles (160.9 km) of last known position.
  List<_Airport> _airportsWithin100Miles() {
    if (_lastPosition == null) return [];
    return _allAirports.where((a) {
      if (a.lat == null || a.lon == null) return false;
      return _haversineKm(
        _lastPosition!.latitude, _lastPosition!.longitude,
        a.lat!, a.lon!,
      ) <= _kNearbyListRadiusKm;
    }).toList()
      ..sort((a, b) {
        final dA = _haversineKm(_lastPosition!.latitude, _lastPosition!.longitude, a.lat!, a.lon!);
        final dB = _haversineKm(_lastPosition!.latitude, _lastPosition!.longitude, b.lat!, b.lon!);
        return dA.compareTo(dB);
      });
  }

  // ── Search ────────────────────────────────────────────────

  void _onSearchChanged(String value) {
    final q = value.trim().toLowerCase();
    setState(() {
      _hasQuery = q.isNotEmpty;
      _results  = q.isEmpty
          ? []
          : _allAirports
              .where((a) =>
                  a.name.toLowerCase().contains(q) ||
                  a.city.toLowerCase().contains(q) ||
                  a.country.toLowerCase().contains(q) ||
                  a.iata.toLowerCase().contains(q))
              .toList();
    });
    if (_results.isNotEmpty) _loadResultCounts(_results);
  }

  void _selectResult(_Airport airport) {
    _saveSearch(_searchCtrl.text.trim());
    context.push('/airport-detail/${airport.id}');
  }

  void _selectRecentSearch(String query) {
    _searchCtrl.text = query;
    _onSearchChanged(query);
  }

  void _handleNearbyTap() => context.push('/nearby-airports');

  void _showNearbySheet() {
    final nearbyList = _airportsWithin100Miles();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _NearbySheet(
        airports:  nearbyList,
        position:  _lastPosition!,
        haversine: _haversineKm,
        onTap: (airport) {
          Navigator.pop(context);
          context.push('/airport-detail/${airport.id}');
        },
      ),
    );
  }

  // ── Animation helper ──────────────────────────────────────

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

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    for (final c in [_headerCtrl, _actionsCtrl, _featuredCtrl, _ruleCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  // ─── BUILD ─────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            const _Background(),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header (wordmark + search)
                  _fadeUp(
                    _Header(
                      searchCtrl:     _searchCtrl,
                      searchFocus:    _searchFocus,
                      hasQuery:       _hasQuery,
                      searchFocused:  _searchFocused,
                      recentSearches: _recentSearches,
                      onChanged:      _onSearchChanged,
                      onClear: () {
                        _searchCtrl.clear();
                        _onSearchChanged('');
                        _searchFocus.requestFocus();
                      },
                      onSelectRecent: _selectRecentSearch,
                      ruleCtrl:       _ruleCtrl,
                    ),
                    _headerCtrl,
                  ),
                  // Body — search results OR default layout
                  Expanded(
                    child: _hasQuery
                        ? _buildSearchResults()
                        : _buildDefaultLayout(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Search results ─────────────────────────────────────────
  Widget _buildSearchResults() {
    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color:  kGold.withValues(alpha: 0.07),
                shape:  BoxShape.circle,
                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
              ),
              child: const Icon(Icons.search_off_rounded, color: kGold, size: 22),
            ),
            const SizedBox(height: 16),
            Text('No airports found',
                style: GoogleFonts.cormorant(fontSize: 20, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44))),
            const SizedBox(height: 4),
            Text('Try a different search term',
                style: GoogleFonts.jost(fontSize: 12, letterSpacing: 0.6, color: context.appMutedFg(0.40))),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      itemCount: _results.length,
      itemBuilder: (context, i) => _ResultCard(
        airport:    _results[i],
        venueCount: _resultCounts[_results[i].id],
        onTap:      () => _selectResult(_results[i]),
      ),
    );
  }

  // ─── Default layout — big boxes + featured at bottom ────────
  Widget _buildDefaultLayout() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Quick Actions fill available vertical space ──────
        Expanded(
          child: _fadeUp(
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SectionHeader(title: 'Quick Actions'),
                  const SizedBox(height: 12),
                  Expanded(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: _QuickBox(
                            icon:      Icons.flight_rounded,
                            iconColor: kTeal,
                            title:     'Popular Airports',
                            subtitle:  'Busiest hubs worldwide',
                            onTap:     () => context.go('/airport-search'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _NearbyBox(
                            nearbyStatus:  _nearbyStatus,
                            nearbyAirport: _nearbyAirport,
                            onTap:         _handleNearbyTap,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _actionsCtrl,
          ),
        ),
        // ── Featured strip pinned at bottom ──────────────────
        _fadeUp(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 10),
                child: const _SectionHeader(title: 'Featured'),
              ),
              SizedBox(
                height: 148,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
                  itemCount: _kFeatured.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) => _FeaturedCard(
                    airport:    _kFeatured[i],
                    venueCount: _liveCounts[_kFeatured[i].id] ?? 0,
                    onTap:      () => context.push('/airport-detail/${_kFeatured[i].id}'),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
          _featuredCtrl,
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  NEARBY AIRPORTS BOTTOM SHEET
// ─────────────────────────────────────────────────────────────
class _NearbySheet extends StatelessWidget {
  final List<_Airport>  airports;
  final Position        position;
  final double Function(double, double, double, double) haversine;
  final void Function(_Airport) onTap;

  const _NearbySheet({
    required this.airports,
    required this.position,
    required this.haversine,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Convert _Airport → MapAirportEntry for the map widget
    final mapAirports = airports
        .where((a) => a.lat != null && a.lon != null)
        .map((a) => MapAirportEntry(
              id:       a.id,
              iataCode: a.iata,
              city:     a.city,
              lat:      a.lat!,
              lon:      a.lon!,
            ))
        .toList();

    final userLatLng = LatLng(position.latitude, position.longitude);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize:     0.4,
      maxChildSize:     0.92,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color:        isDark ? const Color(0xFF1C2226) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border(top: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        ),
        child: Column(
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 12),
              width: 36, height: 4,
              decoration: BoxDecoration(
                color:        context.appMutedFg(0.20),
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Title
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
              child: Row(
                children: [
                  Text(
                    'Airports Nearby',
                    style: GoogleFonts.cormorant(
                      fontSize: 22, fontWeight: FontWeight.w400,
                      color: context.appOnSurface,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'within 100 miles',
                    style: GoogleFonts.jost(
                      fontSize: 12, color: context.appMutedFg(0.40),
                    ),
                  ),
                ],
              ),
            ),

            // ── Map ─────────────────────────────────────────
            if (mapAirports.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                child: AirportMapWidget(
                  airports:     mapAirports,
                  userLocation: userLatLng,
                  onAirportTapped: (entry) {
                    final orig = airports.firstWhere(
                      (a) => a.id == entry.id,
                      orElse: () => airports.first,
                    );
                    onTap(orig);
                  },
                ),
              ),

            // ── Section header ───────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
              child: Row(
                children: [
                  Text(
                    'Airports near you',
                    style: GoogleFonts.cormorant(
                      fontSize: 22, fontWeight: FontWeight.w400,
                      color: context.appOnSurface, letterSpacing: 0.2,
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
                    child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6)),
                  ),
                ],
              ),
            ),

            // ── Airport list ─────────────────────────────────
            Expanded(
              child: airports.isEmpty
                  ? Center(
                      child: Text(
                        'No airports within 100 miles',
                        style: GoogleFonts.jost(
                          fontSize: 14, color: context.appMutedFg(0.44),
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: scrollCtrl,
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
                      itemCount: airports.length,
                      itemBuilder: (_, i) {
                        final airport = airports[i];
                        final dist = haversine(
                          position.latitude, position.longitude,
                          airport.lat!, airport.lon!,
                        );
                        final miles = (dist / 1.60934).round();
                        return GestureDetector(
                          onTap: () => onTap(airport),
                          child: Container(
                            margin:  const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color:        appCardSurface(context),
                              borderRadius: BorderRadius.circular(3),
                              border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 40, height: 40,
                                  decoration: BoxDecoration(
                                    color:  kGold.withValues(alpha: 0.07),
                                    shape:  BoxShape.circle,
                                    border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                                  ),
                                  child: Center(
                                    child: Text(airport.flag, style: const TextStyle(fontSize: 20)),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(airport.iata,
                                          style: GoogleFonts.cormorant(
                                            fontSize: 13, color: kTeal, letterSpacing: 0.6,
                                          )),
                                      Text(airport.name,
                                          style: GoogleFonts.jost(
                                            fontSize: 14, color: context.appOnSurface,
                                          )),
                                    ],
                                  ),
                                ),
                                Text(
                                  '$miles mi',
                                  style: GoogleFonts.jost(
                                    fontSize: 12, color: context.appMutedFg(0.45),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
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
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: appPageGradientColors(context), stops: const [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  HEADER
// ─────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final TextEditingController searchCtrl;
  final FocusNode             searchFocus;
  final bool                  hasQuery;
  final bool                  searchFocused;
  final List<String>          recentSearches;
  final ValueChanged<String>  onChanged;
  final VoidCallback          onClear;
  final ValueChanged<String>  onSelectRecent;
  final AnimationController   ruleCtrl;

  const _Header({
    required this.searchCtrl,
    required this.searchFocus,
    required this.hasQuery,
    required this.searchFocused,
    required this.recentSearches,
    required this.onChanged,
    required this.onClear,
    required this.onSelectRecent,
    required this.ruleCtrl,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text('concourse',
              style: GoogleFonts.cormorant(
                fontSize: 36, fontWeight: FontWeight.w600,
                letterSpacing: 2.2,
                color: context.appOnSurface.withValues(alpha: 0.80),
              )),
          Text('airport dining guide',
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.lerp(FontWeight.w400, FontWeight.w500, 0.5),
                letterSpacing: 4.0,
                color: kTeal.withValues(alpha: 0.75),
              )),
          const SizedBox(height: 12),
          AnimatedBuilder(
            animation: ruleCtrl,
            builder: (_, __) => Transform.scale(
              scaleX: ruleCtrl.value,
              child: Container(
                height: 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [
                    Colors.transparent,
                    kGoldLight.withValues(alpha: 0.28),
                    context.appOnSurface.withValues(alpha: 0.08),
                    Colors.transparent,
                  ], stops: const [0.0, 0.3, 0.7, 1.0]),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Find airports around the world',
                style: GoogleFonts.jost(
                  fontSize: 12, letterSpacing: 2.2,
                  color: context.appMutedFg(0.40),
                )),
          ),
          const SizedBox(height: 10),
          _SearchBar(
            controller: searchCtrl,
            focusNode:  searchFocus,
            hasQuery:   hasQuery,
            onChanged:  onChanged,
            onClear:    onClear,
          ),
          if (searchFocused && recentSearches.isNotEmpty)
            _RecentSuggestions(searches: recentSearches, onSelect: onSelectRecent),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SEARCH BAR  — prominent height, plane icon
// ─────────────────────────────────────────────────────────────
class _SearchBar extends StatefulWidget {
  final TextEditingController controller;
  final FocusNode             focusNode;
  final bool                  hasQuery;
  final ValueChanged<String>  onChanged;
  final VoidCallback          onClear;

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
      if (mounted) setState(() => _focused = widget.focusNode.hasFocus);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      decoration: BoxDecoration(
        color:        appCardSurface(context),
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
          const SizedBox(width: 16),
          Icon(Icons.flight, size: 20, color: _focused ? kTeal : context.appMutedFg(0.40)),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode:  widget.focusNode,
              onChanged:  widget.onChanged,
              style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appOnSurface),
              decoration: InputDecoration(
                hintText: 'Search airports, cities...',
                hintStyle: GoogleFonts.jost(fontSize: 15, color: context.appMutedFg(0.40)),
                filled: false,
                border:        InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense:       true,
                // Tall padding = prominent search bar
                contentPadding: const EdgeInsets.symmetric(vertical: 18),
              ),
            ),
          ),
          if (widget.hasQuery)
            GestureDetector(
              onTap: widget.onClear,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Icon(Icons.close_rounded, size: 18, color: context.appMutedFg(0.40)),
              ),
            )
          else
            const SizedBox(width: 16),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  RECENT SEARCHES DROPDOWN
// ─────────────────────────────────────────────────────────────
class _RecentSuggestions extends StatelessWidget {
  final List<String>         searches;
  final ValueChanged<String> onSelect;

  const _RecentSuggestions({required this.searches, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 2),
      decoration: BoxDecoration(
        color:        appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.10), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: searches.asMap().entries.map((entry) {
          final i = entry.key; final query = entry.value;
          return InkWell(
            onTap: () => onSelect(query),
            borderRadius: BorderRadius.circular(3),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                border: i < searches.length - 1
                    ? Border(bottom: BorderSide(color: kGoldLight.withValues(alpha: 0.14)))
                    : null,
              ),
              child: Row(
                children: [
                  Icon(Icons.history_rounded, size: 14, color: context.appMutedFg(0.35)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(query, style: GoogleFonts.jost(fontSize: 13, color: context.appOnSurface.withValues(alpha: 0.75)))),
                  Icon(Icons.north_west_rounded, size: 12, color: context.appMutedFg(0.30)),
                ],
              ),
            ),
          );
        }).toList(),
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
        Expanded(child: Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])))),
        const SizedBox(width: 6),
        Transform.rotate(angle: math.pi / 4, child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6))),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  QUICK BOX  — fills its parent height
// ─────────────────────────────────────────────────────────────
class _QuickBox extends StatefulWidget {
  final IconData     icon;
  final Color        iconColor;
  final String       title;
  final String       subtitle;
  final VoidCallback onTap;

  const _QuickBox({
    required this.icon, required this.iconColor,
    required this.title, required this.subtitle, required this.onTap,
  });

  @override
  State<_QuickBox> createState() => _QuickBoxState();
}

class _QuickBoxState extends State<_QuickBox> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap:       widget.onTap,
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Container(
          // Fill all available height from the Row
          constraints: const BoxConstraints(minHeight: 120),
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
          decoration: BoxDecoration(
            color:        appCardSurface(context),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
            boxShadow: _pressed ? [] : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisAlignment:  MainAxisAlignment.center,
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: widget.iconColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Icon(widget.icon, color: widget.iconColor, size: 22),
              ),
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(widget.title, textAlign: TextAlign.center, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: context.appOnSurface)),
                  const SizedBox(height: 4),
                  Text(widget.subtitle, textAlign: TextAlign.center, style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.40))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  NEARBY BOX  — adapts to location status
// ─────────────────────────────────────────────────────────────
class _NearbyBox extends StatefulWidget {
  final _NearbyStatus nearbyStatus;
  final _Airport?     nearbyAirport;
  final VoidCallback  onTap;

  const _NearbyBox({required this.nearbyStatus, required this.nearbyAirport, required this.onTap});

  @override
  State<_NearbyBox> createState() => _NearbyBoxState();
}

class _NearbyBoxState extends State<_NearbyBox> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final found = widget.nearbyStatus == _NearbyStatus.found && widget.nearbyAirport != null;

    final Widget iconArea = found
        ? Text(widget.nearbyAirport!.flag, style: const TextStyle(fontSize: 32))
        : Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(4)),
            child: Icon(Icons.location_on_rounded, color: kTeal, size: 22),
          );

    final String title    = found ? 'Near ${widget.nearbyAirport!.iata}' : 'Nearby Airports';
    final String subtitle = found
        ? 'Explore ${widget.nearbyAirport!.city}'
        : (widget.nearbyStatus == _NearbyStatus.loading ? 'Locating...' : 'Airports near you');

    return GestureDetector(
      onTap:       widget.onTap,
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Container(
          constraints: const BoxConstraints(minHeight: 120),
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
          decoration: BoxDecoration(
            color:        appCardSurface(context),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
            boxShadow: _pressed ? [] : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisAlignment:  MainAxisAlignment.center,
            children: [
              iconArea,
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, textAlign: TextAlign.center, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: context.appOnSurface), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(subtitle, textAlign: TextAlign.center, style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.40))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  FEATURED AIRPORT CARD
// ─────────────────────────────────────────────────────────────
class _FeaturedCard extends StatelessWidget {
  final _Airport airport;
  final int      venueCount;
  final VoidCallback onTap;
  const _FeaturedCard({required this.airport, required this.venueCount, required this.onTap});

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
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment:  MainAxisAlignment.spaceBetween,
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              FractionallySizedBox(widthFactor: 1, child: Container(
                height: 2, margin: const EdgeInsets.only(bottom: 7),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [kTeal.withValues(alpha: 0.5), Colors.transparent]),
                  borderRadius: const BorderRadius.only(topLeft: Radius.circular(3), topRight: Radius.circular(3)),
                ),
              )),
              Text(airport.flag, style: const TextStyle(fontSize: 20)),
              const SizedBox(height: 5),
              Text(airport.iata, style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, color: context.appOnSurface, letterSpacing: -0.2)),
              const SizedBox(height: 2),
              Text(airport.city, overflow: TextOverflow.ellipsis, style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.40), letterSpacing: 0.6)),
            ]),
            Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(height: 1, color: kGoldLight.withValues(alpha: 0.28)),
              const SizedBox(height: 5),
              Row(children: [
                Text('$venueCount', style: GoogleFonts.cormorant(fontSize: 17, fontWeight: FontWeight.bold, color: kTeal)),
                const SizedBox(width: 4),
                Text('restaurants', style: GoogleFonts.jost(fontSize: 10, fontWeight: FontWeight.w500, color: context.appMutedFg(0.40), letterSpacing: 1.2)),
              ]),
            ]),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  RESULT CARD
// ─────────────────────────────────────────────────────────────
class _ResultCard extends StatelessWidget {
  final _Airport airport;
  final int?     venueCount;
  final VoidCallback onTap;
  const _ResultCard({required this.airport, required this.venueCount, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin:  const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: kGold.withValues(alpha: 0.07), shape: BoxShape.circle, border: Border.all(color: kGoldLight.withValues(alpha: 0.28))),
              child: Center(child: Text(airport.flag, style: const TextStyle(fontSize: 22))),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(airport.iata, style: GoogleFonts.cormorant(fontSize: 13, color: kTeal, letterSpacing: 0.6)),
              const SizedBox(height: 1),
              Text(airport.name, style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface)),
              const SizedBox(height: 1),
              Text('${airport.city}, ${airport.country}', style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.40))),
            ])),
            if (venueCount != null)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('$venueCount', style: GoogleFonts.cormorant(fontSize: 17, fontWeight: FontWeight.bold, color: kTeal)),
                Text('venues', style: GoogleFonts.jost(fontSize: 10, color: context.appMutedFg(0.40), letterSpacing: 1.2)),
              ])
            else
              SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 1.5, color: kTeal.withValues(alpha: 0.5))),
            const SizedBox(width: 10),
            Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_map/flutter_map.dart' show LatLngBounds;
import 'package:latlong2/latlong.dart';
import '../theme/app_theme.dart';
import '../services/firebase_service.dart';
import '../widgets/airport_map_widget.dart';

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
  final double? lat;
  final double? lon;

  const Airport({
    required this.id,
    required this.name,
    required this.iataCode,
    required this.city,
    required this.country,
    required this.countryCode,
    this.lat,
    this.lon,
  });

  String get flagAsset => 'assets/images/flag_${countryCode.toLowerCase()}.png';
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT SEARCH SCREEN
// ─────────────────────────────────────────────────────────────
class AirportExploreScreen extends StatefulWidget {
  final String initialQuery;
  const AirportExploreScreen({super.key, this.initialQuery = ''});

  @override
  State<AirportExploreScreen> createState() => _AirportExploreScreenState();
}

class _AirportExploreScreenState extends State<AirportExploreScreen> with TickerProviderStateMixin {
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  List<Airport> _results = [];
  bool _hasQuery = false;
  String? _selectedContinent;
  String? _selectedCountry;
  int _navDepth = 0;    // 0=continents, 1=countries, 2=airports
  int _prevNavDepth = 0;
  double _swipeProgress = 0.0;
  bool _isSwiping = false;
  bool _dragFromEdge = false;

  /// Bounds fetched from Nominatim for the currently selected country.
  /// Null while the request is in-flight; set once the response arrives.
  LatLngBounds? _countryMapBounds;

  /// Actual border polygon rings for the mask (one list per polygon/island).
  /// Each inner list is a ring of LatLng points tracing the country's border.
  List<List<LatLng>>? _countryPolygons;

  /// Session-level caches so we only call Nominatim once per country.
  static final Map<String, LatLngBounds>      _boundsCache  = {};
  static final Map<String, List<List<LatLng>>> _polygonCache = {};

  late final AnimationController _headerCtrl;
  late final AnimationController _contentCtrl;
  late final AnimationController _snapCtrl;

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  Widget _fadeUp(Widget child, AnimationController ctrl) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
            .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
        child: child,
      ),
    );
  }

  Map<String, List<Airport>> _airportsByContinent = {};
  bool _isLoading = true;

  static const _continentOrder = [
    'Europe', 'North America', 'Asia', 'Middle East',
    'South America', 'Africa', 'Oceania',
  ];

  static const Map<String, String> _continentImages = {
    'Europe': 'assets/images/europe.png',
    'North America': 'assets/images/north_america.png',
    'Asia': 'assets/images/asia.png',
    'Middle East': 'assets/images/middle_east.png',
    'Africa': 'assets/images/africa.png',
    'South America': 'assets/images/south_america.png',
    'Oceania': 'assets/images/oceania.png',
  };

  String _subtitleForContinent(String continent) {
    final cities = (_airportsByContinent[continent] ?? [])
        .map((a) => a.city)
        .toSet()
        .take(3)
        .join(' · ');
    return cities;
  }

  List<Airport> get _allAirports =>
      _airportsByContinent.values.expand((list) => list).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  Future<void> _loadAirports() async {
    final raw = await FirebaseService.getAllAirports();
    if (!mounted) return;

    final grouped = <String, List<Airport>>{};
    for (final a in raw) {
      final continent = (a['continent'] as String?)?.trim() ?? 'Other';
      final code = (a['code'] as String? ?? '').toUpperCase();
      if (code.isEmpty) continue;
      grouped.putIfAbsent(continent, () => []).add(Airport(
        id: code,
        name: a['name'] as String? ?? code,
        iataCode: code,
        city: a['city'] as String? ?? '',
        country: a['country'] as String? ?? '',
        countryCode: '',
        lat: (a['lat'] as num?)?.toDouble(),
        lon: (a['lon'] as num?)?.toDouble(),
      ));
    }
    for (final list in grouped.values) {
      list.sort((a, b) => a.name.compareTo(b.name));
    }

    final ordered = <String, List<Airport>>{};
    for (final c in _continentOrder) {
      if (grouped.containsKey(c)) ordered[c] = grouped[c]!;
    }
    for (final entry in grouped.entries) {
      if (!ordered.containsKey(entry.key)) ordered[entry.key] = entry.value;
    }

    setState(() {
      _airportsByContinent = ordered;
      _isLoading = false;
    });
  }

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl  = AnimationController(vsync: this, duration: dur);
    _contentCtrl = AnimationController(vsync: this, duration: dur);
    _snapCtrl    = AnimationController(vsync: this, duration: const Duration(milliseconds: 280));
    _snapCtrl.addListener(_onSnapTick);
    _snapCtrl.addStatusListener(_onSnapStatus);

    _delayed(150, _headerCtrl);
    _delayed(300, _contentCtrl);
    _loadAirports();

    if (widget.initialQuery.isNotEmpty) {
      _searchCtrl.text = widget.initialQuery;
      _onSearchChanged(widget.initialQuery);
    }
  }

  @override
  void dispose() {
    _headerCtrl.dispose();
    _contentCtrl.dispose();
    _snapCtrl.dispose();
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

  // ── Flag emoji helper ─────────────────────────────────────
  static const _countryIso = {
    'United Kingdom': 'GB', 'UK': 'GB', 'France': 'FR', 'Germany': 'DE',
    'Turkey': 'TR', 'USA': 'US', 'United States': 'US', 'Singapore': 'SG',
    'UAE': 'AE', 'United Arab Emirates': 'AE', 'Qatar': 'QA', 'Japan': 'JP',
    'Thailand': 'TH', 'China': 'CN', 'Hong Kong': 'HK', 'Taiwan': 'TW',
    'South Korea': 'KR', 'Australia': 'AU', 'New Zealand': 'NZ',
    'Philippines': 'PH', 'India': 'IN', 'Sri Lanka': 'LK', 'Vietnam': 'VN',
    'Netherlands': 'NL', 'Greece': 'GR', 'Brazil': 'BR', 'Peru': 'PE',
    'Nigeria': 'NG', 'South Africa': 'ZA', 'Malaysia': 'MY', 'Portugal': 'PT',
    'Ireland': 'IE', 'Spain': 'ES', 'Austria': 'AT', 'Belgium': 'BE',
    'Italy': 'IT', 'Switzerland': 'CH', 'Canada': 'CA', 'Mexico': 'MX',
    'Colombia': 'CO', 'Indonesia': 'ID', 'Saudi Arabia': 'SA', 'Jordan': 'JO',
    'Kenya': 'KE', 'Ethiopia': 'ET', 'Egypt': 'EG', 'Morocco': 'MA',
    'Pakistan': 'PK', 'Bangladesh': 'BD', 'Nepal': 'NP', 'Myanmar': 'MM',
    'Cambodia': 'KH', 'Laos': 'LA', 'Israel': 'IL', 'Kuwait': 'KW',
    'Bahrain': 'BH', 'Oman': 'OM', 'Chile': 'CL', 'Argentina': 'AR',
  };

  static String flagEmoji(String countryName) {
    final iso = _countryIso[countryName] ?? '';
    if (iso.length != 2) return '🌍';
    const base = 0x1F1E6 - 65;
    return String.fromCharCode(iso.codeUnitAt(0) + base) +
           String.fromCharCode(iso.codeUnitAt(1) + base);
  }

  // ── Navigation ────────────────────────────────────────────
  List<String> _countriesForContinent(String continent) {
    final countries = (_airportsByContinent[continent] ?? [])
        .map((a) => a.country)
        .where((c) => c.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return countries;
  }

  void _selectContinent(String c) => setState(() {
    _prevNavDepth = _navDepth;
    _selectedContinent = c;
    _navDepth = 1;
  });

  void _selectCountry(String c) {
    setState(() {
      _prevNavDepth     = _navDepth;
      _selectedCountry  = c;
      _navDepth         = 2;
      // Use cached results immediately if available; otherwise null until fetched.
      _countryMapBounds = _boundsCache[c];
      _countryPolygons  = _polygonCache[c];
    });
    _loadCountryBounds(c);
  }

  void _back() => setState(() {
    _prevNavDepth = _navDepth;
    if (_navDepth == 2) {
      _selectedCountry  = null;
      _countryMapBounds = null;
      _countryPolygons  = null;
      _navDepth = 1;
    } else {
      _selectedContinent = null;
      _navDepth = 0;
    }
  });

  // ── Country bounds + polygon (Nominatim) ─────────────────

  /// Fetches the geographic bounding box AND actual border polygon for
  /// [country] from Nominatim, caches both, then updates the map.
  Future<void> _loadCountryBounds(String country) async {
    // Already cached — just apply.
    if (_boundsCache.containsKey(country)) {
      if (mounted && _selectedCountry == country) {
        setState(() {
          _countryMapBounds = _boundsCache[country];
          _countryPolygons  = _polygonCache[country];
        });
      }
      return;
    }

    final isoCode = _countryIso[country]?.toLowerCase() ?? '';
    final (bounds, polygons) = await _fetchNominatimData(country, isoCode);

    if (!mounted || _selectedCountry != country) return;

    final resolvedBounds = bounds ?? _airportFallbackBounds(country);
    if (resolvedBounds != null) _boundsCache[country] = resolvedBounds;
    if (polygons.isNotEmpty)    _polygonCache[country] = polygons;

    setState(() {
      _countryMapBounds = resolvedBounds;
      _countryPolygons  = polygons.isEmpty ? null : polygons;
    });
  }

  /// Calls Nominatim with `polygon_geojson=1` to get both the bounding box
  /// and the actual country border geometry in one request.
  /// Returns (null, []) on any error so the caller falls back gracefully.
  Future<(LatLngBounds?, List<List<LatLng>>)> _fetchNominatimData(
      String country, String isoCode) async {
    try {
      final params = <String, String>{
        'q':              country,
        'format':         'json',
        'limit':          '1',
        'featuretype':    'country',
        'polygon_geojson': '1',
        if (isoCode.isNotEmpty) 'countrycodes': isoCode,
      };
      final uri    = Uri.https('nominatim.openstreetmap.org', '/search', params);
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 12);
      final req    = await client.getUrl(uri);
      req.headers.set(HttpHeaders.userAgentHeader, 'ConcourseAirportApp/1.0 (flutter)');
      final res    = await req.close();
      client.close();
      if (res.statusCode != 200) return (null, <List<LatLng>>[]);

      final body    = await res.transform(utf8.decoder).join();
      final results = jsonDecode(body) as List;
      if (results.isEmpty) return (null, <List<LatLng>>[]);

      final first = results.first as Map<String, dynamic>;

      // ── Bounding box ──────────────────────────────────────
      LatLngBounds? bounds;
      final bb = (first['boundingbox'] as List?)?.cast<String>();
      if (bb != null && bb.length == 4) {
        bounds = LatLngBounds(
          LatLng(double.parse(bb[0]), double.parse(bb[2])), // SW
          LatLng(double.parse(bb[1]), double.parse(bb[3])), // NE
        );
      }

      // ── Border polygon ────────────────────────────────────
      final polygons = <List<LatLng>>[];
      final geoJson  = first['geojson'] as Map<String, dynamic>?;
      if (geoJson != null) {
        polygons.addAll(_parseGeoJsonPolygons(geoJson));
      }

      return (bounds, polygons);
    } catch (_) {
      return (null, <List<LatLng>>[]);
    }
  }

  /// Converts a GeoJSON Polygon or MultiPolygon into a list of coordinate rings.
  /// Each ring becomes one hole in the world-mask polygon.
  /// GeoJSON uses [longitude, latitude] order — we swap to LatLng(lat, lon).
  List<List<LatLng>> _parseGeoJsonPolygons(Map<String, dynamic> geoJson) {
    List<LatLng> parseRing(List ring) => ring
        .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
        .toList();

    final type   = geoJson['type'] as String;
    final coords = geoJson['coordinates'] as List;

    if (type == 'Polygon') {
      // coords[0] is the outer ring; we ignore inner rings (lakes, enclaves).
      if (coords.isEmpty) return [];
      return [parseRing(coords[0] as List)];
    } else if (type == 'MultiPolygon') {
      // Each element is a polygon; take its outer ring.
      return coords
          .map((poly) => parseRing((poly as List)[0] as List))
          .toList();
    }
    return [];
  }

  /// Fallback: derive bounds from airport pin coordinates + 0.5° padding on
  /// each side. Only used when the Nominatim fetch fails.
  LatLngBounds? _airportFallbackBounds(String country) {
    final located = (_airportsByContinent[_selectedContinent] ?? [])
        .where((a) => a.country == country && a.lat != null && a.lon != null)
        .toList();
    if (located.isEmpty) return null;

    double minLat = located.first.lat!, maxLat = located.first.lat!;
    double minLon = located.first.lon!, maxLon = located.first.lon!;
    for (final a in located) {
      if (a.lat! < minLat) minLat = a.lat!;
      if (a.lat! > maxLat) maxLat = a.lat!;
      if (a.lon! < minLon) minLon = a.lon!;
      if (a.lon! > maxLon) maxLon = a.lon!;
    }
    const pad = 0.5;
    return LatLngBounds(
      LatLng((minLat - pad).clamp(-85.0, 85.0), (minLon - pad).clamp(-180.0, 180.0)),
      LatLng((maxLat + pad).clamp(-85.0, 85.0), (maxLon + pad).clamp(-180.0, 180.0)),
    );
  }


  // ── Snap animation callbacks ──────────────────────────────
  void _onSnapTick() {
    if (!_dragFromEdge) setState(() => _swipeProgress = _snapCtrl.value);
  }

  void _onSnapStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    if (_snapCtrl.value >= 0.99) {
      // Apply navigation while swipe overlay still covers the screen
      setState(() {
        _prevNavDepth = _navDepth;
        if (_navDepth == 2) {
          _selectedCountry  = null;
          _countryMapBounds = null;
          _countryPolygons  = null;
          _navDepth = 1;
        } else {
          _selectedContinent = null;
          _navDepth = 0;
        }
      });
      // Drop the overlay on the next frame (AnimatedSwitcher already settled)
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() { _isSwiping = false; _swipeProgress = 0.0; });
      });
    } else {
      setState(() { _isSwiping = false; _swipeProgress = 0.0; });
    }
  }

  // ── Gesture handlers ─────────────────────────────────────
  void _onDragStart(DragStartDetails d) {
    if (_navDepth > 0 && !_isSwiping && d.globalPosition.dx < 44) {
      _dragFromEdge = true;
      setState(() { _isSwiping = true; _swipeProgress = 0.0; });
    }
  }

  void _onDragUpdate(DragUpdateDetails d, double screenWidth) {
    if (!_dragFromEdge) return;
    setState(() {
      _swipeProgress = (_swipeProgress + d.delta.dx / screenWidth).clamp(0.0, 1.0);
    });
  }

  void _onDragEnd(DragEndDetails d) {
    if (!_dragFromEdge) return;
    _dragFromEdge = false;
    _snapCtrl.value = _swipeProgress;
    final velocity = d.primaryVelocity ?? 0;
    _snapCtrl.animateTo(
      (_swipeProgress > 0.4 || velocity > 300) ? 1.0 : 0.0,
      curve: Curves.easeOut,
    );
  }

  void _onDragCancel() {
    if (!_dragFromEdge) return;
    _dragFromEdge = false;
    _snapCtrl.value = _swipeProgress;
    _snapCtrl.animateTo(0.0, curve: Curves.easeOut);
  }

  // ── Content helpers ───────────────────────────────────────
  Widget _buildContentForDepth(int depth) => switch (depth) {
    2 => _buildAirportList(),
    1 => _buildCountryList(),
    _ => _buildContinentList(),
  };

  Widget _buildNavContent(double screenWidth) {
    final switcher = AnimatedSwitcher(
      duration: _isSwiping ? Duration.zero : const Duration(milliseconds: 300),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, animation) => SlideTransition(
        position: Tween<Offset>(
          begin: Offset(_navDepth > _prevNavDepth ? 1.0 : -1.0, 0.0),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
        child: FadeTransition(opacity: animation, child: child),
      ),
      child: switch (_navDepth) {
        2 => KeyedSubtree(
            key: ValueKey('airports_${_selectedContinent}_$_selectedCountry'),
            child: _buildAirportList(),
          ),
        1 => KeyedSubtree(
            key: ValueKey('countries_$_selectedContinent'),
            child: _buildCountryList(),
          ),
        _ => KeyedSubtree(
            key: const ValueKey('continents'),
            child: _buildContinentList(),
          ),
      },
    );

    if (!_isSwiping) return switcher;

    return ClipRect(
      child: Stack(
        children: [
          Offstage(offstage: true, child: switcher),
          // Previous screen — slides in from the left
          Positioned.fill(
            child: Transform.translate(
              offset: Offset((_swipeProgress - 1.0) * screenWidth, 0),
              child: IgnorePointer(child: _buildContentForDepth(_navDepth - 1)),
            ),
          ),
          // Current screen — slides out to the right
          Positioned.fill(
            child: Transform.translate(
              offset: Offset(_swipeProgress * screenWidth, 0),
              child: _buildContentForDepth(_navDepth),
            ),
          ),
          // Drop-shadow on the left edge of the current screen
          Positioned(
            top: 0, bottom: 0,
            left: _swipeProgress * screenWidth - 16,
            width: 16,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerRight,
                    end: Alignment.centerLeft,
                    colors: [
                      Colors.black.withValues(alpha: 0.0),
                      Colors.black.withValues(alpha: 0.20),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        resizeToAvoidBottomInset: false,
        body: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragStart: _onDragStart,
          onHorizontalDragUpdate: (d) => _onDragUpdate(d, screenWidth),
          onHorizontalDragEnd: _onDragEnd,
          onHorizontalDragCancel: _onDragCancel,
          child: Stack(
            children: [
              const _Background(),
              SafeArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _fadeUp(_buildHeader(context), _headerCtrl),
                    Expanded(
                      child: _isLoading
                          ? const Center(child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5))
                          : _hasQuery
                              ? _buildSearchResults()
                              : _fadeUp(_buildNavContent(screenWidth), _contentCtrl),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
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
              color: context.appOnSurface,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            'Search by airport, city or code',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              letterSpacing: 2.2,
              color: context.appMutedFg(0.40),
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
            subtitle: _subtitleForContinent(continent),
            count: _airportsByContinent[continent]!.length,
            imagePath: _continentImages[continent] ?? '',
            onTap: () => _selectContinent(continent),
          ),
        );
      },
    );
  }

  // ─── Country list (level 1) ───────────────────────────────
  Widget _buildCountryList() {
    final countries = _countriesForContinent(_selectedContinent!);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
          child: Row(
            children: [
              _backButton(),
              const SizedBox(width: 12),
              Expanded(child: _SectionHeader(title: _selectedContinent!)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
            itemCount: countries.length,
            itemBuilder: (context, i) {
              final country = countries[i];
              final flag = flagEmoji(country);
              return GestureDetector(
                onTap: () => _selectCountry(country),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
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
                        decoration: BoxDecoration(
                          color: kTeal.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Center(
                          child: Text(flag, style: const TextStyle(fontSize: 24)),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          country,
                          style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appOnSurface),
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ─── Airport list (level 2) ───────────────────────────────
  Widget _buildAirportList() {
    final country  = _selectedCountry!;
    final flag     = flagEmoji(country);
    final airports = (_airportsByContinent[_selectedContinent] ?? [])
        .where((a) => a.country == country)
        .toList();

    final mapEntries = airports
        .where((a) => a.lat != null && a.lon != null)
        .map((a) => MapAirportEntry(
              id:       a.id,
              iataCode: a.iataCode,
              city:     a.city,
              lat:      a.lat!,
              lon:      a.lon!,
            ))
        .toList();

    // Use the Nominatim-fetched country bounds.
    // _countryMapBounds is null briefly while the async fetch is in-flight;
    // once it resolves the widget rebuilds with the real geographic bounds.
    final bounds = _countryMapBounds;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
          child: Row(
            children: [
              _backButton(),
              const SizedBox(width: 12),
              Expanded(child: _SectionHeader(title: country)),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // ── Map — country-bounded, panning locked to this country ──
        if (mapEntries.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: AirportMapWidget(
              airports:        mapEntries,
              userLocation:    null,
              cameraBounds:    bounds,
              countryPolygons: _countryPolygons,
              onAirportTapped: (entry) =>
                  context.push('/airport-detail/${entry.id}'),
            ),
          ),
        const SizedBox(height: 16),

        // ── Airport list ─────────────────────────────────────
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
            itemCount: airports.length,
            itemBuilder: (context, i) =>
                _AirportCard(airport: airports[i], flagEmoji: flag),
          ),
        ),
      ],
    );
  }

  Widget _backButton() => GestureDetector(
    onTap: _back,
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
        color: appCardSurface(context),
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

  Widget _continentFallback() => Container(
        color: const Color(0xFF0B2D3A),
        child: const Center(
          child: Icon(Icons.flight_takeoff_rounded, color: Color(0xFF1A6B7A), size: 32),
        ),
      );

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
          height: 128,
          decoration: BoxDecoration(
            color: appCardSurface(context),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
            boxShadow: _pressed
                ? []
                : [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
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
                SizedBox.expand(
                  child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
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
                                color: context.appOnSurface,
                                letterSpacing: 0.2,
                              ),
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
                        child: widget.imagePath.isNotEmpty
                            ? Image.asset(
                                widget.imagePath,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _continentFallback(),
                              )
                            : _continentFallback(),
                      ),
                    ),
                  ],
                ),
                ), // SizedBox.expand
                // Chevron over image
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.40),
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
  final String flagEmoji;
  const _AirportCard({required this.airport, this.flagEmoji = '🌍'});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/airport-detail/${airport.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            // Flag emoji icon
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Center(
                child: Text(flagEmoji, style: const TextStyle(fontSize: 22)),
              ),
            ),
            const SizedBox(width: 14),
            // Info — IATA is the hero text
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    airport.iataCode,
                    style: GoogleFonts.cormorant(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: context.appOnSurface,
                      letterSpacing: 0.5,
                    ),
                  ),
                  Text(
                    airport.name,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: context.appMutedFg(0.55),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}

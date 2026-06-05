import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart' show LatLngBounds;
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';

import '../services/firebase_service.dart';
import '../theme/app_theme.dart';
import '../widgets/airport_map_widget.dart';

// ─────────────────────────────────────────────────────────────
//  INTERNAL AIRPORT MODEL
// ─────────────────────────────────────────────────────────────
class _Airport {
  final String id;
  final String iata;
  final String name;
  final String city;
  final String country;
  final String flag;
  final double lat;
  final double lon;
  final double distKm;

  const _Airport({
    required this.id,
    required this.iata,
    required this.name,
    required this.city,
    required this.country,
    required this.flag,
    required this.lat,
    required this.lon,
    required this.distKm,
  });
}

enum _LoadState { loading, locationDenied, done }

// ─────────────────────────────────────────────────────────────
//  ISO CODE TABLE  (mirrors airport_search_screen.dart)
// ─────────────────────────────────────────────────────────────
const _kIso = {
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

const _kFlags = {
  'Australia': '🇦🇺', 'Belgium': '🇧🇪', 'Brazil': '🇧🇷', 'Canada': '🇨🇦',
  'China': '🇨🇳', 'France': '🇫🇷', 'Germany': '🇩🇪', 'Greece': '🇬🇷',
  'Hong Kong': '🇭🇰', 'India': '🇮🇳', 'Ireland': '🇮🇪', 'Italy': '🇮🇹',
  'Japan': '🇯🇵', 'Malaysia': '🇲🇾', 'Mexico': '🇲🇽', 'Netherlands': '🇳🇱',
  'New Zealand': '🇳🇿', 'Nigeria': '🇳🇬', 'Peru': '🇵🇪', 'Philippines': '🇵🇭',
  'Portugal': '🇵🇹', 'Qatar': '🇶🇦', 'Singapore': '🇸🇬', 'South Africa': '🇿🇦',
  'South Korea': '🇰🇷', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰',
  'Switzerland': '🇨🇭', 'Taiwan': '🇹🇼', 'Thailand': '🇹🇭', 'Turkey': '🇹🇷',
  'UAE': '🇦🇪', 'United Arab Emirates': '🇦🇪',
  'United Kingdom': '🇬🇧', 'UK': '🇬🇧',
  'USA': '🇺🇸', 'United States': '🇺🇸', 'Vietnam': '🇻🇳',
};

// ─────────────────────────────────────────────────────────────
//  SCREEN
// ─────────────────────────────────────────────────────────────
class NearbyAirportsScreen extends StatefulWidget {
  const NearbyAirportsScreen({super.key});

  @override
  State<NearbyAirportsScreen> createState() => _NearbyAirportsScreenState();
}

class _NearbyAirportsScreenState extends State<NearbyAirportsScreen> {
  _LoadState           _state          = _LoadState.loading;
  double?              _userLat;
  double?              _userLon;
  String?              _userCountryIso; // 2-letter lowercase, e.g. "gb"
  List<_Airport>       _airports       = [];
  LatLngBounds?        _bounds;
  List<List<LatLng>>?  _polygons;

  // Session caches shared with airport_search_screen
  static final Map<String, LatLngBounds>       _boundsCache   = {};
  static final Map<String, List<List<LatLng>>> _polygonCache  = {};

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  // ── Initialization ─────────────────────────────────────────

  Future<void> _initialize() async {
    // 1. Location
    final pos = await _getLocation();
    if (!mounted) return;
    if (pos == null) {
      setState(() => _state = _LoadState.locationDenied);
      return;
    }
    _userLat = pos.latitude;
    _userLon = pos.longitude;

    // 2. Airports + reverse geocode in parallel
    final results = await Future.wait([
      FirebaseService.getAllAirports(),
      _reverseGeocode(pos.latitude, pos.longitude),
    ]);
    if (!mounted) return;

    final raw            = results[0] as List<Map<String, dynamic>>;
    _userCountryIso      = results[1] as String?; // "gb", "us", etc.

    // 3. Build, filter, sort
    _airports = _buildAirports(raw, pos.latitude, pos.longitude);
    setState(() => _state = _LoadState.done);

    // 4. Fetch country polygon in background
    if (_userCountryIso != null) {
      _loadCountryGeo(_userCountryIso!);
    }
  }

  // ── Location ───────────────────────────────────────────────

  Future<Position?> _getLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) return null;
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low),
      );
    } catch (_) {
      return null;
    }
  }

  // ── Reverse geocode → ISO country code ────────────────────

  Future<String?> _reverseGeocode(double lat, double lon) async {
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/reverse', {
        'lat': lat.toString(), 'lon': lon.toString(), 'format': 'json',
      });
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
      final req    = await client.getUrl(uri);
      req.headers.set(HttpHeaders.userAgentHeader, 'ConcourseAirportApp/1.0');
      final res    = await req.close();
      client.close();
      if (res.statusCode != 200) return null;
      final body = await res.transform(utf8.decoder).join();
      final data = jsonDecode(body) as Map<String, dynamic>;
      return (data['address']?['country_code'] as String?)?.toLowerCase();
    } catch (_) {
      return null;
    }
  }

  // ── Build airport list ─────────────────────────────────────

  List<_Airport> _buildAirports(
      List<Map<String, dynamic>> raw, double userLat, double userLon) {
    final list = <_Airport>[];
    for (final a in raw) {
      final code = (a['code'] as String? ?? '').toUpperCase();
      if (code.isEmpty) continue;
      final lat = (a['lat'] as num?)?.toDouble();
      final lon = (a['lon'] as num?)?.toDouble();
      if (lat == null || lon == null) continue;
      final country = a['country'] as String? ?? '';

      // Filter to user's country if we know it
      if (_userCountryIso != null) {
        final airportIso = _kIso[country]?.toLowerCase();
        if (airportIso != _userCountryIso) continue;
      }

      list.add(_Airport(
        id:     (a['_docId'] as String? ?? code).toLowerCase(),
        iata:   code,
        name:   a['name']  as String? ?? code,
        city:   a['city']  as String? ?? '',
        country: country,
        flag:   _kFlags[country] ?? '🌍',
        lat:    lat,
        lon:    lon,
        distKm: _haversine(userLat, userLon, lat, lon),
      ));
    }
    list.sort((a, b) => a.distKm.compareTo(b.distKm));
    return list;
  }

  // ── Country polygon (Nominatim) ────────────────────────────

  Future<void> _loadCountryGeo(String isoCode) async {
    // Use cache if available
    if (_boundsCache.containsKey(isoCode)) {
      if (mounted) {
        setState(() {
          _bounds   = _boundsCache[isoCode];
          _polygons = _polygonCache[isoCode];
        });
      }
      return;
    }

    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'format':          'json',
        'limit':           '1',
        'featuretype':     'country',
        'countrycodes':    isoCode,
        'polygon_geojson': '1',
        'q':               isoCode,
      });
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 12);
      final req    = await client.getUrl(uri);
      req.headers.set(HttpHeaders.userAgentHeader, 'ConcourseAirportApp/1.0');
      final res    = await req.close();
      client.close();
      if (res.statusCode != 200) return;

      final body    = await res.transform(utf8.decoder).join();
      final results = jsonDecode(body) as List;
      if (results.isEmpty) return;

      final first = results.first as Map<String, dynamic>;

      // Bounding box
      LatLngBounds? bounds;
      final bb = (first['boundingbox'] as List?)?.cast<String>();
      if (bb != null && bb.length == 4) {
        bounds = LatLngBounds(
          LatLng(double.parse(bb[0]), double.parse(bb[2])),
          LatLng(double.parse(bb[1]), double.parse(bb[3])),
        );
      }

      // Polygon
      final polygons  = <List<LatLng>>[];
      final geoJson   = first['geojson'] as Map<String, dynamic>?;
      if (geoJson != null) polygons.addAll(_parsePolygons(geoJson));

      if (bounds   != null) _boundsCache[isoCode]  = bounds;
      if (polygons.isNotEmpty) _polygonCache[isoCode] = polygons;

      if (mounted) {
        setState(() {
          _bounds   = bounds;
          _polygons = polygons.isEmpty ? null : polygons;
        });
      }
    } catch (_) { /* silently use null — map still works without polygon */ }
  }

  List<List<LatLng>> _parsePolygons(Map<String, dynamic> geoJson) {
    List<LatLng> ring(List r) =>
        r.map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
         .toList();

    final type   = geoJson['type'] as String;
    final coords = geoJson['coordinates'] as List;
    if (type == 'Polygon')      return [ring(coords[0] as List)];
    if (type == 'MultiPolygon') {
      return coords.map((p) => ring((p as List)[0] as List)).toList();
    }
    return [];
  }

  // ── Haversine ──────────────────────────────────────────────

  double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R    = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a    = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
        math.sin(dLon / 2) * math.sin(dLon / 2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  // ── BUILD ──────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            // Background gradient
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                  colors: appPageGradientColors(context),
                  stops: const [0.0, 0.55, 1.0],
                ),
              ),
            ),
            SafeArea(
              child: switch (_state) {
                _LoadState.loading       => _buildLoading(),
                _LoadState.locationDenied => _buildDenied(),
                _LoadState.done          => _buildContent(),
              },
            ),
          ],
        ),
      ),
    );
  }

  // ── Loading ────────────────────────────────────────────────

  Widget _buildLoading() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _buildHeader(),
      const Expanded(
        child: Center(
          child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5),
        ),
      ),
    ],
  );

  // ── Location denied ────────────────────────────────────────

  Widget _buildDenied() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _buildHeader(),
      Expanded(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.location_off_rounded, size: 48,
                    color: context.appMutedFg(0.35)),
                const SizedBox(height: 16),
                Text('Location Required',
                    style: GoogleFonts.cormorant(
                      fontSize: 22, fontWeight: FontWeight.w400,
                      color: context.appOnSurface,
                    )),
                const SizedBox(height: 8),
                Text('Enable location access in Settings to see airports near you.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 13, color: context.appMutedFg(0.45),
                    )),
              ],
            ),
          ),
        ),
      ),
    ],
  );

  // ── Main content ───────────────────────────────────────────

  Widget _buildContent() {
    final mapEntries = _airports.map((a) => MapAirportEntry(
      id: a.id, iataCode: a.iata, city: a.city, lat: a.lat, lon: a.lon,
    )).toList();

    final userLatLng = _userLat != null && _userLon != null
        ? LatLng(_userLat!, _userLon!)
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(),

        // ── Map ──────────────────────────────────────────────
        if (mapEntries.isNotEmpty && userLatLng != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
            child: AirportMapWidget(
              airports:        mapEntries,
              userLocation:    userLatLng,
              cameraBounds:    _bounds,
              countryPolygons: _polygons,
              onAirportTapped: (entry) =>
                  context.push('/airport-detail/${entry.id}'),
            ),
          ),

        // ── Section header ────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
          child: _SectionHeader(title: 'Airports near you'),
        ),

        // ── Airport list ──────────────────────────────────────
        Expanded(
          child: _airports.isEmpty
              ? Center(
                  child: Text(
                    'No airports found',
                    style: GoogleFonts.jost(
                      fontSize: 14, color: context.appMutedFg(0.44),
                    ),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                  itemCount: _airports.length,
                  itemBuilder: (_, i) => _NearbyAirportCard(
                    airport: _airports[i],
                    onTap:   () => context.push(
                        '/airport-detail/${_airports[i].id}'),
                  ),
                ),
        ),
      ],
    );
  }

  // ── Header (title + back button) ──────────────────────────

  Widget _buildHeader() => Padding(
    padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
    child: Row(
      children: [
        GestureDetector(
          onTap: () => context.pop(),
          child: Container(
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
            child: Icon(Icons.arrow_back_ios_new,
                size: 13, color: context.appOnSurface.withValues(alpha: 0.55)),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Nearby Airports',
                  style: GoogleFonts.cormorant(
                    fontSize: 26, fontWeight: FontWeight.w600,
                    letterSpacing: 0.2, color: context.appOnSurface,
                  )),
              Text('Airports in your country',
                  style: GoogleFonts.jost(
                    fontSize: 12, letterSpacing: 2.0,
                    color: context.appMutedFg(0.40),
                  )),
            ],
          ),
        ),
      ],
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER  (matches app_search_screen style)
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: GoogleFonts.cormorant(
              fontSize: 22, fontWeight: FontWeight.w400,
              color: context.appOnSurface, letterSpacing: 0.2,
            )),
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
          child: Container(width: 4, height: 4,
              color: kGoldLight.withValues(alpha: 0.6)),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT CARD  (matches _AirportCard in airport_search_screen)
// ─────────────────────────────────────────────────────────────
class _NearbyAirportCard extends StatelessWidget {
  final _Airport     airport;
  final VoidCallback onTap;

  const _NearbyAirportCard({required this.airport, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final dist = airport.distKm < 10
        ? '${airport.distKm.toStringAsFixed(1)} km'
        : '${airport.distKm.round()} km';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin:  const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color:        appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(
            color: context.appOnSurface.withValues(alpha: 0.06),
            blurRadius: 8, offset: const Offset(0, 2),
          )],
        ),
        child: Row(
          children: [
            // Flag
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Center(
                child: Text(airport.flag,
                    style: const TextStyle(fontSize: 22)),
              ),
            ),
            const SizedBox(width: 14),
            // IATA + name
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(airport.iata,
                      style: GoogleFonts.cormorant(
                        fontSize: 18, fontWeight: FontWeight.bold,
                        color: context.appOnSurface, letterSpacing: 0.5,
                      )),
                  Text(airport.name,
                      style: GoogleFonts.jost(
                        fontSize: 12, fontWeight: FontWeight.w400,
                        color: context.appMutedFg(0.55),
                      ),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            // Distance in green
            Text(dist,
                style: GoogleFonts.jost(
                  fontSize: 12, fontWeight: FontWeight.w500,
                  color: const Color(0xFF2EAB6E),
                )),
            const SizedBox(width: 8),
            // Chevron
            Icon(Icons.chevron_right_rounded,
                size: 16, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}

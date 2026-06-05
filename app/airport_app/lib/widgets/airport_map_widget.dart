import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';

import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  LIGHTWEIGHT DATA CLASS
//  Convert from your Airport / _Airport model at the call site.
// ─────────────────────────────────────────────────────────────
class MapAirportEntry {
  final String id;
  final String iataCode;
  final String city;
  final double lat;
  final double lon;

  const MapAirportEntry({
    required this.id,
    required this.iataCode,
    required this.city,
    required this.lat,
    required this.lon,
  });
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC WIDGET
//
//  [cameraBounds]: when provided the map is restricted to that
//  bounding box and a white mask dims everything outside it,
//  giving a "country only" view. Leave null for the worldwide
//  nearby-airports map.
// ─────────────────────────────────────────────────────────────
class AirportMapWidget extends StatefulWidget {
  final List<MapAirportEntry>         airports;
  final LatLng?                       userLocation;
  final Function(MapAirportEntry)     onAirportTapped;
  /// When set, panning is locked to this box and a white mask
  /// blanks out the area outside these bounds.
  final LatLngBounds?                 cameraBounds;
  /// Actual border polygon rings fetched from Nominatim.
  /// When provided, the mask uses the real country shape instead of a rectangle.
  /// Each list is one ring (polygon or island).
  final List<List<LatLng>>?           countryPolygons;

  const AirportMapWidget({
    super.key,
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
    this.cameraBounds,
    this.countryPolygons,
  });

  @override
  State<AirportMapWidget> createState() => _AirportMapWidgetState();
}

class _AirportMapWidgetState extends State<AirportMapWidget> {
  final MapController _ctrl = MapController();
  MapAirportEntry? _selected;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
  }

  @override
  void didUpdateWidget(AirportMapWidget old) {
    super.didUpdateWidget(old);
    if (old.airports.length != widget.airports.length ||
        old.userLocation != widget.userLocation ||
        old.cameraBounds != widget.cameraBounds) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<LatLng> get _points {
    final pts = widget.airports.map((a) => LatLng(a.lat, a.lon)).toList();
    if (widget.userLocation != null) pts.add(widget.userLocation!);
    return pts;
  }

  void _fitBounds() {
    if (!mounted) return;
    // Country mode: fit to the camera bounds with slight inset padding
    if (widget.cameraBounds != null) {
      _ctrl.fitCamera(CameraFit.bounds(
        bounds: widget.cameraBounds!,
        padding: const EdgeInsets.all(20),
      ));
      return;
    }
    // Default: fit to airport / user-location points
    final pts = _points;
    if (pts.isEmpty) return;
    if (pts.length == 1) {
      _ctrl.move(pts.first, 13);
    } else {
      _ctrl.fitCamera(CameraFit.coordinates(
        coordinates: pts,
        padding: const EdgeInsets.all(56),
      ));
    }
  }

  void _openFullScreen() {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _FullScreenMap(
          airports:        widget.airports,
          userLocation:    widget.userLocation,
          onAirportTapped: widget.onAirportTapped,
          cameraBounds:    widget.cameraBounds,
          countryPolygons: widget.countryPolygons,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 260,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          children: [
            _MapBody(
              airports:        widget.airports,
              userLocation:    widget.userLocation,
              ctrl:            _ctrl,
              selected:        _selected,
              cameraBounds:    widget.cameraBounds,
              countryPolygons: widget.countryPolygons,
              onPinTap:        (a) => setState(() => _selected = _selected == a ? null : a),
              onMapTap:        ()  => setState(() => _selected = null),
              onPopupTap:      (a) {
                setState(() => _selected = null);
                widget.onAirportTapped(a);
              },
            ),
            // Expand icon — top right
            Positioned(
              top: 8, right: 8,
              child: GestureDetector(
                onTap: _openFullScreen,
                child: Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(4),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 4)],
                  ),
                  child: const Icon(Icons.open_in_full_rounded, size: 14, color: Colors.black87),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  FULL-SCREEN MAP SCREEN
// ─────────────────────────────────────────────────────────────
class _FullScreenMap extends StatefulWidget {
  final List<MapAirportEntry>     airports;
  final LatLng?                   userLocation;
  final Function(MapAirportEntry) onAirportTapped;
  final LatLngBounds?             cameraBounds;
  final List<List<LatLng>>?       countryPolygons;

  const _FullScreenMap({
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
    this.cameraBounds,
    this.countryPolygons,
  });

  @override
  State<_FullScreenMap> createState() => _FullScreenMapState();
}

class _FullScreenMapState extends State<_FullScreenMap> {
  final MapController _ctrl = MapController();
  MapAirportEntry? _selected;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<LatLng> get _points {
    final pts = widget.airports.map((a) => LatLng(a.lat, a.lon)).toList();
    if (widget.userLocation != null) pts.add(widget.userLocation!);
    return pts;
  }

  void _fitBounds() {
    if (!mounted) return;
    if (widget.cameraBounds != null) {
      _ctrl.fitCamera(CameraFit.bounds(
        bounds: widget.cameraBounds!,
        padding: const EdgeInsets.all(32),
      ));
      return;
    }
    final pts = _points;
    if (pts.isEmpty) return;
    if (pts.length == 1) {
      _ctrl.move(pts.first, 13);
    } else {
      _ctrl.fitCamera(CameraFit.coordinates(
        coordinates: pts,
        padding: const EdgeInsets.all(80),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: Stack(
        children: [
          _MapBody(
            airports:        widget.airports,
            userLocation:    widget.userLocation,
            ctrl:            _ctrl,
            selected:        _selected,
            cameraBounds:    widget.cameraBounds,
            countryPolygons: widget.countryPolygons,
            onPinTap:        (a) => setState(() => _selected = _selected == a ? null : a),
            onMapTap:        ()  => setState(() => _selected = null),
            onPopupTap:      (a) {
              Navigator.of(context).pop();
              widget.onAirportTapped(a);
            },
          ),
          // Close button — top left
          Positioned(
            top: topPad + 12, left: 12,
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 6, offset: const Offset(0, 2))],
                ),
                child: const Icon(Icons.close_rounded, size: 18, color: Colors.black87),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SHARED MAP BODY
// ─────────────────────────────────────────────────────────────
class _MapBody extends StatelessWidget {
  final List<MapAirportEntry>     airports;
  final LatLng?                   userLocation;
  final MapController             ctrl;
  final MapAirportEntry?          selected;
  final LatLngBounds?             cameraBounds;
  final List<List<LatLng>>?       countryPolygons;
  final Function(MapAirportEntry) onPinTap;
  final VoidCallback              onMapTap;
  final Function(MapAirportEntry) onPopupTap;

  const _MapBody({
    required this.airports,
    required this.userLocation,
    required this.ctrl,
    required this.selected,
    required this.cameraBounds,
    required this.countryPolygons,
    required this.onPinTap,
    required this.onMapTap,
    required this.onPopupTap,
  });

  // CartoDB Voyager — clean road-map style, no API key needed.
  // Looks like Google Maps standard view.
  static const _tileUrl =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
  static const _tileSubdomains = ['a', 'b', 'c', 'd'];

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: ctrl,
      options: MapOptions(
        initialCenter: const LatLng(20, 0),
        initialZoom: 2,
        onTap: (_, __) => onMapTap(),
        // When cameraBounds is set: lock the map centre inside the country.
        // The user can pan freely within the country and zoom in/out, but
        // cannot drift the view to another country.
        cameraConstraint: cameraBounds != null
            ? CameraConstraint.containCenter(bounds: cameraBounds!)
            : const CameraConstraint.unconstrained(),
      ),
      children: [
        // ── Tile layer (CartoDB Voyager — clean, Google Maps-like) ──
        TileLayer(
          urlTemplate: _tileUrl,
          subdomains: _tileSubdomains,
          userAgentPackageName: 'com.concourse.airportapp',
        ),

        // ── Country mask ── (only when cameraBounds is provided)
        // World-covering white polygon with holes cut out for the country.
        // When countryPolygons is available the holes trace the real border;
        // otherwise a rectangular fallback is used while data is loading.
        if (cameraBounds != null)
          PolygonLayer(
            polygons: [
              // White world mask — holes reveal the country underneath
              Polygon(
                points: const [
                  LatLng(-85, -180),
                  LatLng(-85,  180),
                  LatLng( 85,  180),
                  LatLng( 85, -180),
                ],
                holePointsList: (countryPolygons != null && countryPolygons!.isNotEmpty)
                    // Real country border — one hole per polygon/island
                    ? countryPolygons!
                    // Rectangular fallback while polygon is still loading
                    : [
                        [
                          LatLng(cameraBounds!.south, cameraBounds!.west),
                          LatLng(cameraBounds!.south, cameraBounds!.east),
                          LatLng(cameraBounds!.north, cameraBounds!.east),
                          LatLng(cameraBounds!.north, cameraBounds!.west),
                        ]
                      ],
                color:             Colors.white.withValues(alpha: 0.96),
                isFilled:          true,
                borderStrokeWidth: 0,
                borderColor:       Colors.transparent,
              ),
              // Teal border tracing the country outline (real or rectangle)
              if (countryPolygons != null && countryPolygons!.isNotEmpty)
                ...countryPolygons!.map((ring) => Polygon(
                  points:            ring,
                  color:             Colors.transparent,
                  isFilled:          false,
                  borderStrokeWidth: 1.5,
                  borderColor:       kTeal.withValues(alpha: 0.45),
                ))
              else
                Polygon(
                  points: [
                    LatLng(cameraBounds!.south, cameraBounds!.west),
                    LatLng(cameraBounds!.south, cameraBounds!.east),
                    LatLng(cameraBounds!.north, cameraBounds!.east),
                    LatLng(cameraBounds!.north, cameraBounds!.west),
                  ],
                  color:             Colors.transparent,
                  isFilled:          false,
                  borderStrokeWidth: 1.5,
                  borderColor:       kTeal.withValues(alpha: 0.40),
                ),
            ],
          ),

        // ── User location dot ──
        if (userLocation != null)
          MarkerLayer(markers: [
            Marker(
              point:  userLocation!,
              width:  20,
              height: 20,
              child:  const _UserLocationDot(),
            ),
          ]),

        // ── Airport pins ──
        MarkerLayer(
          markers: airports.map((a) => Marker(
            point:     LatLng(a.lat, a.lon),
            width:     30,
            height:    34,
            alignment: Alignment.bottomCenter,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap:    () => onPinTap(a),
              child:    const _AirportPin(),
            ),
          )).toList(),
        ),

        // ── Popup above selected pin ──
        if (selected != null)
          MarkerLayer(markers: [
            Marker(
              point:     LatLng(selected!.lat, selected!.lon),
              width:     148,
              height:    92,
              alignment: Alignment.bottomCenter,
              child: GestureDetector(
                onTap: () => onPopupTap(selected!),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _AirportPopup(entry: selected!),
                    const SizedBox(height: 34),
                  ],
                ),
              ),
            ),
          ]),

        // ── Attribution ──
        SimpleAttributionWidget(
          source: const Text(
            '© OpenStreetMap contributors © CARTO',
            style: TextStyle(fontSize: 10),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT PIN
// ─────────────────────────────────────────────────────────────
class _AirportPin extends StatelessWidget {
  const _AirportPin();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 26, height: 26,
          decoration: BoxDecoration(
            color:  kTeal,
            shape:  BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 4, offset: const Offset(0, 2)),
            ],
          ),
          child: const Icon(Icons.flight_rounded, color: Colors.white, size: 12),
        ),
        Container(
          width: 2, height: 6,
          decoration: BoxDecoration(color: kTeal, borderRadius: BorderRadius.circular(1)),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  USER LOCATION DOT
// ─────────────────────────────────────────────────────────────
class _UserLocationDot extends StatelessWidget {
  const _UserLocationDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20, height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF2979FF),
        border: Border.all(color: Colors.white, width: 2.5),
        boxShadow: [
          BoxShadow(
            color:        const Color(0xFF2979FF).withValues(alpha: 0.45),
            blurRadius:   10,
            spreadRadius: 2,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  POPUP TOOLTIP
// ─────────────────────────────────────────────────────────────
class _AirportPopup extends StatelessWidget {
  final MapAirportEntry entry;
  const _AirportPopup({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color:        Colors.white,
        borderRadius: BorderRadius.circular(4),
        border:       Border.all(color: kGoldLight.withValues(alpha: 0.30)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry.iataCode,
                style: GoogleFonts.cormorant(
                  fontSize: 14, fontWeight: FontWeight.w600,
                  color: kTeal, letterSpacing: 0.4,
                ),
              ),
              Text(
                entry.city,
                style: GoogleFonts.jost(fontSize: 11, color: const Color(0xFF555555)),
              ),
            ],
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded, size: 14, color: kTeal),
        ],
      ),
    );
  }
}

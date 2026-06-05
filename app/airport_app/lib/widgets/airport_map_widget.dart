import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';

import '../screens/airport_search_screen.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  PUBLIC WIDGET  — collapsed 260px card with expand to fullscreen
// ─────────────────────────────────────────────────────────────
class AirportMapWidget extends StatefulWidget {
  final List<Airport>        airports;
  final LatLng?              userLocation;
  final Function(Airport)    onAirportTapped;

  const AirportMapWidget({
    super.key,
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
  });

  @override
  State<AirportMapWidget> createState() => _AirportMapWidgetState();
}

class _AirportMapWidgetState extends State<AirportMapWidget> {
  final MapController _ctrl = MapController();
  Airport? _selected;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
  }

  @override
  void didUpdateWidget(AirportMapWidget old) {
    super.didUpdateWidget(old);
    if (old.airports.length != widget.airports.length ||
        old.userLocation != widget.userLocation) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<LatLng> get _points {
    final pts = <LatLng>[];
    for (final a in widget.airports) {
      if (a.lat != null && a.lon != null) pts.add(LatLng(a.lat!, a.lon!));
    }
    if (widget.userLocation != null) pts.add(widget.userLocation!);
    return pts;
  }

  void _fitBounds() {
    if (!mounted) return;
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
          airports:       widget.airports,
          userLocation:   widget.userLocation,
          onAirportTapped: widget.onAirportTapped,
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
              airports:    widget.airports,
              userLocation: widget.userLocation,
              ctrl:        _ctrl,
              selected:    _selected,
              onPinTap:    (a) => setState(() => _selected = _selected == a ? null : a),
              onMapTap:    ()  => setState(() => _selected = null),
              onPopupTap:  (a) {
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
  final List<Airport>     airports;
  final LatLng?           userLocation;
  final Function(Airport) onAirportTapped;

  const _FullScreenMap({
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
  });

  @override
  State<_FullScreenMap> createState() => _FullScreenMapState();
}

class _FullScreenMapState extends State<_FullScreenMap> {
  final MapController _ctrl = MapController();
  Airport? _selected;

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
    final pts = <LatLng>[];
    for (final a in widget.airports) {
      if (a.lat != null && a.lon != null) pts.add(LatLng(a.lat!, a.lon!));
    }
    if (widget.userLocation != null) pts.add(widget.userLocation!);
    return pts;
  }

  void _fitBounds() {
    if (!mounted) return;
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
            airports:    widget.airports,
            userLocation: widget.userLocation,
            ctrl:        _ctrl,
            selected:    _selected,
            onPinTap:    (a) => setState(() => _selected = _selected == a ? null : a),
            onMapTap:    ()  => setState(() => _selected = null),
            onPopupTap:  (a) {
              Navigator.of(context).pop();
              widget.onAirportTapped(a);
            },
          ),
          // Close button — top left inside safe area
          Positioned(
            top: topPad + 12,
            left: 12,
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
//  SHARED MAP BODY  — used in both collapsed and full-screen
// ─────────────────────────────────────────────────────────────
class _MapBody extends StatelessWidget {
  final List<Airport>     airports;
  final LatLng?           userLocation;
  final MapController     ctrl;
  final Airport?          selected;
  final Function(Airport) onPinTap;
  final VoidCallback      onMapTap;
  final Function(Airport) onPopupTap;

  const _MapBody({
    required this.airports,
    required this.userLocation,
    required this.ctrl,
    required this.selected,
    required this.onPinTap,
    required this.onMapTap,
    required this.onPopupTap,
  });

  static const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  @override
  Widget build(BuildContext context) {
    final valid = airports.where((a) => a.lat != null && a.lon != null).toList();

    return FlutterMap(
      mapController: ctrl,
      options: MapOptions(
        initialCenter: const LatLng(20, 0),
        initialZoom: 2,
        onTap: (_, __) => onMapTap(),
      ),
      children: [
        // OSM tile layer
        TileLayer(
          urlTemplate: _tileUrl,
          userAgentPackageName: 'com.concourse.airportapp',
        ),

        // User location dot
        if (userLocation != null)
          MarkerLayer(markers: [
            Marker(
              point:  userLocation!,
              width:  20,
              height: 20,
              child:  const _UserLocationDot(),
            ),
          ]),

        // Airport pins
        MarkerLayer(
          markers: valid.map((a) => Marker(
            point:     LatLng(a.lat!, a.lon!),
            width:     30,
            height:    34,
            alignment: Alignment.bottomCenter,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => onPinTap(a),
              child: const _AirportPin(),
            ),
          )).toList(),
        ),

        // Popup above selected pin
        if (selected != null && selected!.lat != null)
          MarkerLayer(markers: [
            Marker(
              point:     LatLng(selected!.lat!, selected!.lon!),
              width:     148,
              // total height = popup (~50px) + gap (8px) + pin stem+circle (34px)
              height:    92,
              alignment: Alignment.bottomCenter,
              child: GestureDetector(
                onTap: () => onPopupTap(selected!),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _AirportPopup(airport: selected!),
                    const SizedBox(height: 34), // aligns popup base to pin tip
                  ],
                ),
              ),
            ),
          ]),

        // Attribution
        SimpleAttributionWidget(
          source: const Text(
            '© OpenStreetMap contributors',
            style: TextStyle(fontSize: 10),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  AIRPORT PIN  — teal circle + plane icon + stem
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
            color: kTeal,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 4, offset: const Offset(0, 2)),
            ],
          ),
          child: const Icon(Icons.flight_rounded, color: Colors.white, size: 12),
        ),
        // Stem
        Container(
          width: 2, height: 6,
          decoration: BoxDecoration(
            color: kTeal,
            borderRadius: BorderRadius.circular(1),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  USER LOCATION DOT  — blue filled circle, white border, glow
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
            color: const Color(0xFF2979FF).withValues(alpha: 0.45),
            blurRadius: 10,
            spreadRadius: 2,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  POPUP TOOLTIP  — shown above a tapped pin
// ─────────────────────────────────────────────────────────────
class _AirportPopup extends StatelessWidget {
  final Airport airport;
  const _AirportPopup({required this.airport});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.30)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                airport.iataCode,
                style: GoogleFonts.cormorant(
                  fontSize: 14, fontWeight: FontWeight.w600,
                  color: kTeal, letterSpacing: 0.4,
                ),
              ),
              Text(
                airport.city,
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

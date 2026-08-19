import 'dart:math' show min, max, cos;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../models/lat_lng_bounds.dart';

import '../theme/app_theme.dart';

const _kBorderSource = 'country-border-source';
const _kBorderLayer  = 'country-border-layer';

// Supplied at build time, never committed. Pass it with
//   flutter run --dart-define-from-file=.env
// (see .env.example / README) — the repo's .env is gitignored.
const _kToken = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');

// ─────────────────────────────────────────────────────────────
//  DATA CLASS  (public API unchanged)
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
//  PUBLIC WIDGET  (same API as before)
// ─────────────────────────────────────────────────────────────
class AirportMapWidget extends StatefulWidget {
  final List<MapAirportEntry> airports;
  final LatLng? userLocation;
  final Function(MapAirportEntry) onAirportTapped;
  final LatLngBounds? cameraBounds;
  final String? countryIsoCode;

  const AirportMapWidget({
    super.key,
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
    this.cameraBounds,
    this.countryIsoCode,
  });

  @override
  State<AirportMapWidget> createState() => _AirportMapWidgetState();
}

class _AirportMapWidgetState extends State<AirportMapWidget> {
  MapAirportEntry? _selected;
  ScreenCoordinate? _selScreen;

  void _clearSelection() => setState(() { _selected = null; _selScreen = null; });

  void _openFullScreen() {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _FullScreenMap(
          airports: widget.airports,
          userLocation: widget.userLocation,
          onAirportTapped: widget.onAirportTapped,
          cameraBounds: widget.cameraBounds,
          countryIsoCode: widget.countryIsoCode,
        ),
      ),
    );
  }

  double _cardHeight(double availableWidth) {
    final b = widget.cameraBounds;
    if (b == null) return 260;
    final lonSpan = b.east - b.west;
    final latSpan = b.north - b.south;
    if (lonSpan <= 0 || latSpan <= 0) return 260;
    // Cosine correction approximates Mercator aspect ratio at the country's midpoint
    final midLatRad = (b.north + b.south) / 2 * pi / 180;
    final aspectRatio = lonSpan / (latSpan / cos(midLatRad));
    return (availableWidth / aspectRatio).clamp(180.0, 380.0);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
    final height = _cardHeight(constraints.maxWidth);
    return SizedBox(
      height: height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          children: [
            _MapView(
              airports: widget.airports,
              userLocation: widget.userLocation,
              cameraBounds: widget.cameraBounds,
              countryIsoCode: widget.countryIsoCode,
              onPinTap: (a, pos) => setState(() {
                if (_selected == a) {
                  _selected = null;
                  _selScreen = null;
                } else {
                  _selected = a;
                  _selScreen = pos;
                }
              }),
              onMapTap: _clearSelection,
            ),
            if (_selected != null && _selScreen != null)
              Positioned(
                left: (_selScreen!.x - 74).clamp(4.0, double.infinity),
                top: (_selScreen!.y - 96).clamp(4.0, double.infinity),
                child: GestureDetector(
                  onTap: () {
                    final a = _selected!;
                    _clearSelection();
                    widget.onAirportTapped(a);
                  },
                  child: _AirportPopup(entry: _selected!),
                ),
              ),
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
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  FULL-SCREEN MAP
// ─────────────────────────────────────────────────────────────
class _FullScreenMap extends StatefulWidget {
  final List<MapAirportEntry> airports;
  final LatLng? userLocation;
  final Function(MapAirportEntry) onAirportTapped;
  final LatLngBounds? cameraBounds;
  final String? countryIsoCode;

  const _FullScreenMap({
    required this.airports,
    required this.userLocation,
    required this.onAirportTapped,
    this.cameraBounds,
    this.countryIsoCode,
  });

  @override
  State<_FullScreenMap> createState() => _FullScreenMapState();
}

class _FullScreenMapState extends State<_FullScreenMap> {
  MapAirportEntry? _selected;
  ScreenCoordinate? _selScreen;

  void _clearSelection() => setState(() { _selected = null; _selScreen = null; });

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: Stack(
        children: [
          _MapView(
            airports: widget.airports,
            userLocation: widget.userLocation,
            cameraBounds: widget.cameraBounds,
            countryIsoCode: widget.countryIsoCode,
            fullScreenPadding: true,
            onPinTap: (a, pos) => setState(() {
              if (_selected == a) {
                _selected = null;
                _selScreen = null;
              } else {
                _selected = a;
                _selScreen = pos;
              }
            }),
            onMapTap: _clearSelection,
          ),
          if (_selected != null && _selScreen != null)
            Positioned(
              left: (_selScreen!.x - 74).clamp(4.0, double.infinity),
              top: (_selScreen!.y - 96).clamp(4.0, double.infinity),
              child: GestureDetector(
                onTap: () {
                  final a = _selected!;
                  Navigator.of(context).pop();
                  widget.onAirportTapped(a);
                },
                child: _AirportPopup(entry: _selected!),
              ),
            ),
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
//  SHARED MAP VIEW
// ─────────────────────────────────────────────────────────────
class _MapView extends StatefulWidget {
  final List<MapAirportEntry> airports;
  final LatLng? userLocation;
  final LatLngBounds? cameraBounds;
  final String? countryIsoCode;
  final bool fullScreenPadding;
  final Function(MapAirportEntry, ScreenCoordinate) onPinTap;
  final VoidCallback onMapTap;

  const _MapView({
    required this.airports,
    required this.userLocation,
    required this.cameraBounds,
    this.countryIsoCode,
    this.fullScreenPadding = false,
    required this.onPinTap,
    required this.onMapTap,
  });

  @override
  State<_MapView> createState() => _MapViewState();
}

class _MapViewState extends State<_MapView> {
  MapboxMap? _map;
  PointAnnotationManager? _pinManager;
  final Map<String, MapAirportEntry> _pinIndex = {};
  bool _ready = false;
  Brightness? _brightness;

  String get _styleUri => _brightness == Brightness.dark
      ? MapboxStyles.DARK
      : MapboxStyles.LIGHT;

  @override
  void initState() {
    super.initState();
    assert(
      _kToken.isNotEmpty,
      'MAPBOX_ACCESS_TOKEN is empty — the map will render blank. '
      'Build/run with --dart-define-from-file=.env',
    );
    MapboxOptions.setAccessToken(_kToken);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final brightness = Theme.of(context).brightness;
    if (_brightness != null && _brightness != brightness) {
      _brightness = brightness;
      _map?.loadStyleURI(_styleUri);
    } else {
      _brightness = brightness;
    }
  }

  @override
  void didUpdateWidget(_MapView old) {
    super.didUpdateWidget(old);
    if (!_ready) return;
    if (old.airports != widget.airports || old.userLocation != widget.userLocation) {
      _refresh();
    }
    if (old.countryIsoCode != widget.countryIsoCode) {
      _updateCountryBorder();
    }
    if (old.cameraBounds != widget.cameraBounds) {
      _applyBounds();
    }
  }

  Future<void> _onMapCreated(MapboxMap map) async {
    _map = map;
    await map.setCamera(CameraOptions(
      center: Point(coordinates: Position(0, 20)),
      zoom: 2.0,
    ));
    // ignore: deprecated_member_use
    map.setOnMapTapListener((_) => widget.onMapTap());
    await _applyBoundsLock();
  }

  /// Updates the pan-lock to the current cameraBounds.
  Future<void> _applyBoundsLock() async {
    if (_map == null || widget.cameraBounds == null) return;
    final b = widget.cameraBounds!;
    await _map!.setBounds(CameraBoundsOptions(
      bounds: CoordinateBounds(
        southwest: Point(coordinates: Position(b.west, b.south)),
        northeast: Point(coordinates: Position(b.east, b.north)),
        infiniteBounds: false,
      ),
    ));
  }

  /// Updates pan-lock AND re-centres the camera. Called when cameraBounds changes.
  Future<void> _applyBounds() async {
    await _applyBoundsLock();
    await _fitBounds();
  }

  Future<void> _onStyleLoaded(StyleLoadedEventData _) async {
    _pinManager = await _map!.annotations.createPointAnnotationManager();
    // ignore: deprecated_member_use
    _pinManager!.addOnPointAnnotationClickListener(
      _PinClickListener(pinIndex: _pinIndex, map: _map!, onTap: widget.onPinTap),
    );
    await _addCountryBorder();
    _ready = true;
    await _refresh();
  }

  Future<void> _addCountryBorder() async {
    final iso = widget.countryIsoCode?.toUpperCase();
    if (iso == null || iso.isEmpty) return;

    await _map!.style.addSource(VectorSource(
      id: _kBorderSource,
      url: 'mapbox://mapbox.country-boundaries-v1',
    ));
    await _map!.style.addLayer(LineLayer(
      id: _kBorderLayer,
      sourceId: _kBorderSource,
      sourceLayer: 'country_boundaries',
      filter: ['==', ['get', 'iso_3166_1'], iso],
      lineColor: 0xFF1AABAB,
      lineWidth: 2.5,
      lineOpacity: 1.0,
    ));
  }

  Future<void> _updateCountryBorder() async {
    if (_map == null) return;
    try { await _map!.style.removeStyleLayer(_kBorderLayer); } catch (_) {}
    try { await _map!.style.removeStyleSource(_kBorderSource); } catch (_) {}
    await _addCountryBorder();
  }

  Future<void> _refresh() async {
    await _addPins();
    await _fitBounds();
  }

  Future<void> _addPins() async {
    if (_pinManager == null) return;
    await _pinManager!.deleteAll();
    _pinIndex.clear();

    final pinImg = await _renderPin();
    for (final a in widget.airports) {
      final ann = await _pinManager!.create(PointAnnotationOptions(
        geometry: Point(coordinates: Position(a.lon, a.lat)),
        image: pinImg,
        iconAnchor: IconAnchor.BOTTOM,
        iconSize: 1.0,
      ));
      _pinIndex[ann.id] = a;
    }

    if (widget.userLocation != null) {
      final dotImg = await _renderUserDot();
      await _pinManager!.create(PointAnnotationOptions(
        geometry: Point(coordinates: Position(
          widget.userLocation!.longitude,
          widget.userLocation!.latitude,
        )),
        image: dotImg,
        iconAnchor: IconAnchor.CENTER,
        iconSize: 1.0,
      ));
    }
  }


  Future<void> _fitBounds() async {
    if (_map == null) return;
    final pad = widget.fullScreenPadding ? 80.0 : 56.0;

    if (widget.cameraBounds != null) {
      final b = widget.cameraBounds!;
      final cam = await _map!.cameraForCoordinateBounds(
        CoordinateBounds(
          southwest: Point(coordinates: Position(b.west, b.south)),
          northeast: Point(coordinates: Position(b.east, b.north)),
          infiniteBounds: false,
        ),
        MbxEdgeInsets(top: 8, left: 8, bottom: 8, right: 8),
        null, null, null, null,
      );
      await _map!.setCamera(cam);
      return;
    }

    final pts = [
      ...widget.airports.map((a) => (lon: a.lon, lat: a.lat)),
      if (widget.userLocation != null)
        (lon: widget.userLocation!.longitude, lat: widget.userLocation!.latitude),
    ];
    if (pts.isEmpty) return;

    if (pts.length == 1) {
      await _map!.setCamera(CameraOptions(
        center: Point(coordinates: Position(pts.first.lon, pts.first.lat)),
        zoom: 13.0,
      ));
    } else {
      final lons = pts.map((p) => p.lon).toList();
      final lats = pts.map((p) => p.lat).toList();
      final cam = await _map!.cameraForCoordinateBounds(
        CoordinateBounds(
          southwest: Point(coordinates: Position(lons.reduce(min), lats.reduce(min))),
          northeast: Point(coordinates: Position(lons.reduce(max), lats.reduce(max))),
          infiniteBounds: false,
        ),
        MbxEdgeInsets(top: pad, left: pad, bottom: pad, right: pad),
        null, null, null, null,
      );
      await _map!.setCamera(cam);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MapWidget(
      styleUri: _styleUri,
      onMapCreated: _onMapCreated,
      onStyleLoadedListener: _onStyleLoaded,
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  PIN CLICK LISTENER
// ─────────────────────────────────────────────────────────────
// ignore: deprecated_member_use
class _PinClickListener extends OnPointAnnotationClickListener {
  final Map<String, MapAirportEntry> pinIndex;
  final MapboxMap map;
  final Function(MapAirportEntry, ScreenCoordinate) onTap;

  _PinClickListener({required this.pinIndex, required this.map, required this.onTap});

  @override
  void onPointAnnotationClick(PointAnnotation annotation) async {
    final airport = pinIndex[annotation.id];
    if (airport == null) return;
    final screenPos = await map.pixelForCoordinate(
      Point(coordinates: Position(airport.lon, airport.lat)),
    );
    onTap(airport, screenPos);
  }
}

// ─────────────────────────────────────────────────────────────
//  BITMAP RENDERERS
// ─────────────────────────────────────────────────────────────
Future<Uint8List> _renderPin() async {
  const sz = 26.0, stemH = 6.0, r = sz / 2;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  canvas.drawCircle(Offset(r, r + 1.5), r,
    Paint()..color = Colors.black.withValues(alpha: 0.25)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
  canvas.drawCircle(Offset(r, r), r, Paint()..color = kTeal);
  canvas.drawCircle(Offset(r, r), r - 1,
    Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2);
  canvas.drawRRect(
    RRect.fromRectAndRadius(Rect.fromLTWH(r - 1, sz, 2, stemH), Radius.circular(1)),
    Paint()..color = kTeal,
  );

  final tp = TextPainter(textDirection: TextDirection.ltr)
    ..text = TextSpan(
      text: String.fromCharCode(Icons.flight_rounded.codePoint),
      style: TextStyle(fontSize: 12, color: Colors.white,
        fontFamily: Icons.flight_rounded.fontFamily,
        package: Icons.flight_rounded.fontPackage),
    )
    ..layout();
  tp.paint(canvas, Offset(r - tp.width / 2, r - tp.height / 2));

  final img = await recorder.endRecording().toImage(sz.toInt(), (sz + stemH).toInt());
  return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
}

Future<Uint8List> _renderUserDot() async {
  const sz = 20.0, r = sz / 2;
  const blue = Color(0xFF2979FF);

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  canvas.drawCircle(Offset(r, r), r,
    Paint()..color = blue.withValues(alpha: 0.30)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5));
  canvas.drawCircle(Offset(r, r), r - 2.5, Paint()..color = blue);
  canvas.drawCircle(Offset(r, r), r - 2.5,
    Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2.5);

  final img = await recorder.endRecording().toImage(sz.toInt(), sz.toInt());
  return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
}



// ─────────────────────────────────────────────────────────────
//  POPUP CARD  (unchanged from original)
// ─────────────────────────────────────────────────────────────
class _AirportPopup extends StatelessWidget {
  final MapAirportEntry entry;
  const _AirportPopup({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.30)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.iataCode,
                style: GoogleFonts.cormorant(fontSize: 14, fontWeight: FontWeight.w600, color: kTeal, letterSpacing: 0.4)),
              Text(entry.city,
                style: GoogleFonts.jost(fontSize: 11, color: const Color(0xFF555555))),
            ],
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded, size: 14, color: kTeal),
        ],
      ),
    );
  }
}

import 'package:latlong2/latlong.dart';

class LatLngBounds {
  final double south;
  final double west;
  final double north;
  final double east;

  const LatLngBounds.fromLTRB({
    required this.south,
    required this.west,
    required this.north,
    required this.east,
  });

  // Matches flutter_map's LatLngBounds(sw, ne) constructor
  factory LatLngBounds(LatLng sw, LatLng ne) => LatLngBounds.fromLTRB(
    south: sw.latitude,
    west:  sw.longitude,
    north: ne.latitude,
    east:  ne.longitude,
  );
}

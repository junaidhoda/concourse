import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/admin_service.dart';
import '../services/firebase_service.dart';

class AdminAirportScreen extends StatefulWidget {
  final String airportCode;
  const AdminAirportScreen({super.key, required this.airportCode});

  @override
  State<AdminAirportScreen> createState() => _AdminAirportScreenState();
}

class _AdminAirportScreenState extends State<AdminAirportScreen> {
  // terminalId → list of restaurant docs
  Map<String, List<Map<String, dynamic>>> _terminalRestaurants = {};
  Map<String, String> _terminalNames = {};
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final terminals = await AdminService.getTerminals(widget.airportCode);
      final Map<String, List<Map<String, dynamic>>> grouped = {};
      final Map<String, String> names = {};

      await Future.wait(terminals.map((t) async {
        final id   = t['id'] as String;
        final name = t['name'] as String? ?? id;
        names[id]   = name;
        grouped[id] = await AdminService.getRestaurantsForTerminal(widget.airportCode, id);
      }));

      // Keep terminals in the order Firestore returned them
      final orderedIds = terminals.map((t) => t['id'] as String).toList();
      final ordered = { for (final id in orderedIds) id: grouped[id] ?? [] };

      if (mounted) setState(() {
        _terminalRestaurants = ordered;
        _terminalNames = names;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  String get _airportName =>
      FirebaseService.getAirportName(widget.airportCode.toUpperCase());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          _Background(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Header ──────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => context.go('/admin/dashboard'),
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
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_airportName, style: GoogleFonts.cormorant(
                              fontSize: 22, fontWeight: FontWeight.w600,
                              color: context.appOnSurface, letterSpacing: 0.2,
                            )),
                            Text(widget.airportCode.toUpperCase(), style: GoogleFonts.jost(
                              fontSize: 11, fontWeight: FontWeight.w400,
                              letterSpacing: 2.5, color: kTeal,
                            )),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: _rule(context)),
                const SizedBox(height: 8),

                // ── Content ──────────────────────────────────
                Expanded(
                  child: _isLoading
                      ? Center(child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5))
                      : _error != null
                          ? _ErrorState(message: _error!, onRetry: _load)
                          : _terminalRestaurants.isEmpty
                              ? Center(child: Text('No terminals found', style: GoogleFonts.jost(color: context.appMutedFg(0.45))))
                              : ListView.builder(
                                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
                                  itemCount: _terminalRestaurants.length,
                                  itemBuilder: (context, i) {
                                    final terminalId   = _terminalRestaurants.keys.elementAt(i);
                                    final terminalName = _terminalNames[terminalId] ?? terminalId;
                                    final restaurants  = _terminalRestaurants[terminalId]!;
                                    return _TerminalSection(
                                      terminalName: terminalName,
                                      restaurants: restaurants,
                                      onAdd: () => context.go('/admin/restaurant/${widget.airportCode}/$terminalId/new'),
                                      onEdit: (r) => context.go('/admin/restaurant/${widget.airportCode}/$terminalId/${r['id']}'),
                                    );
                                  },
                                ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  TERMINAL SECTION
// ─────────────────────────────────────────────────────────────
class _TerminalSection extends StatelessWidget {
  final String terminalName;
  final List<Map<String, dynamic>> restaurants;
  final VoidCallback onAdd;
  final void Function(Map<String, dynamic>) onEdit;

  const _TerminalSection({
    required this.terminalName,
    required this.restaurants,
    required this.onAdd,
    required this.onEdit,
  });

  IconData _icon(String amenity) {
    return switch (amenity.toLowerCase()) {
      'cafe'          => Icons.coffee,
      'bar' || 'pub'  => Icons.local_bar,
      'fast_food'     => Icons.fastfood,
      'bakery'        => Icons.bakery_dining,
      'ice_cream'     => Icons.icecream,
      'food_court'    => Icons.storefront,
      _               => Icons.restaurant,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Terminal header row
        Row(
          children: [
            Expanded(child: _SectionHeader(title: terminalName)),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: onAdd,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: kTeal.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: kTeal.withValues(alpha: 0.30)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, size: 13, color: kTeal),
                    const SizedBox(width: 4),
                    Text('Add', style: GoogleFonts.jost(fontSize: 11, color: kTeal, letterSpacing: 0.3)),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        if (restaurants.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: Text('No venues yet', style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.38))),
          )
        else
          ...restaurants.map((r) {
            final name   = r['name'] as String? ?? 'Unnamed';
            final amenity = r['amenity'] as String? ?? 'restaurant';
            final cuisine = r['cuisine'] as String? ?? '';
            final outletCount = (r['outlets'] as List?)?.length ?? 0;
            return GestureDetector(
              onTap: () => onEdit(r),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: appCardSurface(context),
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                  boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2))],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: kTeal.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Icon(_icon(amenity), color: kTeal, size: 17),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500, color: context.appOnSurface)),
                          if (cuisine.isNotEmpty)
                            Text(cuisine, style: GoogleFonts.jost(fontSize: 11, color: context.appMutedFg(0.42))),
                        ],
                      ),
                    ),
                    if (outletCount > 1) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: kTeal.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Text('$outletCount locations', style: GoogleFonts.jost(fontSize: 10, color: kTeal)),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Icon(Icons.edit_rounded, size: 15, color: context.appMutedFg(0.30)),
                  ],
                ),
              ),
            );
          }),

        const SizedBox(height: 16),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SHARED WIDGETS
// ─────────────────────────────────────────────────────────────
class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded, color: kGold, size: 40),
            const SizedBox(height: 16),
            Text('Something went wrong', style: GoogleFonts.cormorant(fontSize: 20, color: context.appOnSurface)),
            const SizedBox(height: 8),
            Text(message, style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.45)), textAlign: TextAlign.center),
            const SizedBox(height: 20),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
                decoration: BoxDecoration(color: kTeal, borderRadius: BorderRadius.circular(3)),
                child: Text('Retry', style: GoogleFonts.jost(fontSize: 13, color: Colors.white, letterSpacing: 0.5)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Widget _rule(BuildContext context) => Container(
  height: 1,
  decoration: BoxDecoration(
    gradient: LinearGradient(
      colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28), context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
      stops: const [0.0, 0.3, 0.7, 1.0],
    ),
  ),
);

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Flexible(child: Text(title, style: GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, color: context.appOnSurface, letterSpacing: 0.2), overflow: TextOverflow.ellipsis)),
        const SizedBox(width: 8),
        Expanded(child: Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])))),
        const SizedBox(width: 6),
        Transform.rotate(angle: math.pi / 4, child: Container(width: 3, height: 3, color: kGoldLight.withValues(alpha: 0.6))),
      ],
    );
  }
}

class _Background extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: appPageGradientColors(context),
        stops: const [0.0, 0.55, 1.0],
      ),
    ),
  );
}

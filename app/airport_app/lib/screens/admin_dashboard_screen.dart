import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/admin_service.dart';
import '../services/firebase_service.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  List<_AirportRow> _airports = [];
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
      final docs = await AdminService.getAllAirports();
      final rows = await Future.wait(docs.map((d) async {
        final slug = d['id'] as String;
        final counts = await AdminService.getAirportCounts(slug);
        return _AirportRow(
          slug: slug,
          name: d['name'] as String? ?? FirebaseService.getAirportName(slug.toUpperCase()),
          continent: d['continent'] as String? ?? 'Other',
          terminalCount: counts['terminals'] ?? 0,
          restaurantCount: counts['restaurants'] ?? 0,
        );
      }));
      rows.sort((a, b) => a.name.compareTo(b.name));
      if (mounted) setState(() { _airports = rows; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  static const _continentOrder = [
    'Europe', 'North America', 'Asia', 'Middle East',
    'South America', 'Africa', 'Oceania', 'Other',
  ];

  Widget _buildGroupedList(BuildContext context) {
    final grouped = <String, List<_AirportRow>>{};
    for (final row in _airports) {
      grouped.putIfAbsent(row.continent, () => []).add(row);
    }

    final sections = <MapEntry<String, List<_AirportRow>>>[];
    for (final c in _continentOrder) {
      if (grouped.containsKey(c)) sections.add(MapEntry(c, grouped[c]!));
    }
    for (final entry in grouped.entries) {
      if (!_continentOrder.contains(entry.key)) sections.add(entry);
    }

    final items = <Widget>[];
    for (final section in sections) {
      items.add(Padding(
        padding: EdgeInsets.only(top: items.isEmpty ? 0 : 20, bottom: 12),
        child: _SectionHeader(title: section.key),
      ));
      for (final row in section.value) {
        items.add(Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _AirportCard(
            row: row,
            onTap: () => context.go('/admin/airport/${row.slug}'),
          ),
        ));
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
      children: items,
    );
  }

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
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Admin', style: GoogleFonts.cormorant(
                              fontSize: 28, fontWeight: FontWeight.w600,
                              color: context.appOnSurface, letterSpacing: 0.2,
                            )),
                            Text('DASHBOARD', style: GoogleFonts.jost(
                              fontSize: 11, fontWeight: FontWeight.w400,
                              letterSpacing: 2.5, color: context.appMutedFg(0.40),
                            )),
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: () { AdminService.logout(); context.go('/explore'); },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: appCardSurface(context),
                            borderRadius: BorderRadius.circular(3),
                            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                            boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2))],
                          ),
                          child: Text('Log out', style: GoogleFonts.jost(
                            fontSize: 12, fontWeight: FontWeight.w400,
                            letterSpacing: 0.5, color: context.appMutedFg(0.55),
                          )),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: _rule(context),
                ),
                const SizedBox(height: 20),

                // ── Content ──────────────────────────────────
                Expanded(
                  child: _isLoading
                      ? const Center(child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5))
                      : _error != null
                          ? _ErrorState(message: _error!, onRetry: _load)
                          : _airports.isEmpty
                              ? Center(child: Text('No airports found', style: GoogleFonts.jost(color: context.appMutedFg(0.45))))
                              : _buildGroupedList(context),
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
class _AirportRow {
  final String slug;
  final String name;
  final String continent;
  final int terminalCount;
  final int restaurantCount;
  const _AirportRow({required this.slug, required this.name, required this.continent, required this.terminalCount, required this.restaurantCount});
}

class _AirportCard extends StatelessWidget {
  final _AirportRow row;
  final VoidCallback onTap;
  const _AirportCard({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: kTeal.withValues(alpha: 0.18)),
              ),
              child: const Icon(Icons.flight_rounded, color: kTeal, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(row.name, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: context.appOnSurface)),
                  const SizedBox(height: 2),
                  Text(
                    '${row.terminalCount} ${row.terminalCount == 1 ? 'terminal' : 'terminals'} · ${row.restaurantCount} venues',
                    style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, color: context.appMutedFg(0.42)),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 18, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}

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
                decoration: BoxDecoration(
                  color: kTeal,
                  borderRadius: BorderRadius.circular(3),
                ),
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
        Text(title, style: GoogleFonts.cormorant(fontSize: 20, fontWeight: FontWeight.w400, color: context.appOnSurface, letterSpacing: 0.2)),
        const SizedBox(width: 10),
        Expanded(child: Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])))),
        const SizedBox(width: 6),
        Transform.rotate(angle: math.pi / 4, child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6))),
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

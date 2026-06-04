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
  Map<String, List<Map<String, dynamic>>> _terminalRestaurants = {};
  Map<String, String> _terminalNames = {};
  Map<String, dynamic>? _airportDetails;
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
      final results = await Future.wait([
        AdminService.getAirportDetails(widget.airportCode),
        AdminService.getTerminals(widget.airportCode),
      ]);
      final details   = results[0] as Map<String, dynamic>?;
      final terminals = results[1] as List<Map<String, dynamic>>;

      final Map<String, List<Map<String, dynamic>>> grouped = {};
      final Map<String, String> names = {};
      await Future.wait(terminals.map((t) async {
        final id   = t['id'] as String;
        final name = t['name'] as String? ?? id;
        names[id]   = name;
        grouped[id] = await AdminService.getRestaurantsForTerminal(widget.airportCode, id);
      }));

      final orderedIds = terminals.map((t) => t['id'] as String).toList();
      final ordered = { for (final id in orderedIds) id: grouped[id] ?? [] };

      if (mounted) setState(() {
        _airportDetails      = details;
        _terminalRestaurants = ordered;
        _terminalNames       = names;
        _isLoading           = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  String get _airportName {
    if (_airportDetails != null) {
      return _airportDetails!['name'] as String? ??
          FirebaseService.getAirportName(widget.airportCode.toUpperCase());
    }
    return FirebaseService.getAirportName(widget.airportCode.toUpperCase());
  }

  void _showEditAirportSheet(BuildContext context) {
    final d = _airportDetails ?? {};
    final nameCtrl      = TextEditingController(text: d['name']    as String? ?? '');
    final codeCtrl      = TextEditingController(text: d['code']    as String? ?? widget.airportCode.toUpperCase());
    final cityCtrl      = TextEditingController(text: d['city']    as String? ?? '');
    final countryCtrl   = TextEditingController(text: d['country'] as String? ?? '');
    final latCtrl       = TextEditingController(text: (d['lat']  ?? '').toString());
    final lonCtrl       = TextEditingController(text: (d['lon']  ?? '').toString());
    String selectedContinent = d['continent'] as String? ?? 'Other';

    const continents = ['Europe', 'North America', 'Asia', 'Middle East',
                        'South America', 'Africa', 'Oceania', 'Other'];
    if (!continents.contains(selectedContinent)) selectedContinent = 'Other';

    bool saving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> save() async {
            setSheetState(() => saving = true);
            final data = {
              'name':      nameCtrl.text.trim(),
              'code':      codeCtrl.text.trim().toUpperCase(),
              'city':      cityCtrl.text.trim(),
              'country':   countryCtrl.text.trim(),
              'continent': selectedContinent,
              if (double.tryParse(latCtrl.text) != null) 'lat': double.parse(latCtrl.text),
              if (double.tryParse(lonCtrl.text) != null) 'lon': double.parse(lonCtrl.text),
            };
            final ok = await AdminService.updateAirport(widget.airportCode, data);
            if (!ctx.mounted) return;
            Navigator.of(ctx).pop();
            if (ok) {
              setState(() => _airportDetails = {...?_airportDetails, ...data});
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text('Airport updated', style: GoogleFonts.jost(fontSize: 13)),
                backgroundColor: kTeal,
                duration: const Duration(seconds: 2),
              ));
            } else {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text('Update failed', style: GoogleFonts.jost(fontSize: 13)),
                backgroundColor: Colors.red.shade700,
                duration: const Duration(seconds: 2),
              ));
            }
          }

          return Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: Container(
              decoration: BoxDecoration(
                color: Theme.of(ctx).scaffoldBackgroundColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Handle + title
                  Center(child: Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 32, height: 3,
                    decoration: BoxDecoration(color: kGoldLight.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(2)),
                  )),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 4, 24, 16),
                    child: Text('Edit Airport Details', style: GoogleFonts.cormorant(
                      fontSize: 22, fontWeight: FontWeight.w600,
                      color: Theme.of(ctx).colorScheme.onSurface,
                    )),
                  ),
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _SheetField(label: 'Airport Name', controller: nameCtrl),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(child: _SheetField(label: 'IATA Code', controller: codeCtrl, caps: true)),
                            const SizedBox(width: 12),
                            Expanded(child: _SheetField(label: 'City', controller: cityCtrl)),
                          ]),
                          const SizedBox(height: 12),
                          _SheetField(label: 'Country', controller: countryCtrl),
                          const SizedBox(height: 12),
                          // Continent dropdown
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Continent', style: GoogleFonts.jost(
                                fontSize: 11, letterSpacing: 0.8,
                                color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.45),
                              )),
                              const SizedBox(height: 6),
                              Container(
                                decoration: BoxDecoration(
                                  color: appCardSurface(ctx),
                                  borderRadius: BorderRadius.circular(3),
                                  border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                                ),
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: selectedContinent,
                                    isExpanded: true,
                                    dropdownColor: appCardSurface(ctx),
                                    style: GoogleFonts.jost(fontSize: 14, color: Theme.of(ctx).colorScheme.onSurface),
                                    items: continents.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                                    onChanged: (v) { if (v != null) setSheetState(() => selectedContinent = v); },
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(child: _SheetField(label: 'Latitude', controller: latCtrl, numeric: true)),
                            const SizedBox(width: 12),
                            Expanded(child: _SheetField(label: 'Longitude', controller: lonCtrl, numeric: true)),
                          ]),
                          const SizedBox(height: 24),
                          GestureDetector(
                            onTap: saving ? null : save,
                            child: Container(
                              height: 46,
                              decoration: BoxDecoration(
                                color: saving ? kTeal.withValues(alpha: 0.5) : kTeal,
                                borderRadius: BorderRadius.circular(3),
                              ),
                              child: Center(child: saving
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 1.5))
                                : Text('Save Changes', style: GoogleFonts.jost(fontSize: 14, color: Colors.white, letterSpacing: 0.5)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ).whenComplete(() {
      // Defer disposal to after the dismiss animation finishes, otherwise
      // setState in save() can trigger a rebuild while controllers are gone.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        nameCtrl.dispose(); codeCtrl.dispose(); cityCtrl.dispose();
        countryCtrl.dispose(); latCtrl.dispose(); lonCtrl.dispose();
      });
    });
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
                      GestureDetector(
                        onTap: () => _showEditAirportSheet(context),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: appCardSurface(context),
                            borderRadius: BorderRadius.circular(3),
                            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                            boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2))],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.edit_rounded, size: 13, color: context.appMutedFg(0.50)),
                              const SizedBox(width: 5),
                              Text('Edit', style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.55), letterSpacing: 0.4)),
                            ],
                          ),
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
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
                              itemCount: _terminalRestaurants.length + 1,
                              itemBuilder: (context, i) {
                                if (i == 0) return _AirportDetailsCard(details: _airportDetails);
                                final terminalId   = _terminalRestaurants.keys.elementAt(i - 1);
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
//  AIRPORT DETAILS CARD
// ─────────────────────────────────────────────────────────────
class _AirportDetailsCard extends StatelessWidget {
  final Map<String, dynamic>? details;
  const _AirportDetailsCard({required this.details});

  @override
  Widget build(BuildContext context) {
    final d = details ?? {};
    final city      = d['city']      as String? ?? '';
    final country   = d['country']   as String? ?? '';
    final continent = d['continent'] as String? ?? '';
    final lat       = d['lat'];
    final lon       = d['lon'];

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Airport Details', style: GoogleFonts.cormorant(
            fontSize: 15, fontWeight: FontWeight.w600,
            color: context.appOnSurface, letterSpacing: 0.2,
          )),
          const SizedBox(height: 10),
          Container(height: 1, color: kGoldLight.withValues(alpha: 0.20)),
          const SizedBox(height: 10),
          _DetailRow(label: 'City', value: city.isEmpty ? '—' : city),
          _DetailRow(label: 'Country', value: country.isEmpty ? '—' : country),
          _DetailRow(label: 'Continent', value: continent.isEmpty ? '—' : continent),
          if (lat != null && lon != null)
            _DetailRow(label: 'Coordinates', value: '${lat.toString()}, ${lon.toString()}'),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(label, style: GoogleFonts.jost(
              fontSize: 11, letterSpacing: 0.5,
              color: context.appMutedFg(0.42),
            )),
          ),
          Expanded(child: Text(value, style: GoogleFonts.jost(
            fontSize: 13, color: context.appOnSurface,
          ))),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SHEET FIELD
// ─────────────────────────────────────────────────────────────
class _SheetField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool caps;
  final bool numeric;
  const _SheetField({
    required this.label,
    required this.controller,
    this.caps = false,
    this.numeric = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.jost(
          fontSize: 11, letterSpacing: 0.8,
          color: context.appMutedFg(0.45),
        )),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: appCardSurface(context),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          ),
          child: TextField(
            controller: controller,
            textCapitalization: caps ? TextCapitalization.characters : TextCapitalization.words,
            keyboardType: numeric ? const TextInputType.numberWithOptions(signed: true, decimal: true) : TextInputType.text,
            style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: InputBorder.none,
            ),
          ),
        ),
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

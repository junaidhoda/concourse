import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/admin_service.dart';
import '../services/chain_restaurant_service.dart';

class _OutletFormData {
  final TextEditingController gateAreaController;
  final TextEditingController levelController;
  final TextEditingController locationNotesController;
  final TextEditingController openingHoursController;
  String airside;
  bool? open247;
  String takeaway;
  String wheelchairAccessible;
  bool? delivery;
  bool? reservable;
  bool? kidsMenu;

  _OutletFormData({
    String? gateArea,
    String? level,
    String? locationNotes,
    String? airside,
    bool? open247,
    String? openingHours,
    String? takeaway,
    String? wheelchairAccessible,
    bool? delivery,
    bool? reservable,
    bool? kidsMenu,
  })  : gateAreaController       = TextEditingController(text: gateArea ?? ''),
        levelController          = TextEditingController(text: level ?? ''),
        locationNotesController  = TextEditingController(text: locationNotes ?? ''),
        openingHoursController   = TextEditingController(text: openingHours ?? ''),
        airside = (['airside', 'landside', 'both'].contains(airside?.toLowerCase())
            ? airside!.toLowerCase() : 'airside'),
        open247    = open247,
        takeaway   = (['yes', 'no', 'only'].contains(takeaway?.toLowerCase())
            ? takeaway!.toLowerCase() : ''),
        wheelchairAccessible = (['yes', 'no', 'limited'].contains(wheelchairAccessible?.toLowerCase())
            ? wheelchairAccessible!.toLowerCase() : ''),
        delivery   = delivery,
        reservable = reservable,
        kidsMenu   = kidsMenu;

  void dispose() {
    gateAreaController.dispose();
    levelController.dispose();
    locationNotesController.dispose();
    openingHoursController.dispose();
  }

  Map<String, dynamic> toMap() => {
    'gate_area':             gateAreaController.text.trim(),
    'airside':               airside,
    'level':                 levelController.text.trim(),
    'location_notes':        locationNotesController.text.trim(),
    'open_24_7':             open247 ?? false,
    'opening_hours':         openingHoursController.text.trim(),
    'takeaway':              takeaway,
    'wheelchair_accessible': wheelchairAccessible,
    'delivery':              (delivery   ?? false) ? 'yes' : '',
    'reservable':            (reservable ?? false) ? 'yes' : '',
    'kids_menu':             (kidsMenu   ?? false) ? 'yes' : '',
  };
}

class AdminRestaurantEditorScreen extends StatefulWidget {
  final String airportCode;
  final String terminalId;
  final String? restaurantId;

  const AdminRestaurantEditorScreen({
    super.key,
    required this.airportCode,
    required this.terminalId,
    this.restaurantId,
  });

  @override
  State<AdminRestaurantEditorScreen> createState() => _AdminRestaurantEditorScreenState();
}

class _AdminRestaurantEditorScreenState extends State<AdminRestaurantEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController        = TextEditingController();
  final _cuisineController     = TextEditingController();
  final _descriptionController = TextEditingController();
  final _websiteController     = TextEditingController();
  final _phoneController       = TextEditingController();
  final _logoUrlController     = TextEditingController();

  String _selectedAmenity = 'restaurant';

  bool _isLoading = true;
  bool _isSaving  = false;
  String? _error;

  List<Map<String, dynamic>> _allChains = [];
  List<Map<String, dynamic>> _suggestions = [];

  bool _isVegan      = false;
  bool _isVegetarian = false;
  bool _isHalal      = false;
  bool _isKosher     = false;
  bool _isGlutenFree = false;

  List<_OutletFormData> _outlets = [];

  bool get _isNew => widget.restaurantId == null || widget.restaurantId == 'new';

  @override
  void initState() {
    super.initState();
    _nameController.addListener(_onNameChanged);
    ChainRestaurantService.load().then((chains) {
      if (mounted) setState(() => _allChains = chains);
    });
    if (!_isNew) {
      _loadRestaurant();
    } else {
      _outlets = [_OutletFormData()];
      _isLoading = false;
    }
  }

  void _onNameChanged() {
    final results = ChainRestaurantService.search(_allChains, _nameController.text);
    setState(() => _suggestions = results);
  }

  void _applyChain(Map<String, dynamic> chain) {
    setState(() {
      _nameController.text = chain['name'] as String;
      _nameController.selection = TextSelection.collapsed(offset: _nameController.text.length);
      final cuisines = chain['cuisine'] as List<dynamic>? ?? [];
      if (cuisines.isNotEmpty) _cuisineController.text = cuisines.join(', ');
      final desc = chain['description'] as String? ?? '';
      if (desc.isNotEmpty) _descriptionController.text = desc;
      final logo = chain['logo_url'] as String? ?? '';
      if (logo.isNotEmpty) _logoUrlController.text = logo;
      _suggestions = [];
    });
  }

  @override
  void dispose() {
    _nameController.removeListener(_onNameChanged);
    _nameController.dispose();
    _cuisineController.dispose();
    _descriptionController.dispose();
    _websiteController.dispose();
    _phoneController.dispose();
    _logoUrlController.dispose();
    for (final o in _outlets) o.dispose();
    super.dispose();
  }

  Future<void> _loadRestaurant() async {
    try {
      final restaurants = await AdminService.getRestaurantsForTerminal(widget.airportCode, widget.terminalId);
      final restaurant = restaurants.firstWhere(
        (r) => r['id'] == widget.restaurantId,
        orElse: () => {},
      );
      if (restaurant.isNotEmpty) _populateFields(restaurant);
    } catch (e) {
      setState(() => _error = 'Failed to load restaurant: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  bool _boolFromField(Map<String, dynamic> data, String key) {
    final v = data[key];
    if (v is bool) return v;
    if (v is String) return v.toLowerCase() == 'yes';
    return false;
  }

  void _populateFields(Map<String, dynamic> data) {
    _nameController.text        = data['name']        as String? ?? '';
    _cuisineController.text     = data['cuisine']     as String? ?? '';
    _descriptionController.text = data['description'] as String? ?? '';
    _websiteController.text     = data['website']     as String? ?? '';
    _phoneController.text       = data['phone']       as String? ?? '';
    _logoUrlController.text     = data['logo_url']    as String? ?? '';
    _selectedAmenity            = data['amenity']     as String? ?? 'restaurant';

    // Dietary — support both root-level strings and legacy dietary sub-map
    final dietary = data['dietary'] as Map<String, dynamic>? ?? {};
    _isVegan      = _boolFromField(data, 'vegan_options')   || (dietary['vegan']       as bool? ?? false);
    _isVegetarian = _boolFromField(data, 'vegetarian_options') || (dietary['vegetarian']  as bool? ?? false);
    _isHalal      = _boolFromField(data, 'halal')           || (dietary['halal']       as bool? ?? false);
    _isKosher     = _boolFromField(data, 'kosher')          || (dietary['kosher']      as bool? ?? false);
    _isGlutenFree = _boolFromField(data, 'gluten_free')     || (dietary['gluten_free'] as bool? ?? false);

    // Per-outlet opening hours & features (migrate root-level fields to first outlet on load)
    String rootHours = data['opening_hours'] as String? ?? '';
    bool   rootOpen247 = data['open_24_7'] as bool? ?? false;
    final rootTw = (data['takeaway'] as String? ?? '').toLowerCase();
    final rootWc = (data['wheelchair_accessible'] as String? ?? '').toLowerCase();
    bool rootDelivery   = _boolFromField(data, 'delivery');
    bool rootReservable = _boolFromField(data, 'reservable');
    bool rootKidsMenu   = _boolFromField(data, 'kids_menu');

    final rawOutlets = data['outlets'] as List<dynamic>? ?? [];
    _outlets = rawOutlets.isNotEmpty
        ? rawOutlets.map((o) {
            final outlet = o as Map<String, dynamic>;
            final tw = (outlet['takeaway'] as String? ?? '').toLowerCase();
            final wc = (outlet['wheelchair_accessible'] as String? ?? '').toLowerCase();
            return _OutletFormData(
              gateArea:      outlet['gate_area']     as String?,
              level:         outlet['level']         as String? ?? data['floor_level'] as String?,
              locationNotes: outlet['location_notes'] as String?,
              airside:       (outlet['airside'] as String? ?? data['airside'] as String?)?.toLowerCase(),
              open247:       outlet['open_24_7']     as bool? ?? false,
              openingHours:  outlet['opening_hours'] as String? ?? '',
              takeaway:      ['yes', 'no', 'only'].contains(tw) ? tw : '',
              wheelchairAccessible: ['yes', 'no', 'limited'].contains(wc) ? wc : '',
              delivery:   _boolFromField(outlet, 'delivery'),
              reservable: _boolFromField(outlet, 'reservable'),
              kidsMenu:   _boolFromField(outlet, 'kids_menu'),
            );
          }).toList()
        : [_OutletFormData(
            airside:      (data['airside'] as String?)?.toLowerCase(),
            level:        data['floor_level'] as String?,
            open247:      rootOpen247,
            openingHours: rootHours,
            takeaway:     ['yes', 'no', 'only'].contains(rootTw) ? rootTw : '',
            wheelchairAccessible: ['yes', 'no', 'limited'].contains(rootWc) ? rootWc : '',
            delivery:   rootDelivery,
            reservable: rootReservable,
            kidsMenu:   rootKidsMenu,
          )];
  }

  Future<void> _saveRestaurant() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isSaving = true; _error = null; });

    try {
      final data = {
        'name':        _nameController.text.trim(),
        'amenity':     _selectedAmenity,
        'cuisine':     _cuisineController.text.trim(),
        'description': _descriptionController.text.trim(),
        'website':     _websiteController.text.trim(),
        'phone':       _phoneController.text.trim(),
        'logo_url':    _logoUrlController.text.trim(),
        // Dietary
        'halal':              _isHalal      ? 'yes' : '',
        'vegetarian_options': _isVegetarian ? 'yes' : '',
        'vegan_options':      _isVegan      ? 'yes' : '',
        'kosher':             _isKosher     ? 'yes' : '',
        'gluten_free':        _isGlutenFree ? 'yes' : '',
        'outlets': _outlets.map((o) => o.toMap()).toList(),
      };

      final success = _isNew
          ? await AdminService.addRestaurant(widget.airportCode, widget.terminalId, data)
          : await AdminService.updateRestaurant(widget.airportCode, widget.terminalId, widget.restaurantId!, data);

      if (success) {
        if (mounted) context.go('/admin/airport/${widget.airportCode}');
      } else {
        setState(() => _error = 'Failed to save restaurant');
      }
    } catch (e) {
      setState(() => _error = 'Error saving: $e');
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Future<void> _deleteRestaurant() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: appCardSurface(context),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3), side: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        title: Text('Delete Restaurant', style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w500, color: context.appOnSurface)),
        content: Text('This cannot be undone.', style: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.55))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.55))),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Delete', style: GoogleFonts.jost(fontSize: 13, color: Colors.red.shade400)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isSaving = true);
      try {
        final success = await AdminService.deleteRestaurant(widget.airportCode, widget.terminalId, widget.restaurantId!);
        if (success && mounted) context.go('/admin/airport/${widget.airportCode}');
        else setState(() { _error = 'Failed to delete'; _isSaving = false; });
      } catch (e) {
        setState(() { _error = 'Error: $e'; _isSaving = false; });
      }
    }
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
              children: [
                // ── Header ──────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => context.go('/admin/airport/${widget.airportCode}'),
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
                        child: Text(
                          _isNew ? 'Add Restaurant' : 'Edit Restaurant',
                          style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w600, color: context.appOnSurface, letterSpacing: 0.2),
                        ),
                      ),
                      if (!_isNew)
                        GestureDetector(
                          onTap: _deleteRestaurant,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.red.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(3),
                              border: Border.all(color: Colors.red.withValues(alpha: 0.25)),
                            ),
                            child: Text('Delete', style: GoogleFonts.jost(fontSize: 12, color: Colors.red.shade400, letterSpacing: 0.3)),
                          ),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: _rule(context)),
                const SizedBox(height: 4),

                // ── Error ────────────────────────────────────
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.fromLTRB(24, 8, 24, 0),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(color: Colors.red.withValues(alpha: 0.25)),
                    ),
                    child: Text(_error!, style: GoogleFonts.jost(fontSize: 13, color: Colors.red.shade400)),
                  ),

                // ── Form ─────────────────────────────────────
                Expanded(
                  child: _isLoading
                      ? Center(child: CircularProgressIndicator(color: kTeal, strokeWidth: 1.5))
                      : Form(
                          key: _formKey,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                            children: [
                              // ── Basic ──────────────────────
                              _SectionHeader(title: 'Basic Information'),
                              const SizedBox(height: 12),
                              // Name with chain autocomplete
                              _field(context, controller: _nameController, label: 'Name', required: true),
                              if (_suggestions.isNotEmpty)
                                Container(
                                  margin: const EdgeInsets.only(top: 2),
                                  decoration: BoxDecoration(
                                    color: appCardSurface(context),
                                    borderRadius: BorderRadius.circular(3),
                                    border: Border.all(color: kTeal.withValues(alpha: 0.35)),
                                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 8, offset: const Offset(0, 3))],
                                  ),
                                  child: Column(
                                    children: _suggestions.map((chain) {
                                      final name = chain['name'] as String;
                                      final cuisines = (chain['cuisine'] as List<dynamic>? ?? []).join(', ');
                                      final logoUrl = chain['logo_url'] as String? ?? '';
                                      return InkWell(
                                        onTap: () => _applyChain(chain),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                          child: Row(
                                            children: [
                                              Container(
                                                width: 36, height: 36,
                                                margin: const EdgeInsets.only(right: 12),
                                                decoration: BoxDecoration(
                                                  color: kTeal.withValues(alpha: 0.06),
                                                  borderRadius: BorderRadius.circular(3),
                                                  border: Border.all(color: kGoldLight.withValues(alpha: 0.22)),
                                                ),
                                                clipBehavior: Clip.antiAlias,
                                                child: logoUrl.isNotEmpty
                                                    ? Image.network(
                                                        logoUrl,
                                                        fit: BoxFit.contain,
                                                        errorBuilder: (_, __, ___) =>
                                                            Icon(Icons.restaurant, size: 16, color: kTeal.withValues(alpha: 0.5)),
                                                      )
                                                    : Icon(Icons.restaurant, size: 16, color: kTeal.withValues(alpha: 0.5)),
                                              ),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(name, style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface, fontWeight: FontWeight.w500)),
                                                    if (cuisines.isNotEmpty)
                                                      Text(cuisines, style: GoogleFonts.jost(fontSize: 11, color: context.appMutedFg(0.45))),
                                                  ],
                                                ),
                                              ),
                                              Icon(Icons.north_west_rounded, size: 13, color: kTeal.withValues(alpha: 0.6)),
                                            ],
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                ),
                              const SizedBox(height: 10),
                              Row(children: [
                                Expanded(child: _amenityDropdown(context)),
                                const SizedBox(width: 10),
                                Expanded(child: _field(context, controller: _cuisineController, label: 'Cuisine')),
                              ]),
                              const SizedBox(height: 10),
                              _field(context, controller: _descriptionController, label: 'Description', maxLines: 3, hint: 'Brief description...'),
                              const SizedBox(height: 10),
                              _field(context, controller: _logoUrlController, label: 'Logo URL', hint: 'https://...', keyboard: TextInputType.url),
                              const SizedBox(height: 10),
                              _field(context, controller: _phoneController, label: 'Phone', keyboard: TextInputType.phone),
                              const SizedBox(height: 10),
                              _field(context, controller: _websiteController, label: 'Website', hint: 'https://...', keyboard: TextInputType.url),

                              // ── Dietary ────────────────────
                              const SizedBox(height: 24),
                              _SectionHeader(title: 'Dietary'),
                              const SizedBox(height: 12),
                              Wrap(spacing: 8, runSpacing: 8, children: [
                                _DietaryChip(label: 'Vegan',       selected: _isVegan,       onChanged: (v) => setState(() => _isVegan = v)),
                                _DietaryChip(label: 'Vegetarian',  selected: _isVegetarian,  onChanged: (v) => setState(() => _isVegetarian = v)),
                                _DietaryChip(label: 'Halal',       selected: _isHalal,       onChanged: (v) => setState(() => _isHalal = v)),
                                _DietaryChip(label: 'Kosher',      selected: _isKosher,      onChanged: (v) => setState(() => _isKosher = v)),
                                _DietaryChip(label: 'Gluten-Free', selected: _isGlutenFree,  onChanged: (v) => setState(() => _isGlutenFree = v)),
                              ]),

                              // ── Locations ──────────────────
                              const SizedBox(height: 24),
                              _SectionHeader(title: 'Locations'),
                              const SizedBox(height: 4),
                              Text('One entry per physical location within the terminal.',
                                  style: GoogleFonts.jost(fontSize: 12, color: context.appMutedFg(0.42))),
                              const SizedBox(height: 12),
                              ...List.generate(_outlets.length, (i) => _buildOutletCard(context, i)),
                              const SizedBox(height: 8),
                              GestureDetector(
                                onTap: () => setState(() => _outlets.add(_OutletFormData())),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  decoration: BoxDecoration(
                                    color: kTeal.withValues(alpha: 0.06),
                                    borderRadius: BorderRadius.circular(3),
                                    border: Border.all(color: kTeal.withValues(alpha: 0.25)),
                                  ),
                                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                    Icon(Icons.add_rounded, size: 16, color: kTeal),
                                    const SizedBox(width: 6),
                                    Text('Add Location', style: GoogleFonts.jost(fontSize: 13, color: kTeal, letterSpacing: 0.3)),
                                  ]),
                                ),
                              ),
                              const SizedBox(height: 32),
                            ],
                          ),
                        ),
                ),

                // ── Save button ──────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: GestureDetector(
                    onTap: _isSaving ? null : _saveRestaurant,
                    child: Container(
                      width: double.infinity,
                      height: 52,
                      decoration: BoxDecoration(
                        color: _isSaving ? kTeal.withValues(alpha: 0.6) : kTeal,
                        borderRadius: BorderRadius.circular(3),
                        boxShadow: [BoxShadow(color: kTeal.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4))],
                      ),
                      child: Center(
                        child: _isSaving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 1.5, color: Colors.white))
                            : Text(
                                _isNew ? 'ADD RESTAURANT' : 'SAVE CHANGES',
                                style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 2.2, color: Colors.white),
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOutletCard(BuildContext context, int index) {
    final outlet = _outlets[index];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
        boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.05), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header row ─────────────────────────────
          Row(children: [
            Text('Location ${index + 1}',
                style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500, color: context.appMutedFg(0.55), letterSpacing: 0.5)),
            const Spacer(),
            if (_outlets.length > 1)
              GestureDetector(
                onTap: () => setState(() { _outlets[index].dispose(); _outlets.removeAt(index); }),
                child: Icon(Icons.remove_circle_outline_rounded, size: 18, color: Colors.red.shade300),
              ),
          ]),

          // ── Physical location ───────────────────────
          const SizedBox(height: 10),
          _field(context, controller: outlet.gateAreaController, label: 'Gate Area / Zone', hint: 'e.g. Gates 1–20, Pier B'),
          const SizedBox(height: 10),
          _airsideDropdown(context, outlet),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _field(context, controller: outlet.levelController, label: 'Level / Floor', hint: 'e.g. 2F, Level 1')),
          ]),
          const SizedBox(height: 10),
          _field(context, controller: outlet.locationNotesController, label: 'Directions', hint: 'e.g. Next to gate 35, opposite WHSmith...', maxLines: 2),

          // ── Opening hours ───────────────────────────
          const SizedBox(height: 14),
          _subHeader(context, 'Opening Hours'),
          const SizedBox(height: 10),
          _DietaryChip(
            label: 'Open 24/7',
            selected: outlet.open247 ?? false,
            onChanged: (v) => setState(() => outlet.open247 = v),
          ),
          if (!(outlet.open247 ?? false)) ...[
            const SizedBox(height: 10),
            _field(context, controller: outlet.openingHoursController,
                label: 'Hours', hint: 'e.g. Mo-Fr 07:00-22:00; Sa-Su 08:00-20:00'),
          ],

          // ── Features ────────────────────────────────
          const SizedBox(height: 14),
          _subHeader(context, 'Features'),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _optionDropdown(context,
              label: 'Takeaway',
              value: outlet.takeaway,
              items: const {'': 'Unknown', 'yes': 'Yes', 'no': 'No', 'only': 'Only'},
              onChanged: (v) => setState(() => outlet.takeaway = v ?? ''),
            )),
            const SizedBox(width: 10),
            Expanded(child: _optionDropdown(context,
              label: 'Wheelchair',
              value: outlet.wheelchairAccessible,
              items: const {'': 'Unknown', 'yes': 'Yes', 'no': 'No', 'limited': 'Limited'},
              onChanged: (v) => setState(() => outlet.wheelchairAccessible = v ?? ''),
            )),
          ]),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            _DietaryChip(label: 'Delivery',     selected: outlet.delivery   ?? false, onChanged: (v) => setState(() => outlet.delivery   = v)),
            _DietaryChip(label: 'Reservations', selected: outlet.reservable ?? false, onChanged: (v) => setState(() => outlet.reservable = v)),
            _DietaryChip(label: 'Kids Menu',    selected: outlet.kidsMenu   ?? false, onChanged: (v) => setState(() => outlet.kidsMenu   = v)),
          ]),
        ],
      ),
    );
  }

  Widget _subHeader(BuildContext context, String title) => Text(
    title,
    style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 1.6, color: context.appMutedFg(0.42)),
  );

  Widget _field(BuildContext context, {
    required TextEditingController controller,
    required String label,
    String? hint,
    int maxLines = 1,
    bool required = false,
    TextInputType keyboard = TextInputType.text,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboard,
      style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface),
      validator: required ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null : null,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.45)),
        hintStyle: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.32)),
        isDense: true,
        filled: true,
        fillColor: appCardSurface(context),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: kTeal, width: 1)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: Colors.red.shade300)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: Colors.red.shade400)),
      ),
    );
  }

  Widget _optionDropdown(BuildContext context, {
    required String label,
    required String value,
    required Map<String, String> items,
    required void Function(String?) onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value.isEmpty ? '' : value,
      style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.45)),
        isDense: true,
        filled: true,
        fillColor: appCardSurface(context),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: kTeal, width: 1)),
      ),
      items: items.entries.map((e) => DropdownMenuItem(
        value: e.key,
        child: Text(e.value, style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface)),
      )).toList(),
      onChanged: onChanged,
    );
  }

  Widget _amenityDropdown(BuildContext context) {
    final items = ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'bakery', 'confectionery', 'ice_cream', 'food_court'];
    return DropdownButtonFormField<String>(
      value: _selectedAmenity,
      style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface),
      decoration: InputDecoration(
        labelText: 'Type',
        labelStyle: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.45)),
        isDense: true,
        filled: true,
        fillColor: appCardSurface(context),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: kTeal, width: 1)),
      ),
      items: items.map((v) => DropdownMenuItem(value: v, child: Text(_formatAmenity(v), style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface)))).toList(),
      onChanged: (v) => setState(() => _selectedAmenity = v!),
    );
  }

  Widget _airsideDropdown(BuildContext context, _OutletFormData outlet) {
    return DropdownButtonFormField<String>(
      value: outlet.airside,
      style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface),
      decoration: InputDecoration(
        labelText: 'Security',
        labelStyle: GoogleFonts.jost(fontSize: 13, color: context.appMutedFg(0.45)),
        isDense: true,
        filled: true,
        fillColor: appCardSurface(context),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.28))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: kTeal, width: 1)),
      ),
      items: [
        DropdownMenuItem(value: 'airside',  child: Text('After security',  style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface))),
        DropdownMenuItem(value: 'landside', child: Text('Before security', style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface))),
        DropdownMenuItem(value: 'both',     child: Text('Both',            style: GoogleFonts.jost(fontSize: 14, color: context.appOnSurface))),
      ],
      onChanged: (v) => setState(() => outlet.airside = v!),
    );
  }

  String _formatAmenity(String amenity) => switch (amenity) {
    'cafe'          => 'Café',
    'pub'           => 'Pub',
    'bar'           => 'Bar',
    'fast_food'     => 'Fast Food',
    'restaurant'    => 'Restaurant',
    'bakery'        => 'Bakery',
    'confectionery' => 'Confectionery',
    'ice_cream'     => 'Ice Cream',
    'food_court'    => 'Food Court',
    _               => amenity.replaceAll('_', ' '),
  };
}

// ─────────────────────────────────────────────────────────────
//  DIETARY CHIP
// ─────────────────────────────────────────────────────────────
class _DietaryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final void Function(bool) onChanged;
  const _DietaryChip({required this.label, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!selected),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kTeal.withValues(alpha: 0.10) : appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: selected ? kTeal.withValues(alpha: 0.40) : kGoldLight.withValues(alpha: 0.28)),
        ),
        child: Text(label, style: GoogleFonts.jost(fontSize: 12, color: selected ? kTeal : context.appMutedFg(0.50), fontWeight: selected ? FontWeight.w500 : FontWeight.w400)),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SHARED WIDGETS
// ─────────────────────────────────────────────────────────────
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

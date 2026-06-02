import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/admin_service.dart';

class _OutletFormData {
  final TextEditingController gateAreaController;
  final TextEditingController levelController;
  final TextEditingController locationNotesController;
  String airside;

  _OutletFormData({String? gateArea, String? level, String? locationNotes, String? airside})
      : gateAreaController = TextEditingController(text: gateArea ?? ''),
        levelController = TextEditingController(text: level ?? ''),
        locationNotesController = TextEditingController(text: locationNotes ?? ''),
        airside = airside ?? 'airside';

  void dispose() {
    gateAreaController.dispose();
    levelController.dispose();
    locationNotesController.dispose();
  }

  Map<String, dynamic> toMap() => {
    'gate_area': gateAreaController.text.trim(),
    'airside': airside,
    'level': levelController.text.trim(),
    'location_notes': locationNotesController.text.trim(),
  };
}

class AdminRestaurantEditorScreen extends StatefulWidget {
  final String airportCode;
  final String? restaurantId;

  const AdminRestaurantEditorScreen({
    super.key,
    required this.airportCode,
    this.restaurantId,
  });

  @override
  State<AdminRestaurantEditorScreen> createState() => _AdminRestaurantEditorScreenState();
}

class _AdminRestaurantEditorScreenState extends State<AdminRestaurantEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _cuisineController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _websiteController = TextEditingController();

  String _selectedAmenity = 'restaurant';
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;

  bool _isVegan = false;
  bool _isVegetarian = false;
  bool _isHalal = false;
  bool _isKosher = false;
  bool _isGlutenFree = false;

  List<_OutletFormData> _outlets = [];

  @override
  void initState() {
    super.initState();
    if (widget.restaurantId != null && widget.restaurantId != 'new') {
      _loadRestaurant();
    } else {
      _outlets = [_OutletFormData()];
      _isLoading = false;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cuisineController.dispose();
    _descriptionController.dispose();
    _websiteController.dispose();
    for (final o in _outlets) {
      o.dispose();
    }
    super.dispose();
  }

  Future<void> _loadRestaurant() async {
    try {
      final restaurants = await AdminService.getRestaurantsForAirport(widget.airportCode);
      final restaurant = restaurants.firstWhere(
        (r) => r['id'] == widget.restaurantId,
        orElse: () => {},
      );

      if (restaurant.isNotEmpty) {
        _populateFields(restaurant);
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to load restaurant: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _populateFields(Map<String, dynamic> data) {
    _nameController.text = data['name'] as String? ?? '';
    _cuisineController.text = data['cuisine'] as String? ?? '';
    _descriptionController.text = data['description'] as String? ?? '';
    _websiteController.text = data['website'] as String? ?? '';
    _selectedAmenity = data['amenity'] as String? ?? 'restaurant';

    final dietary = data['dietary'] as Map<String, dynamic>? ?? {};
    _isVegan = dietary['vegan'] as bool? ?? false;
    _isVegetarian = dietary['vegetarian'] as bool? ?? false;
    _isHalal = dietary['halal'] as bool? ?? false;
    _isKosher = dietary['kosher'] as bool? ?? false;
    _isGlutenFree = dietary['gluten_free'] as bool? ?? false;

    final rawOutlets = data['outlets'] as List<dynamic>? ?? [];
    if (rawOutlets.isNotEmpty) {
      _outlets = rawOutlets.map((o) {
        final outlet = o as Map<String, dynamic>;
        return _OutletFormData(
          gateArea: outlet['gate_area'] as String?,
          level: outlet['level'] as String?,
          locationNotes: outlet['location_notes'] as String?,
          airside: outlet['airside'] as String?,
        );
      }).toList();
    } else {
      _outlets = [_OutletFormData()];
    }
  }

  Future<void> _saveRestaurant() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
      _error = null;
    });

    try {
      final data = {
        'name': _nameController.text.trim(),
        'amenity': _selectedAmenity,
        'cuisine': _cuisineController.text.trim(),
        'description': _descriptionController.text.trim(),
        'website': _websiteController.text.trim(),
        'dietary': {
          'vegan': _isVegan,
          'vegetarian': _isVegetarian,
          'halal': _isHalal,
          'kosher': _isKosher,
          'gluten_free': _isGlutenFree,
        },
        'outlets': _outlets.map((o) => o.toMap()).toList(),
      };

      bool success;
      if (widget.restaurantId == null || widget.restaurantId == 'new') {
        success = await AdminService.addRestaurant(widget.airportCode, data);
      } else {
        success = await AdminService.updateRestaurant(widget.airportCode, widget.restaurantId!, data);
      }

      if (success) {
        if (mounted) context.go('/admin/airport/${widget.airportCode}');
      } else {
        setState(() => _error = 'Failed to save restaurant');
      }
    } catch (e) {
      setState(() => _error = 'Error saving restaurant: $e');
    } finally {
      setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(widget.restaurantId == null || widget.restaurantId == 'new'
            ? 'Add Restaurant'
            : 'Edit Restaurant'),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        foregroundColor: Theme.of(context).brightness == Brightness.dark ? Colors.white : const Color(0xFF3E6BC1),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/airport/${widget.airportCode}'),
        ),
        actions: [
          if (widget.restaurantId != null && widget.restaurantId != 'new')
            IconButton(
              icon: const Icon(Icons.delete, color: Colors.red),
              onPressed: _deleteRestaurant,
              tooltip: 'Delete Restaurant',
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3E6BC1))))
          : SafeArea(
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    if (_error != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.all(16),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red[50],
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.red[200]!),
                        ),
                        child: Text(_error!, style: TextStyle(color: Colors.red[700], fontSize: 14)),
                      ),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // ── Basic Information ────────────
                            _buildSectionTitle('Basic Information'),
                            TextFormField(
                              controller: _nameController,
                              decoration: const InputDecoration(labelText: 'Name *', border: OutlineInputBorder()),
                              validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter a name' : null,
                            ),
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                Expanded(
                                  child: DropdownButtonFormField<String>(
                                    value: _selectedAmenity,
                                    decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder()),
                                    items: [
                                      'restaurant', 'cafe', 'bar', 'pub', 'fast_food',
                                      'bakery', 'confectionery', 'ice_cream', 'food_court',
                                    ].map((v) => DropdownMenuItem(value: v, child: Text(_formatAmenity(v)))).toList(),
                                    onChanged: (v) => setState(() => _selectedAmenity = v!),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: TextFormField(
                                    controller: _cuisineController,
                                    decoration: const InputDecoration(labelText: 'Cuisine', border: OutlineInputBorder()),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _descriptionController,
                              decoration: const InputDecoration(
                                labelText: 'Description',
                                border: OutlineInputBorder(),
                                hintText: 'Brief description of the restaurant...',
                              ),
                              maxLines: 3,
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _websiteController,
                              decoration: const InputDecoration(
                                labelText: 'Website',
                                border: OutlineInputBorder(),
                                hintText: 'https://...',
                              ),
                              keyboardType: TextInputType.url,
                            ),

                            const SizedBox(height: 24),

                            // ── Dietary Options ──────────────
                            _buildSectionTitle('Dietary Options'),
                            Wrap(
                              spacing: 8,
                              children: [
                                FilterChip(label: const Text('Vegan'), selected: _isVegan, onSelected: (v) => setState(() => _isVegan = v)),
                                FilterChip(label: const Text('Vegetarian'), selected: _isVegetarian, onSelected: (v) => setState(() => _isVegetarian = v)),
                                FilterChip(label: const Text('Halal'), selected: _isHalal, onSelected: (v) => setState(() => _isHalal = v)),
                                FilterChip(label: const Text('Kosher'), selected: _isKosher, onSelected: (v) => setState(() => _isKosher = v)),
                                FilterChip(label: const Text('Gluten-Free'), selected: _isGlutenFree, onSelected: (v) => setState(() => _isGlutenFree = v)),
                              ],
                            ),

                            const SizedBox(height: 24),

                            // ── Outlets ──────────────────────
                            _buildSectionTitle('Locations'),
                            const SizedBox(height: 4),
                            Text(
                              'Add one entry per physical location within the terminal.',
                              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                            ),
                            const SizedBox(height: 12),
                            ...List.generate(_outlets.length, (i) => _buildOutletForm(i)),
                            const SizedBox(height: 8),
                            OutlinedButton.icon(
                              onPressed: () => setState(() => _outlets.add(_OutletFormData())),
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('Add Location'),
                              style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFF3E6BC1)),
                            ),

                            const SizedBox(height: 40),
                          ],
                        ),
                      ),
                    ),

                    // ── Save button ──────────────────────────
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      child: ElevatedButton(
                        onPressed: _isSaving ? null : _saveRestaurant,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3E6BC1),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: _isSaving
                            ? const SizedBox(
                                width: 20, height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Colors.white)),
                              )
                            : Text(
                                widget.restaurantId == null || widget.restaurantId == 'new' ? 'Add Restaurant' : 'Save Changes',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildOutletForm(int index) {
    final outlet = _outlets[index];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey[300]!),
        borderRadius: BorderRadius.circular(8),
        color: Colors.grey[50],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Location ${index + 1}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              const Spacer(),
              if (_outlets.length > 1)
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline, color: Colors.red, size: 20),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => setState(() {
                    _outlets[index].dispose();
                    _outlets.removeAt(index);
                  }),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: outlet.gateAreaController,
            decoration: const InputDecoration(
              labelText: 'Gate Area / Zone',
              border: OutlineInputBorder(),
              hintText: 'e.g. Gates 1–20, Pier B, Departures Hall',
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: outlet.airside,
            decoration: const InputDecoration(labelText: 'Security', border: OutlineInputBorder(), isDense: true),
            items: const [
              DropdownMenuItem(value: 'airside', child: Text('After security')),
              DropdownMenuItem(value: 'landside', child: Text('Before security')),
              DropdownMenuItem(value: 'both', child: Text('Both')),
            ],
            onChanged: (v) => setState(() => outlet.airside = v!),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: outlet.levelController,
            decoration: const InputDecoration(
              labelText: 'Level / Floor',
              border: OutlineInputBorder(),
              hintText: 'e.g. Ground Floor, Level 1',
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: outlet.locationNotesController,
            decoration: const InputDecoration(
              labelText: 'Directions',
              border: OutlineInputBorder(),
              hintText: 'e.g. Next to gate 35, opposite WHSmith...',
              isDense: true,
            ),
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF2C2C2C))),
    );
  }

  String _formatAmenity(String amenity) {
    return switch (amenity) {
      'cafe' => 'Café',
      'pub' => 'Pub',
      'bar' => 'Bar',
      'fast_food' => 'Fast Food',
      'restaurant' => 'Restaurant',
      'bakery' => 'Bakery',
      'confectionery' => 'Confectionery',
      'ice_cream' => 'Ice Cream',
      'food_court' => 'Food Court',
      _ => amenity.replaceAll('_', ' '),
    };
  }

  Future<void> _deleteRestaurant() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Restaurant'),
        content: const Text('Are you sure you want to delete this restaurant? This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isSaving = true);
      try {
        final success = await AdminService.deleteRestaurant(widget.airportCode, widget.restaurantId!);
        if (success && mounted) {
          context.go('/admin/airport/${widget.airportCode}');
        } else {
          setState(() {
            _error = 'Failed to delete restaurant';
            _isSaving = false;
          });
        }
      } catch (e) {
        setState(() {
          _error = 'Error deleting restaurant: $e';
          _isSaving = false;
        });
      }
    }
  }
}

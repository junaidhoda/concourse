import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/admin_service.dart';

class AdminRestaurantEditorScreen extends StatefulWidget {
  final String airportCode;
  final String? restaurantId; // null for new restaurant

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
  final _brandController = TextEditingController();
  final _cuisineController = TextEditingController();
  final _terminalNameController = TextEditingController();
  final _terminalShortController = TextEditingController();
  final _terminalIdController = TextEditingController();
  final _levelController = TextEditingController();
  final _floorController = TextEditingController();
  final _websiteController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationNotesController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _menuController = TextEditingController();

  String _selectedAmenity = 'restaurant';
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;
  Map<String, dynamic>? _restaurantData;

  // Dietary options
  bool _isVegan = false;
  bool _isVegetarian = false;
  bool _isHalal = false;
  bool _isKosher = false;
  bool _isGlutenFree = false;

  // Services
  bool _hasTakeaway = false;
  bool _hasDelivery = false;
  bool _isWheelchairAccessible = false;

  @override
  void initState() {
    super.initState();
    if (widget.restaurantId != null && widget.restaurantId != 'new') {
      _loadRestaurant();
    } else {
      _isLoading = false;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _brandController.dispose();
    _cuisineController.dispose();
    _terminalNameController.dispose();
    _terminalShortController.dispose();
    _terminalIdController.dispose();
    _levelController.dispose();
    _floorController.dispose();
    _websiteController.dispose();
    _phoneController.dispose();
    _locationNotesController.dispose();
    _descriptionController.dispose();
    _menuController.dispose();
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
        _restaurantData = restaurant;
        _populateFields();
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

  void _populateFields() {
    if (_restaurantData == null) return;

    _nameController.text = _restaurantData!['name'] as String? ?? '';
    _brandController.text = _restaurantData!['brand'] as String? ?? '';
    _cuisineController.text = _restaurantData!['cuisine'] as String? ?? '';
    _terminalNameController.text = _restaurantData!['terminal_name'] as String? ?? '';
    _terminalShortController.text = _restaurantData!['terminal_short'] as String? ?? '';
    _terminalIdController.text = _restaurantData!['terminal_id'] as String? ?? '';
    
    final additional = _restaurantData!['additional'] as Map<String, dynamic>? ?? {};
    _levelController.text = additional['level'] as String? ?? '';
    _floorController.text = additional['floor'] as String? ?? '';
    _websiteController.text = additional['website'] as String? ?? '';
    _phoneController.text = additional['phone'] as String? ?? '';
    
    _selectedAmenity = _restaurantData!['amenity'] as String? ?? 'restaurant';
    
    // Dietary options
    final dietary = _restaurantData!['dietary'] as Map<String, dynamic>? ?? {};
    _isVegan = dietary['vegan'] as bool? ?? false;
    _isVegetarian = dietary['vegetarian'] as bool? ?? false;
    _isHalal = dietary['halal'] as bool? ?? false;
    _isKosher = dietary['kosher'] as bool? ?? false;
    _isGlutenFree = dietary['gluten_free'] as bool? ?? false;
    
    // Services
    _hasTakeaway = additional['takeaway'] as bool? ?? false;
    _hasDelivery = additional['delivery'] as bool? ?? false;
    _isWheelchairAccessible = additional['wheelchair_accessible'] as bool? ?? false;
    
    // Custom fields
    _locationNotesController.text = additional['location_notes'] as String? ?? '';
    _descriptionController.text = additional['description'] as String? ?? '';
    _menuController.text = additional['menu'] as String? ?? '';
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
        'brand': _brandController.text.trim(),
        'amenity': _selectedAmenity,
        'cuisine': _cuisineController.text.trim(),
        'terminal_name': _terminalNameController.text.trim(),
        'terminal_short': _terminalShortController.text.trim(),
        'terminal_id': _terminalIdController.text.trim(),
        'dietary': {
          'vegan': _isVegan,
          'vegetarian': _isVegetarian,
          'halal': _isHalal,
          'kosher': _isKosher,
          'gluten_free': _isGlutenFree,
        },
        'additional': {
          'level': _levelController.text.trim(),
          'floor': _floorController.text.trim(),
          'website': _websiteController.text.trim(),
          'phone': _phoneController.text.trim(),
          'takeaway': _hasTakeaway,
          'delivery': _hasDelivery,
          'wheelchair_accessible': _isWheelchairAccessible,
          'location_notes': _locationNotesController.text.trim(),
          'description': _descriptionController.text.trim(),
          'menu': _menuController.text.trim(),
        },
      };

      bool success;
      if (widget.restaurantId == null || widget.restaurantId == 'new') {
        success = await AdminService.addRestaurant(widget.airportCode, data);
      } else {
        success = await AdminService.updateRestaurant(widget.airportCode, widget.restaurantId!, data);
      }

      if (success) {
        if (mounted) {
          context.go('/admin/airport/${widget.airportCode}');
        }
      } else {
        setState(() {
          _error = 'Failed to save restaurant';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Error saving restaurant: $e';
      });
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(widget.restaurantId == null || widget.restaurantId == 'new' 
            ? 'Add Restaurant' 
            : 'Edit Restaurant'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF3E6BC1),
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
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3E6BC1)),
              ),
            )
          : SafeArea(
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    // Error message
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
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: Colors.red[700],
                            fontSize: 14,
                          ),
                        ),
                      ),
                    
                    // Form content
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Basic Information
                            _buildSectionTitle('Basic Information'),
                            TextFormField(
                              controller: _nameController,
                              decoration: const InputDecoration(
                                labelText: 'Restaurant Name *',
                                border: OutlineInputBorder(),
                              ),
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'Please enter restaurant name';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: _brandController,
                                    decoration: const InputDecoration(
                                      labelText: 'Brand',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: DropdownButtonFormField<String>(
                                    value: _selectedAmenity,
                                    decoration: const InputDecoration(
                                      labelText: 'Type',
                                      border: OutlineInputBorder(),
                                    ),
                                    items: [
                                      'restaurant',
                                      'cafe',
                                      'bar',
                                      'pub',
                                      'fast_food',
                                      'bakery',
                                      'confectionery',
                                      'ice_cream',
                                      'food_court',
                                    ].map((String value) {
                                      return DropdownMenuItem<String>(
                                        value: value,
                                        child: Text(_formatAmenity(value)),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        _selectedAmenity = newValue!;
                                      });
                                    },
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            
                            TextFormField(
                              controller: _cuisineController,
                              decoration: const InputDecoration(
                                labelText: 'Cuisine',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Terminal Information
                            _buildSectionTitle('Terminal Information'),
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: _terminalNameController,
                                    decoration: const InputDecoration(
                                      labelText: 'Terminal Name',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: TextFormField(
                                    controller: _terminalShortController,
                                    decoration: const InputDecoration(
                                      labelText: 'Terminal Short',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            
                            TextFormField(
                              controller: _terminalIdController,
                              decoration: const InputDecoration(
                                labelText: 'Terminal ID',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Location Details
                            _buildSectionTitle('Location Details'),
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: _levelController,
                                    decoration: const InputDecoration(
                                      labelText: 'Level',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: TextFormField(
                                    controller: _floorController,
                                    decoration: const InputDecoration(
                                      labelText: 'Floor',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Contact Information
                            _buildSectionTitle('Contact Information'),
                            TextFormField(
                              controller: _websiteController,
                              decoration: const InputDecoration(
                                labelText: 'Website',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 16),
                            
                            TextFormField(
                              controller: _phoneController,
                              decoration: const InputDecoration(
                                labelText: 'Phone',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Dietary Options
                            _buildSectionTitle('Dietary Options'),
                            Wrap(
                              spacing: 8,
                              children: [
                                FilterChip(
                                  label: const Text('Vegan'),
                                  selected: _isVegan,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isVegan = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Vegetarian'),
                                  selected: _isVegetarian,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isVegetarian = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Halal'),
                                  selected: _isHalal,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isHalal = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Kosher'),
                                  selected: _isKosher,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isKosher = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Gluten-Free'),
                                  selected: _isGlutenFree,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isGlutenFree = selected;
                                    });
                                  },
                                ),
                              ],
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Services
                            _buildSectionTitle('Services'),
                            Wrap(
                              spacing: 8,
                              children: [
                                FilterChip(
                                  label: const Text('Takeaway'),
                                  selected: _hasTakeaway,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _hasTakeaway = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Delivery'),
                                  selected: _hasDelivery,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _hasDelivery = selected;
                                    });
                                  },
                                ),
                                FilterChip(
                                  label: const Text('Wheelchair Accessible'),
                                  selected: _isWheelchairAccessible,
                                  onSelected: (bool selected) {
                                    setState(() {
                                      _isWheelchairAccessible = selected;
                                    });
                                  },
                                ),
                              ],
                            ),
                            
                            const SizedBox(height: 24),
                            
                            // Additional Information
                            _buildSectionTitle('Additional Information'),
                            TextFormField(
                              controller: _locationNotesController,
                              decoration: const InputDecoration(
                                labelText: 'Location Notes',
                                border: OutlineInputBorder(),
                                hintText: 'Directions, landmarks, etc.',
                              ),
                              maxLines: 3,
                            ),
                            const SizedBox(height: 16),
                            
                            TextFormField(
                              controller: _descriptionController,
                              decoration: const InputDecoration(
                                labelText: 'Description',
                                border: OutlineInputBorder(),
                                hintText: 'About the restaurant...',
                              ),
                              maxLines: 4,
                            ),
                            const SizedBox(height: 16),
                            
                            TextFormField(
                              controller: _menuController,
                              decoration: const InputDecoration(
                                labelText: 'Menu',
                                border: OutlineInputBorder(),
                                hintText: 'Menu items, specialties...',
                              ),
                              maxLines: 6,
                            ),
                            
                            const SizedBox(height: 40),
                          ],
                        ),
                      ),
                    ),
                    
                    // Save button
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
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : Text(
                                widget.restaurantId == null || widget.restaurantId == 'new'
                                    ? 'Add Restaurant'
                                    : 'Save Changes',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: Color(0xFF2C2C2C),
        ),
      ),
    );
  }

  String _formatAmenity(String amenity) {
    switch (amenity.toLowerCase()) {
      case 'cafe':
        return 'Café';
      case 'pub':
        return 'Pub';
      case 'bar':
        return 'Bar';
      case 'fast_food':
        return 'Fast Food';
      case 'restaurant':
        return 'Restaurant';
      case 'bakery':
        return 'Bakery';
      case 'confectionery':
        return 'Confectionery';
      case 'ice_cream':
        return 'Ice Cream';
      case 'food_court':
        return 'Food Court';
      default:
        return amenity.replaceAll('_', ' ').split(' ').map((word) => 
          word.isNotEmpty ? '${word[0].toUpperCase()}${word.substring(1)}' : ''
        ).join(' ');
    }
  }

  Future<void> _deleteRestaurant() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Restaurant'),
        content: const Text('Are you sure you want to delete this restaurant? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() {
        _isSaving = true;
      });

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
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../services/firebase_service.dart';

class AirportDetailScreen extends StatefulWidget {
  final String airportId;

  const AirportDetailScreen({super.key, required this.airportId});

  @override
  State<AirportDetailScreen> createState() => _AirportDetailScreenState();
}

class _AirportDetailScreenState extends State<AirportDetailScreen> {
  Set<String> _selectedTerminals = {'north', 'south'}; // Start with both selected
  bool _isLoading = true;
  Map<String, dynamic>? _airportData;
  List<Restaurant> _firebaseRestaurants = [];
  /// Single selection: null = all terminals, else one terminal's id.
  String? _selectedFirebaseTerminalId;
  final TextEditingController _restaurantSearchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadFromFirebase();
    _restaurantSearchController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _restaurantSearchController.dispose();
    super.dispose();
  }

  List<Restaurant> _filterRestaurantsByQuery(List<Restaurant> list) {
    final q = _restaurantSearchController.text.trim().toLowerCase();
    if (q.isEmpty) return list;
    return list.where((r) {
      return r.name.toLowerCase().contains(q) || r.cuisine.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _loadFromFirebase() async {
    final airportData = await FirebaseService.getAirportData(widget.airportId);
    final restaurantMaps = await FirebaseService.getRestaurants(widget.airportId);
    final restaurants = restaurantMaps.map(_mapToRestaurant).toList();
    if (mounted) {
      setState(() {
        _airportData = airportData;
        _firebaseRestaurants = restaurants;
        _selectedFirebaseTerminalId = null;
        _isLoading = false;
      });
    }
  }

  Restaurant _mapToRestaurant(Map<String, dynamic> map) {
    final isOpen = map['isOpen'] ?? map['is_open'];
    final terminalId = _stringFromMap(map, ['terminal_id', 'terminalId', 'Terminal_ID']);
    final terminalShort = _stringFromMap(map, ['terminal_short', 'terminalShort', 'Terminal_Short']);
    final terminalName = _stringFromMap(map, ['terminal_name', 'terminalName', 'Terminal_Name']);
    return Restaurant(
      name: _stringFromMap(map, ['name', 'Name', 'restaurant_name']) ?? 'Unknown',
      cuisine: _stringFromMap(map, ['cuisine', 'Cuisine']) ?? '',
      location: _stringFromMap(map, ['location', 'Location']) ?? '',
      isOpen: isOpen is bool ? isOpen : true,
      logoUrl: _stringFromMap(map, ['logoUrl', 'logo_url', 'logo']) ?? '',
      terminalId: terminalId,
      terminalShort: terminalShort ?? terminalId,
      terminalName: terminalName ?? terminalShort ?? terminalId,
    );
  }

  /// Unique terminals for this airport (id, terminal_short, terminal_name), sorted by short name.
  List<_TerminalEntry> get _firebaseTerminalEntries {
    final byId = <String, _TerminalEntry>{};
    for (final r in _firebaseRestaurants) {
      final id = r.terminalId;
      if (id == null || id.isEmpty || byId.containsKey(id)) continue;
      byId[id] = _TerminalEntry(
        id: id,
        short: r.terminalShort ?? id,
        name: r.terminalName ?? r.terminalShort ?? id,
      );
    }
    final list = byId.values.toList()..sort((a, b) => a.short.compareTo(b.short));
    return list;
  }

  void _setSelectedFirebaseTerminal(String? terminalId) {
    setState(() => _selectedFirebaseTerminalId = terminalId);
  }

  String? _stringFromMap(Map<String, dynamic> map, List<String> keys) {
    for (final k in keys) {
      final v = map[k];
      if (v != null && v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  void _selectTerminal(String terminal) {
    setState(() {
      if (_selectedTerminals.contains(terminal)) {
        // If terminal is selected, remove it
        _selectedTerminals.remove(terminal);
      } else {
        // If terminal is not selected, add it
        _selectedTerminals.add(terminal);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: kPage,
        appBar: AppBar(
          title: Text(FirebaseService.getAirportName(widget.airportId)),
          backgroundColor: kPage,
          foregroundColor: kInk,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/airport-search'),
          ),
        ),
        body: const Center(
          child: CircularProgressIndicator(color: kTeal),
        ),
      );
    }
    if (_firebaseRestaurants.isNotEmpty) {
      return _buildFirebaseAirportScreen(context);
    }
    if (widget.airportId == 'LGW') {
      return _buildLondonGatwickScreen(context);
    }
    return _buildPlaceholderScreen(context);
  }

  Widget _buildFirebaseAirportScreen(BuildContext context) {
    final name = _airportData?['name'] as String? ?? FirebaseService.getAirportName(widget.airportId);
    final location = _airportData?['location'] as String? ?? FirebaseService.getAirportLocation(widget.airportId);

    return Scaffold(
      backgroundColor: kPage,
      appBar: AppBar(
        title: Text(name),
        backgroundColor: kPage,
        foregroundColor: kInk,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/airport-search'),
        ),
      ),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: kTeal.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        decoration: const BoxDecoration(
                          color: kTeal,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.flight, color: Colors.white, size: 30),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: GoogleFonts.jost(
                                fontSize: 24,
                                fontWeight: FontWeight.w600,
                                color: kInk,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${widget.airportId} • $location',
                              style: GoogleFonts.jost(fontSize: 16, color: kInk.withOpacity(0.6)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _StickyFilterDelegate(
                minHeight: 168,
                maxHeight: 168,
                child: SizedBox(
                  height: 168,
                  child: Container(
                    color: kPage,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_firebaseTerminalEntries.isNotEmpty) ...[
                          Text(
                            'Terminal',
                            style: GoogleFonts.jost(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: kInk,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              border: Border.all(color: kGoldLight.withOpacity(0.3)),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String?>(
                                value: _selectedFirebaseTerminalId,
                                isExpanded: true,
                                isDense: true,
                                hint: Text(
                                  'All terminals',
                                  style: GoogleFonts.jost(fontSize: 14, color: kInk.withOpacity(0.7)),
                                ),
                                items: [
                                  DropdownMenuItem<String?>(
                                    value: null,
                                    child: Text(
                                      'All terminals',
                                      style: GoogleFonts.jost(fontSize: 14, color: kInk),
                                    ),
                                  ),
                                  ..._firebaseTerminalEntries.map((t) => DropdownMenuItem<String?>(
                                    value: t.id,
                                    child: Text(
                                      t.name,
                                      style: GoogleFonts.jost(fontSize: 14, color: kInk),
                                    ),
                                  )),
                                ],
                                onChanged: _setSelectedFirebaseTerminal,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                        Text(
                          'Search restaurants',
                          style: GoogleFonts.jost(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: kInk,
                          ),
                        ),
                        const SizedBox(height: 4),
                        TextField(
                          controller: _restaurantSearchController,
                          decoration: InputDecoration(
                            hintText: 'Name or cuisine...',
                            prefixIcon: Icon(Icons.search, color: kInk.withOpacity(0.5), size: 20),
                            filled: true,
                            fillColor: Colors.white,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide(color: kGoldLight.withOpacity(0.3)),
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                          style: GoogleFonts.jost(fontSize: 14, color: kInk),
                          onChanged: (_) => setState(() {}),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Restaurants & Cafés',
                      style: GoogleFonts.jost(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: kInk,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildFirebaseRestaurantSections(context),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFirebaseRestaurantSections(BuildContext context) {
    List<Restaurant> filtered;
    String sectionTitle;
    if (_firebaseTerminalEntries.isNotEmpty && _selectedFirebaseTerminalId != null) {
      for (final t in _firebaseTerminalEntries) {
        if (t.id == _selectedFirebaseTerminalId) {
          filtered = _filterRestaurantsByQuery(
            _firebaseRestaurants.where((r) => r.terminalId == t.id).toList(),
          );
          if (filtered.isEmpty) return _buildEmptyRestaurantState(context);
          return _buildRestaurantSection(context, t.name, filtered);
        }
      }
    }
    if (_firebaseTerminalEntries.isNotEmpty) {
      final sections = <Widget>[];
      for (final t in _firebaseTerminalEntries) {
        final list = _filterRestaurantsByQuery(
          _firebaseRestaurants.where((r) => r.terminalId == t.id).toList(),
        );
        if (list.isEmpty) continue;
        if (sections.isNotEmpty) sections.add(const SizedBox(height: 16));
        sections.add(_buildRestaurantSection(context, t.name, list));
      }
      if (sections.isEmpty) return _buildEmptyRestaurantState(context);
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: sections);
    }
    filtered = _filterRestaurantsByQuery(_firebaseRestaurants);
    if (filtered.isEmpty) return _buildEmptyRestaurantState(context);
    return _buildRestaurantSection(context, 'All', filtered);
  }

  Widget _buildEmptyRestaurantState(BuildContext context) {
    final hasQuery = _restaurantSearchController.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off, size: 48, color: kInk.withOpacity(0.3)),
            const SizedBox(height: 12),
            Text(
              hasQuery ? 'No restaurants match your search' : 'No restaurants here',
              style: GoogleFonts.jost(fontSize: 16, color: kInk.withOpacity(0.6)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceholderScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      appBar: AppBar(
        title: const Text('Airport Details'),
        backgroundColor: kPage,
        foregroundColor: kInk,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/airport-search'),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: kTeal.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.flight, color: kTeal, size: 40),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Airport Details',
                      style: GoogleFonts.jost(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: kInk,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Airport ID: ${widget.airportId}',
                      style: GoogleFonts.jost(fontSize: 16, color: kInk.withOpacity(0.6)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border.all(color: kGoldLight.withOpacity(0.2)),
                  borderRadius: BorderRadius.circular(3),
                  color: Colors.white,
                ),
                child: Column(
                  children: [
                    Icon(Icons.construction, size: 48, color: kInk.withOpacity(0.4)),
                    const SizedBox(height: 16),
                    Text(
                      'Airport Details Coming Soon',
                      style: GoogleFonts.jost(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: kInk,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'This screen will display detailed information about the selected airport including flights, facilities, and more.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.jost(fontSize: 14, color: kInk.withOpacity(0.6)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => context.go('/airport-search'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kTeal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  child: Text(
                    'BACK TO SEARCH',
                    style: GoogleFonts.jost(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 2.2,
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

  Widget _buildLondonGatwickScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      appBar: AppBar(
        title: const Text('London Gatwick'),
        backgroundColor: kPage,
        foregroundColor: kInk,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/airport-search'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: kTeal.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: const BoxDecoration(
                        color: kTeal,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.flight, color: Colors.white, size: 30),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'London Gatwick',
                            style: GoogleFonts.jost(
                              fontSize: 24,
                              fontWeight: FontWeight.w600,
                              color: kInk,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'LGW • London, United Kingdom',
                            style: GoogleFonts.jost(fontSize: 16, color: kInk.withOpacity(0.6)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Terminals',
                style: GoogleFonts.jost(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: kInk,
                ),
              ),
              const SizedBox(height: 12),
              
              Row(
                children: [
                  Expanded(
                    child: _buildTerminalCard(
                      context,
                      'North Terminal',
                      'N',
                      _selectedTerminals.contains('north'),
                      () => _selectTerminal('north'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTerminalCard(
                      context,
                      'South Terminal',
                      'S',
                      _selectedTerminals.contains('south'),
                      () => _selectTerminal('south'),
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 24),
              
              Text(
                'Restaurants & Cafés',
                style: GoogleFonts.jost(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: kInk,
                ),
              ),
              const SizedBox(height: 12),
              
              // Show restaurants based on selected terminals
              Column(
                children: [
                  if (_selectedTerminals.contains('north')) ...[
                    _buildRestaurantSection(context, 'North Terminal', _getNorthTerminalRestaurants()),
                    if (_selectedTerminals.contains('south')) const SizedBox(height: 16),
                  ],
                  if (_selectedTerminals.contains('south'))
                    _buildRestaurantSection(context, 'South Terminal', _getSouthTerminalRestaurants()),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// [subtitle] = text underneath (e.g. terminal_name). [title] = big lettering (e.g. terminal_short).
  Widget _buildTerminalCard(BuildContext context, String subtitle, String title, bool isSelected, VoidCallback onPressed) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? kTeal : kGoldLight.withOpacity(0.3),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(3),
          color: isSelected ? kTeal.withOpacity(0.05) : Colors.white,
        ),
        child: Column(
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: isSelected ? kTeal : kInk.withOpacity(0.6),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: isSelected ? kTeal : kInk.withOpacity(0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRestaurantSection(BuildContext context, String terminalName, List<Restaurant> restaurants) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          terminalName,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: kInk,
          ),
        ),
        const SizedBox(height: 8),
        ...restaurants.map((restaurant) => _buildRestaurantCard(context, restaurant)),
      ],
    );
  }

  Widget _buildRestaurantCard(BuildContext context, Restaurant restaurant) {
    return GestureDetector(
      onTap: () {
        context.push('/restaurant-detail', extra: {
          'name': restaurant.name,
          'cuisine': restaurant.cuisine,
          'location': restaurant.location,
          'isOpen': restaurant.isOpen,
          'logoUrl': restaurant.logoUrl,
          'airportName': 'London Gatwick (LGW)',
        });
      },
      child: Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: kGoldLight.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(8),
        color: Colors.white,
      ),
      child: Row(
        children: [
          // Restaurant Logo
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: kGoldLight.withOpacity(0.2)),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                restaurant.logoUrl,
                width: 50,
                height: 50,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    color: kPage,
                    child: Icon(
                      _getRestaurantIcon(restaurant.cuisine),
                      color: kTeal,
                      size: 24,
                    ),
                  );
                },
              ),
            ),
          ),
          
          const SizedBox(width: 12),
          
          // Restaurant Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  restaurant.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  restaurant.cuisine,
                  style: TextStyle(
                    fontSize: 14,
                    color: kInk.withOpacity(0.6),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  restaurant.location,
                  style: TextStyle(
                    fontSize: 12,
                    color: kInk.withOpacity(0.5),
                  ),
                ),
              ],
            ),
          ),
          
          // Status Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: restaurant.isOpen ? Colors.green : Colors.red,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              restaurant.isOpen ? 'Open' : 'Closed',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    ),
    );
  }

  IconData _getRestaurantIcon(String cuisine) {
    switch (cuisine.toLowerCase()) {
      case 'coffee':
        return Icons.coffee;
      case 'pub':
        return Icons.local_bar;
      case 'pizza':
        return Icons.local_pizza;
      case 'burger':
        return Icons.fastfood;
      case 'asian':
        return Icons.ramen_dining;
      case 'breakfast':
        return Icons.breakfast_dining;
      case 'sandwich':
        return Icons.lunch_dining;
      default:
        return Icons.restaurant;
    }
  }

  List<Restaurant> _getNorthTerminalRestaurants() {
    return [
      Restaurant(
        name: 'Bar on the Balcony',
        cuisine: 'Bar',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/bar-on-the-balcony.jpg',
      ),
      Restaurant(
        name: 'Black Sheep Coffee',
        cuisine: 'Coffee',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/black-sheep-coffee.jpg',
      ),
      Restaurant(
        name: 'The Breakfast Club',
        cuisine: 'Breakfast',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-breakfast-club.jpg',
      ),
      Restaurant(
        name: 'BrewDog',
        cuisine: 'Pub',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/brewdog.jpg',
      ),
      Restaurant(
        name: 'Juniper & Co',
        cuisine: 'Restaurant',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/juniper-co.jpg',
      ),
      Restaurant(
        name: 'Krispy Kreme',
        cuisine: 'Dessert',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/krispy-kreme.jpg',
      ),
      Restaurant(
        name: 'Pret a Manger',
        cuisine: 'Sandwich',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pret-a-manger.jpg',
      ),
      Restaurant(
        name: 'Pure',
        cuisine: 'Café',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pure.jpg',
      ),
      Restaurant(
        name: 'The Red Lion',
        cuisine: 'Pub',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/red-lion.jpg',
      ),
      Restaurant(
        name: 'Shake Shack',
        cuisine: 'Burger',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/shake-shack.jpg',
      ),
      Restaurant(
        name: 'Sonoma',
        cuisine: 'Restaurant',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/sonoma.jpg',
      ),
      Restaurant(
        name: 'Starbucks',
        cuisine: 'Coffee',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/starbucks.jpg',
      ),
      Restaurant(
        name: 'Sussex House',
        cuisine: 'Restaurant',
        location: 'Before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/sussex-house.jpg',
      ),
      Restaurant(
        name: 'Tortilla',
        cuisine: 'Mexican',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/tortilla.jpg',
      ),
      Restaurant(
        name: 'wagamama',
        cuisine: 'Asian',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wagamama.jpg',
      ),
    ];
  }

  List<Restaurant> _getSouthTerminalRestaurants() {
    return [
      Restaurant(
        name: 'The Beehive',
        cuisine: 'Pub',
        location: 'Before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-beehive.jpg',
      ),
      Restaurant(
        name: 'Big Smoke',
        cuisine: 'Bar',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/big-smoke.jpg',
      ),
      Restaurant(
        name: 'Black Sheep Coffee',
        cuisine: 'Coffee',
        location: 'Before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/black-sheep-coffee.jpg',
      ),
      Restaurant(
        name: 'Caffe Nero',
        cuisine: 'Coffee',
        location: 'Before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/caffe-nero.jpg',
      ),
      Restaurant(
        name: 'The Flying Horse',
        cuisine: 'Pub',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/the-flying-horse.jpg',
      ),
      Restaurant(
        name: 'Giraffe',
        cuisine: 'Restaurant',
        location: 'Before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/giraffe.jpg',
      ),
      Restaurant(
        name: 'Greggs',
        cuisine: 'Sandwich',
        location: 'Arrivals',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/greggs.jpg',
      ),
      Restaurant(
        name: 'itsu',
        cuisine: 'Asian',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/itsu.jpg',
      ),
      Restaurant(
        name: 'Joe & The Juice',
        cuisine: 'Juice Bar',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/joe-and-the-juice.jpg',
      ),
      Restaurant(
        name: 'Nandos',
        cuisine: 'Chicken',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/nandos.jpg',
      ),
      Restaurant(
        name: 'PizzaExpress',
        cuisine: 'Pizza',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pizza-express.jpg',
      ),
      Restaurant(
        name: 'Pret a Manger',
        cuisine: 'Sandwich',
        location: 'Arrivals and after security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/pret-a-manger.jpg',
      ),
      Restaurant(
        name: 'South Downs Bar',
        cuisine: 'Bar',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/south-downs-bar.jpg',
      ),
      Restaurant(
        name: 'Starbucks',
        cuisine: 'Coffee',
        location: 'After security and before security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/starbucks.jpg',
      ),
      Restaurant(
        name: 'wagamama',
        cuisine: 'Asian',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wagamama.jpg',
      ),
      Restaurant(
        name: 'Wondertree',
        cuisine: 'Restaurant',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/wondertree.jpg',
      ),
      Restaurant(
        name: 'Small Batch Social',
        cuisine: 'Coffee',
        location: 'After security',
        isOpen: true,
        logoUrl: 'https://www.gatwickairport.com/wp-content/uploads/2023/01/small-batch-social.jpg',
      ),
    ];
  }
}

class _TerminalEntry {
  final String id;
  final String short;  // terminal_short (big lettering)
  final String name;   // terminal_name (underneath)
  const _TerminalEntry({required this.id, required this.short, required this.name});
}

class _StickyFilterDelegate extends SliverPersistentHeaderDelegate {
  final double minHeight;
  final double maxHeight;
  final Widget child;

  _StickyFilterDelegate({
    required this.minHeight,
    required this.maxHeight,
    required this.child,
  });

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return child;
  }

  @override
  double get minExtent => minHeight;

  @override
  double get maxExtent => maxHeight;

  @override
  bool shouldRebuild(covariant _StickyFilterDelegate oldDelegate) => true;
}

class Restaurant {
  final String name;
  final String cuisine;
  final String location;
  final bool isOpen;
  final String logoUrl;
  /// Terminal identifier for filtering (e.g. from Firestore `terminal_id`).
  final String? terminalId;
  /// Short label (e.g. from Firestore `terminal_short`: "North", "South") — shown as big lettering.
  final String? terminalShort;
  /// Full name (e.g. from Firestore `terminal_name`: "North Terminal") — shown underneath.
  final String? terminalName;

  Restaurant({
    required this.name,
    required this.cuisine,
    required this.location,
    required this.isOpen,
    required this.logoUrl,
    this.terminalId,
    this.terminalShort,
    this.terminalName,
  });
} 
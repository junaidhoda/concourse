import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/admin_service.dart';

class AdminAirportScreen extends StatefulWidget {
  final String airportCode;

  const AdminAirportScreen({super.key, required this.airportCode});

  @override
  State<AdminAirportScreen> createState() => _AdminAirportScreenState();
}

class _AdminAirportScreenState extends State<AdminAirportScreen> {
  List<Map<String, dynamic>> _restaurants = [];
  Map<String, dynamic>? _airportData;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final restaurants = await AdminService.getRestaurantsForAirport(widget.airportCode);
      final airports = await AdminService.getAllAirports();
      final airportData = airports.firstWhere(
        (airport) => airport['id'] == widget.airportCode,
        orElse: () => {},
      );

      setState(() {
        _restaurants = restaurants;
        _airportData = airportData;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load data: $e';
        _isLoading = false;
      });
    }
  }

  void _editRestaurant(Map<String, dynamic> restaurant) {
    context.go('/admin/restaurant/${widget.airportCode}/${restaurant['id']}');
  }

  void _addRestaurant() {
    context.go('/admin/restaurant/${widget.airportCode}/new');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text('${widget.airportCode} Management'),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        foregroundColor: Theme.of(context).brightness == Brightness.dark ? Colors.white : const Color(0xFF3E6BC1),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/dashboard'),
        ),
      ),
      body: SafeArea(
        child: _isLoading
            ? const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3E6BC1)),
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Loading data...',
                      style: TextStyle(
                        fontSize: 16,
                        color: Color(0xFF2C2C2C),
                      ),
                    ),
                  ],
                ),
              )
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.error_outline,
                          size: 64,
                          color: Colors.red[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Error',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.red[700],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[600],
                          ),
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: _loadData,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF3E6BC1),
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : Column(
                    children: [
                      // Airport info
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.all(16),
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: const Color(0xFF3E6BC1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 50,
                                  height: 50,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Icon(
                                    Icons.flight,
                                    color: Colors.white,
                                    size: 24,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        widget.airportCode,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 24,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      Text(
                                        '${_restaurants.length} restaurants',
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 16,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      
                      // Actions
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: _addRestaurant,
                                icon: const Icon(Icons.add),
                                label: const Text('Add Restaurant'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF3E6BC1),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Restaurants list
                      Expanded(
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _restaurants.length,
                          itemBuilder: (context, index) {
                            final restaurant = _restaurants[index];
                            final name = restaurant['name'] as String? ?? 'Unnamed Restaurant';
                            final amenity = restaurant['amenity'] as String? ?? 'restaurant';
                            final terminalName = restaurant['terminal_name'] as String? ?? 'Unknown Terminal';
                            
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: ListTile(
                                leading: Container(
                                  width: 50,
                                  height: 50,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF3E6BC1).withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    _getRestaurantIcon(amenity),
                                    color: const Color(0xFF3E6BC1),
                                    size: 24,
                                  ),
                                ),
                                title: Text(
                                  name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 16,
                                  ),
                                ),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(_formatAmenity(amenity)),
                                    Text(terminalName),
                                  ],
                                ),
                                trailing: const Icon(Icons.edit),
                                onTap: () => _editRestaurant(restaurant),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
      ),
    );
  }

  IconData _getRestaurantIcon(String amenity) {
    switch (amenity.toLowerCase()) {
      case 'cafe':
        return Icons.coffee;
      case 'pub':
      case 'bar':
        return Icons.local_bar;
      case 'fast_food':
        return Icons.fastfood;
      case 'restaurant':
        return Icons.restaurant;
      case 'bakery':
        return Icons.cake;
      case 'confectionery':
        return Icons.cake;
      case 'ice_cream':
        return Icons.icecream;
      case 'food_court':
        return Icons.storefront;
      default:
        return Icons.restaurant;
    }
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
} 
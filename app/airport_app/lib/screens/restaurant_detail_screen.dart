import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class RestaurantDetailScreen extends StatelessWidget {
  final String name;
  final String cuisine;
  final String location;
  final bool isOpen;
  final String logoUrl;
  final String airportName;

  const RestaurantDetailScreen({
    super.key,
    required this.name,
    required this.cuisine,
    required this.location,
    required this.isOpen,
    required this.logoUrl,
    this.airportName = '',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      appBar: AppBar(
        title: Text(name),
        backgroundColor: kPage,
        foregroundColor: kInk,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header image/logo
            Container(
              width: double.infinity,
              height: 200,
              color: kTeal.withOpacity(0.1),
              child: Center(
                child: Image.network(
                  logoUrl,
                  height: 120,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) {
                    return Icon(
                      _getRestaurantIcon(cuisine),
                      size: 80,
                      color: kTeal,
                    );
                  },
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name and status
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          style: GoogleFonts.jost(
                            fontSize: 26,
                            fontWeight: FontWeight.w600,
                            color: kInk,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: isOpen ? Colors.green : Colors.red,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          isOpen ? 'Open' : 'Closed',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  // Info cards
                  _buildInfoRow(Icons.restaurant_menu, 'Cuisine', cuisine),
                  const SizedBox(height: 12),
                  _buildInfoRow(Icons.location_on_outlined, 'Location', location),
                  if (airportName.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildInfoRow(Icons.flight, 'Airport', airportName),
                  ],

                  const SizedBox(height: 28),

                  // Menu section placeholder
                  const Text(
                    'Menu',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: kInk,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      border: Border.all(color: kGoldLight.withOpacity(0.2)),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.menu_book, size: 48, color: kInk.withOpacity(0.4)),
                        const SizedBox(height: 12),
                        Text(
                          'Menu coming soon',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: kInk.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 28),

                  // Reviews section placeholder
                  const Text(
                    'Reviews',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: kInk,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      border: Border.all(color: kGoldLight.withOpacity(0.2)),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.rate_review_outlined, size: 48, color: kInk.withOpacity(0.4)),
                        const SizedBox(height: 12),
                        Text(
                          'No reviews yet',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: kInk.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: kGoldLight.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: kTeal, size: 22),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.jost(fontSize: 12, color: kInk.withOpacity(0.5)),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: kInk,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  IconData _getRestaurantIcon(String cuisine) {
    switch (cuisine.toLowerCase()) {
      case 'coffee':
        return Icons.coffee;
      case 'pub' || 'bar':
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
      case 'dessert':
        return Icons.cake;
      case 'juice bar':
        return Icons.local_drink;
      default:
        return Icons.restaurant;
    }
  }
}

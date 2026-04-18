import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class AirportSearchScreen extends StatefulWidget {
  final String initialQuery;

  const AirportSearchScreen({super.key, this.initialQuery = ''});

  @override
  State<AirportSearchScreen> createState() => _AirportSearchScreenState();
}

class _AirportSearchScreenState extends State<AirportSearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;
  String? _selectedContinent;

  final Map<String, List<Airport>> _airportsByContinent = {
    'Europe': [
      Airport(id: 'BHX', name: 'Birmingham', iataCode: 'BHX', city: 'Birmingham', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'CDG', name: 'Paris Charles de Gaulle', iataCode: 'CDG', city: 'Paris', country: 'France', countryCode: 'FR'),
      Airport(id: 'FRA', name: 'Frankfurt Airport', iataCode: 'FRA', city: 'Frankfurt', country: 'Germany', countryCode: 'DE'),
      Airport(id: 'IST', name: 'Istanbul Airport', iataCode: 'IST', city: 'Istanbul', country: 'Turkey', countryCode: 'TR'),
      Airport(id: 'LGW', name: 'London Gatwick', iataCode: 'LGW', city: 'London', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'LHR', name: 'London Heathrow', iataCode: 'LHR', city: 'London', country: 'United Kingdom', countryCode: 'GB'),
      Airport(id: 'MAN', name: 'Manchester', iataCode: 'MAN', city: 'Manchester', country: 'United Kingdom', countryCode: 'GB'),
    ],
    'North America': [
      Airport(id: 'JFK', name: 'New York John F. Kennedy', iataCode: 'JFK', city: 'New York', country: 'USA', countryCode: 'US'),
      Airport(id: 'LAX', name: 'Los Angeles International', iataCode: 'LAX', city: 'Los Angeles', country: 'USA', countryCode: 'US'),
    ],
    'Asia': [
      Airport(id: 'BKK', name: 'Bangkok Suvarnabhumi', iataCode: 'BKK', city: 'Bangkok', country: 'Thailand', countryCode: 'TH'),
      Airport(id: 'SIN', name: 'Singapore Changi', iataCode: 'SIN', city: 'Singapore', country: 'Singapore', countryCode: 'SG'),
    ],
    'Middle East': [
      Airport(id: 'DXB', name: 'Dubai International', iataCode: 'DXB', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE'),
    ],
  };

  List<Airport> get _allAirports =>
      _airportsByContinent.values.expand((list) => list).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  List<Airport> _filteredAirports = [];

  @override
  void initState() {
    super.initState();
    if (widget.initialQuery.isNotEmpty) {
      _searchController.text = widget.initialQuery;
      _isSearching = true;
      _onSearchChanged(widget.initialQuery);
    } else {
      _filteredAirports = [];
    }
  }

  void _onSearchChanged(String query) {
    setState(() {
      if (query.isEmpty) {
        _filteredAirports = [];
      } else {
        _filteredAirports = _allAirports.where((airport) {
          return airport.name.toLowerCase().contains(query.toLowerCase()) ||
              airport.city.toLowerCase().contains(query.toLowerCase()) ||
              airport.country.toLowerCase().contains(query.toLowerCase()) ||
              airport.iataCode.toLowerCase().contains(query.toLowerCase());
        }).toList();
      }
    });
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _filteredAirports = [];
      _isSearching = false;
    });
  }

  void _selectContinent(String continent) {
    setState(() {
      _selectedContinent = continent;
    });
  }

  void _backToContinents() {
    setState(() {
      _selectedContinent = null;
    });
  }

  static const Map<String, String> _continentImages = {
    'Europe': 'assets/images/europe.png',
    'North America': 'assets/images/north_america.png',
    'Asia': 'assets/images/asia.png',
    'Middle East': 'assets/images/middle_east.png',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPage,
      body: SafeArea(
        child: Column(
          children: [
            // Search Bar
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: kGoldLight.withOpacity(0.3)),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: TextField(
                        controller: _searchController,
                        onChanged: (query) {
                          _onSearchChanged(query);
                          if (query.isNotEmpty && _selectedContinent != null) {
                            setState(() => _selectedContinent = null);
                          }
                        },
                        onTap: () {
                          setState(() {
                            _isSearching = true;
                          });
                        },
                        decoration: InputDecoration(
                          hintText: 'Search airports...',
                          border: InputBorder.none,
                          prefixIcon: Icon(Icons.search, color: kInk.withOpacity(0.4)),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: Icon(Icons.clear, color: kInk.withOpacity(0.4)),
                                  onPressed: _clearSearch,
                                )
                              : null,
                        ),
                      ),
                    ),
                  ),
                  if (_isSearching) ...[
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _isSearching = false;
                          _clearSearch();
                        });
                      },
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.jost(
                          color: kTeal,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // Content
            Expanded(
              child: _searchController.text.isNotEmpty
                  ? _buildSearchResults()
                  : AnimatedSwitcher(
                      duration: const Duration(milliseconds: 350),
                      switchInCurve: Curves.easeOut,
                      switchOutCurve: Curves.easeIn,
                      transitionBuilder: (child, animation) {
                        final isForward = child.key == ValueKey(_selectedContinent);
                        final offsetTween = Tween<Offset>(
                          begin: Offset(isForward ? 1.0 : -1.0, 0.0),
                          end: Offset.zero,
                        );
                        return SlideTransition(
                          position: offsetTween.animate(animation),
                          child: FadeTransition(
                            opacity: animation,
                            child: child,
                          ),
                        );
                      },
                      child: _selectedContinent != null
                          ? KeyedSubtree(
                              key: ValueKey(_selectedContinent),
                              child: _buildAirportList(),
                            )
                          : KeyedSubtree(
                              key: const ValueKey('continents'),
                              child: _buildContinentGrid(),
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContinentGrid() {
    final continents = _airportsByContinent.keys.toList();
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      itemCount: continents.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              'Browse by Region',
              style: GoogleFonts.jost(
                fontSize: 24,
                fontWeight: FontWeight.w600,
                color: kInk,
              ),
            ),
          );
        }

        final continent = continents[index - 1];
        final imagePath = _continentImages[continent] ?? '';
        final count = _airportsByContinent[continent]!.length;

        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: GestureDetector(
            onTap: () => _selectContinent(continent),
            child: Container(
              height: 130,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: kInk.withOpacity(0.12),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Transform.scale(
                      scale: 1.3,
                      child: Image.asset(
                        imagePath,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: [
                            kInk.withOpacity(0.55),
                            kInk.withOpacity(0.15),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  continent,
                                  style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                    shadows: [Shadow(blurRadius: 6, color: kInk.withOpacity(0.3))],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '$count airport${count == 1 ? '' : 's'}',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: Colors.white.withOpacity(0.9),
                                    shadows: [Shadow(blurRadius: 4, color: kInk.withOpacity(0.3))],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.arrow_forward_ios,
                            color: Colors.white.withOpacity(0.9),
                            size: 20,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildAirportList() {
    final airports = _airportsByContinent[_selectedContinent] ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Row(
            children: [
              GestureDetector(
                onTap: _backToContinents,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    border: Border.all(color: kGoldLight.withOpacity(0.3)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(Icons.arrow_back, size: 20, color: kInk),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _selectedContinent!,
                  style: GoogleFonts.jost(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    color: kInk,
                  ),
                ),
              ),
              Text(
                '${airports.length} airport${airports.length == 1 ? '' : 's'}',
                style: GoogleFonts.jost(fontSize: 14, color: kInk.withOpacity(0.6)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            itemCount: airports.length,
            itemBuilder: (context, index) {
              return AirportListItem(airport: airports[index]);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_filteredAirports.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 64, color: kInk.withOpacity(0.25)),
            const SizedBox(height: 16),
            Text(
              'No airports found',
              style: GoogleFonts.jost(fontSize: 18, color: kInk.withOpacity(0.5)),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      itemCount: _filteredAirports.length,
      itemBuilder: (context, index) {
        return AirportListItem(airport: _filteredAirports[index]);
      },
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

class AirportListItem extends StatelessWidget {
  final Airport airport;

  const AirportListItem({super.key, required this.airport});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        context.push('/airport-detail/${airport.id}');
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        child: Row(
          children: [
            ClipOval(
              child: Image.asset(
                airport.flagAsset,
                width: 40,
                height: 40,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    airport.name,
                    style: TextStyle(
                      color: kTeal,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${airport.iataCode} • ${airport.city}, ${airport.country}',
                    style: const TextStyle(
                      color: kInk,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.arrow_forward_ios,
              color: kInk.withOpacity(0.4),
              size: 16,
            ),
          ],
        ),
      ),
    );
  }
}

class Airport {
  final String id;
  final String name;
  final String iataCode;
  final String city;
  final String country;
  final String countryCode;

  Airport({
    required this.id,
    required this.name,
    required this.iataCode,
    required this.city,
    required this.country,
    required this.countryCode,
  });

  String get flagAsset => 'assets/images/flag_${countryCode.toLowerCase()}.png';
}

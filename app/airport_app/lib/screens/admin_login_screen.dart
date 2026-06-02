import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme/app_theme.dart';
import '../services/admin_service.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) context.go('/login');
      return;
    }
    final isAdmin = await AdminService.checkIsAdmin();
    if (!mounted) return;
    if (isAdmin) {
      context.go('/admin/dashboard');
    } else {
      setState(() => _checking = false);
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
            child: Center(
              child: _checking
                  ? CircularProgressIndicator(color: kTeal, strokeWidth: 1.5)
                  : Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 56, height: 56,
                            decoration: BoxDecoration(
                              color: kGold.withValues(alpha: 0.08),
                              shape: BoxShape.circle,
                              border: Border.all(color: kGoldLight.withValues(alpha: 0.30)),
                            ),
                            child: Icon(Icons.lock_outline_rounded, color: kGold, size: 24),
                          ),
                          const SizedBox(height: 20),
                          Text('Access Denied', style: GoogleFonts.cormorant(
                            fontSize: 26, fontWeight: FontWeight.w500,
                            color: context.appOnSurface,
                          )),
                          const SizedBox(height: 8),
                          Text(
                            'Your account does not have admin permissions.',
                            style: GoogleFonts.jost(
                              fontSize: 13, color: context.appMutedFg(0.50),
                              height: 1.5,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 28),
                          GestureDetector(
                            onTap: () => context.go('/explore'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                              decoration: BoxDecoration(
                                color: appCardSurface(context),
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                              ),
                              child: Text('Go back', style: GoogleFonts.jost(
                                fontSize: 13, color: context.appOnSurface, letterSpacing: 0.3,
                              )),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ],
      ),
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

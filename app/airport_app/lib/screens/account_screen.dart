import 'dart:math' as math;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: AuthService.authStateChanges,
      builder: (context, snapshot) {
        final user = snapshot.data;
        if (user != null) return _SignedInScreen(user: user);
        return const _GuestScreen();
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SIGNED-IN SCREEN
// ─────────────────────────────────────────────────────────────
class _SignedInScreen extends StatefulWidget {
  final User user;
  const _SignedInScreen({required this.user});

  @override
  State<_SignedInScreen> createState() => _SignedInScreenState();
}

class _SignedInScreenState extends State<_SignedInScreen> with TickerProviderStateMixin {
  late final AnimationController _headerCtrl;
  late final AnimationController _avatarCtrl;
  late final AnimationController _sectionsCtrl;

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl   = AnimationController(vsync: this, duration: dur);
    _avatarCtrl   = AnimationController(vsync: this, duration: dur);
    _sectionsCtrl = AnimationController(vsync: this, duration: dur);

    _delayed(150, _headerCtrl);
    _delayed(300, _avatarCtrl);
    _delayed(450, _sectionsCtrl);
  }

  @override
  void dispose() {
    _headerCtrl.dispose();
    _avatarCtrl.dispose();
    _sectionsCtrl.dispose();
    super.dispose();
  }

  Widget _fadeUp(Widget child, AnimationController ctrl) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
            .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
        child: child,
      ),
    );
  }

  String get _displayName {
    final u = widget.user;
    if (u.displayName != null && u.displayName!.isNotEmpty) return u.displayName!;
    final email = u.email ?? '';
    final prefix = email.contains('@') ? email.split('@').first : email;
    return prefix.isEmpty ? 'Traveller' : prefix[0].toUpperCase() + prefix.substring(1);
  }

  String get _initials {
    final name = _displayName;
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  String get _memberSince {
    final created = widget.user.metadata.creationTime;
    if (created == null) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return 'Member since ${months[created.month - 1]} ${created.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          const _Background(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
              children: [
                // ── Header ──
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Account',
                        style: GoogleFonts.cormorant(
                          fontSize: 36, fontWeight: FontWeight.w600,
                          letterSpacing: 0.3, color: context.appOnSurface,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        'Your Concourse profile',
                        style: GoogleFonts.jost(
                          fontSize: 12, fontWeight: FontWeight.w400,
                          letterSpacing: 2.0, color: context.appMutedFg(0.44),
                        ),
                      ),
                      const SizedBox(height: 14),
                      _rule(context),
                    ],
                  ),
                  _headerCtrl,
                ),
                const SizedBox(height: 28),

                // ── Avatar + identity ──
                _fadeUp(
                  Column(
                    children: [
                      Center(
                        child: Container(
                          width: 88, height: 88,
                          decoration: BoxDecoration(
                            color: kTeal.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                            border: Border.all(color: kTeal.withValues(alpha: 0.35), width: 1.5),
                          ),
                          child: Center(
                            child: Text(
                              _initials,
                              style: GoogleFonts.cormorant(
                                fontSize: 32, fontWeight: FontWeight.w500,
                                color: kTeal, letterSpacing: 1,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: Text(
                          _displayName,
                          style: GoogleFonts.cormorant(
                            fontSize: 26, fontWeight: FontWeight.w400,
                            color: context.appOnSurface, letterSpacing: 0.2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Center(
                        child: Text(
                          widget.user.email ?? '',
                          style: GoogleFonts.jost(
                            fontSize: 12, fontWeight: FontWeight.w400,
                            letterSpacing: 0.5, color: context.appMutedFg(0.50),
                          ),
                        ),
                      ),
                      if (_memberSince.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Center(
                          child: Text(
                            _memberSince,
                            style: GoogleFonts.jost(
                              fontSize: 11, fontWeight: FontWeight.w400,
                              letterSpacing: 1.2, color: context.appMutedFg(0.35),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  _avatarCtrl,
                ),
                const SizedBox(height: 28),

                // ── Options + sign out ──
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionHeader(title: 'My Account'),
                      const SizedBox(height: 14),
                      _OptionRow(icon: Icons.bookmark_outline_rounded, label: 'Saved Airports', onTap: () {}),
                      const SizedBox(height: 8),
                      _OptionRow(icon: Icons.star_outline_rounded, label: 'Favourite Restaurants', onTap: () {}),
                      const SizedBox(height: 8),
                      _OptionRow(icon: Icons.notifications_none_rounded, label: 'Notifications', onTap: () {}),
                      const SizedBox(height: 28),
                      _SectionHeader(title: 'Session'),
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => AuthService.signOut(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.red.shade400,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            side: BorderSide(color: Colors.red.withValues(alpha: 0.30)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                          ),
                          child: Text(
                            'SIGN OUT',
                            style: GoogleFonts.jost(
                              fontSize: 11, fontWeight: FontWeight.w400,
                              letterSpacing: 2.2, color: Colors.red.shade400,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  _sectionsCtrl,
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
}

// ─────────────────────────────────────────────────────────────
//  GUEST SCREEN
// ─────────────────────────────────────────────────────────────
class _GuestScreen extends StatefulWidget {
  const _GuestScreen();

  @override
  State<_GuestScreen> createState() => _GuestScreenState();
}

class _GuestScreenState extends State<_GuestScreen> with TickerProviderStateMixin {
  late final AnimationController _headerCtrl;
  late final AnimationController _avatarCtrl;
  late final AnimationController _cardsCtrl;

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl = AnimationController(vsync: this, duration: dur);
    _avatarCtrl = AnimationController(vsync: this, duration: dur);
    _cardsCtrl  = AnimationController(vsync: this, duration: dur);

    _delayed(150, _headerCtrl);
    _delayed(300, _avatarCtrl);
    _delayed(450, _cardsCtrl);
  }

  @override
  void dispose() {
    _headerCtrl.dispose();
    _avatarCtrl.dispose();
    _cardsCtrl.dispose();
    super.dispose();
  }

  Widget _fadeUp(Widget child, AnimationController ctrl) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
            .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          const _Background(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
              children: [
                // ── Header ──
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Account',
                        style: GoogleFonts.cormorant(
                          fontSize: 36, fontWeight: FontWeight.w600,
                          letterSpacing: 0.3, color: context.appOnSurface,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        'Sign in to save your favourites',
                        style: GoogleFonts.jost(
                          fontSize: 12, fontWeight: FontWeight.w400,
                          letterSpacing: 2.0, color: context.appMutedFg(0.44),
                        ),
                      ),
                      const SizedBox(height: 14),
                      _rule(context),
                    ],
                  ),
                  _headerCtrl,
                ),
                const SizedBox(height: 28),

                // ── Avatar + identity ──
                _fadeUp(
                  Column(
                    children: [
                      Center(
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 88, height: 88,
                              decoration: BoxDecoration(
                                color: kTeal.withValues(alpha: 0.10),
                                shape: BoxShape.circle,
                                border: Border.all(color: kGoldLight.withValues(alpha: 0.35), width: 1),
                              ),
                              child: Icon(Icons.person_outline_rounded, size: 40, color: kTeal.withValues(alpha: 0.70)),
                            ),
                            Positioned(
                              bottom: 0, right: 0,
                              child: Container(
                                width: 26, height: 26,
                                decoration: BoxDecoration(
                                  color: kTeal, shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: const Icon(Icons.add, size: 14, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Center(
                        child: Text(
                          'Guest',
                          style: GoogleFonts.cormorant(
                            fontSize: 26, fontWeight: FontWeight.w400,
                            color: context.appOnSurface, letterSpacing: 0.2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Center(
                        child: Text(
                          'Not signed in',
                          style: GoogleFonts.jost(
                            fontSize: 12, fontWeight: FontWeight.w400,
                            letterSpacing: 1.6, color: context.appMutedFg(0.42),
                          ),
                        ),
                      ),
                    ],
                  ),
                  _avatarCtrl,
                ),
                const SizedBox(height: 28),

                // ── Sign-in card + benefits ──
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                        decoration: BoxDecoration(
                          color: appCardSurface(context),
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
                          boxShadow: [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 2,
                              margin: const EdgeInsets.only(bottom: 16),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(colors: [kTeal.withValues(alpha: 0.5), Colors.transparent]),
                                borderRadius: BorderRadius.circular(1),
                              ),
                            ),
                            Text('Join Concourse', style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w500, color: context.appOnSurface, letterSpacing: 0.2)),
                            const SizedBox(height: 6),
                            Text(
                              'Save favourite airports, bookmark restaurants, and get personalised dining recommendations.',
                              style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w400, color: context.appMutedFg(0.58), height: 1.6),
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: () => context.push('/signup'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: kTeal, foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                                  elevation: 0,
                                ),
                                child: Text('CREATE ACCOUNT', style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 2.2)),
                              ),
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton(
                                onPressed: () => context.push('/login'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: context.appOnSurface,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  side: BorderSide(color: kGoldLight.withValues(alpha: 0.50)),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
                                ),
                                child: Text(
                                  'LOG IN',
                                  style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 2.2, color: context.appOnSurface.withValues(alpha: 0.70)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),
                      _SectionHeader(title: 'Benefits'),
                      const SizedBox(height: 14),
                      const _BenefitRow(icon: Icons.bookmark_outline_rounded, title: 'Save Favourites', subtitle: 'Bookmark airports and restaurants for quick access'),
                      const SizedBox(height: 10),
                      const _BenefitRow(icon: Icons.notifications_none_rounded, title: 'Flight Alerts', subtitle: 'Get notified when dining options change at your airport'),
                      const SizedBox(height: 10),
                      const _BenefitRow(icon: Icons.star_outline_rounded, title: 'Personalised Picks', subtitle: 'Recommendations based on your preferences'),
                    ],
                  ),
                  _cardsCtrl,
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
}

// ─────────────────────────────────────────────────────────────
//  OPTION ROW  (signed-in menu items)
// ─────────────────────────────────────────────────────────────
class _OptionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _OptionRow({required this.icon, required this.label, required this.onTap});

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
              width: 36, height: 36,
              decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(3)),
              child: Icon(icon, color: kTeal, size: 17),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface))),
            Icon(Icons.chevron_right_rounded, size: 16, color: context.appMutedFg(0.35)),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  BENEFIT ROW
// ─────────────────────────────────────────────────────────────
class _BenefitRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _BenefitRow({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
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
            width: 38, height: 38,
            decoration: BoxDecoration(color: kTeal.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(3)),
            child: Icon(icon, color: kTeal, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: context.appOnSurface)),
                const SizedBox(height: 2),
                Text(subtitle, style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w400, color: context.appOnSurface, letterSpacing: 0.2)),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(gradient: LinearGradient(colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent])),
          ),
        ),
        const SizedBox(width: 6),
        Transform.rotate(angle: math.pi / 4, child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6))),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  const _Background();
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: appPageGradientColors(context),
          stops: const [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

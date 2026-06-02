import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import '../preferences.dart';
import '../services/admin_service.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> with TickerProviderStateMixin {
  late final AnimationController _headerCtrl;
  late final AnimationController _prefsCtrl;
  late final AnimationController _aboutCtrl;
  bool _isAdmin = false;

  static const _languages = [
    'English (UK)',
    'English (US)',
    'Français',
    'Deutsch',
    'Español',
    'العربية',
    '日本語',
  ];

  static const _currencies = [
    'GBP — British Pound',
    'USD — US Dollar',
    'EUR — Euro',
    'AED — UAE Dirham',
    'THB — Thai Baht',
    'SGD — Singapore Dollar',
    'JPY — Japanese Yen',
  ];

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl = AnimationController(vsync: this, duration: dur);
    _prefsCtrl  = AnimationController(vsync: this, duration: dur);
    _aboutCtrl  = AnimationController(vsync: this, duration: dur);

    _delayed(150, _headerCtrl);
    _delayed(300, _prefsCtrl);
    _delayed(450, _aboutCtrl);

    AdminService.checkIsAdmin().then((v) {
      if (mounted) setState(() => _isAdmin = v);
    });
  }

  @override
  void dispose() {
    _headerCtrl.dispose();
    _prefsCtrl.dispose();
    _aboutCtrl.dispose();
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

  void _showPicker(BuildContext context, List<String> options, String current, void Function(String) onSelect) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? kDarkSurface : Colors.white;
    final textColor = isDark ? Colors.white : kInk;

    showModalBottomSheet(
      context: context,
      backgroundColor: bgColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36, height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            decoration: BoxDecoration(
              color: kGoldLight.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          ...options.map((option) {
            final isSelected = option == current;
            return InkWell(
              onTap: () {
                onSelect(option);
                Navigator.pop(context);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: kGoldLight.withValues(alpha: 0.12))),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        option,
                        style: GoogleFonts.jost(
                          fontSize: 14,
                          fontWeight: isSelected ? FontWeight.w500 : FontWeight.w300,
                          color: isSelected ? kTeal : textColor.withValues(alpha: 0.80),
                        ),
                      ),
                    ),
                    if (isSelected)
                      const Icon(Icons.check_rounded, color: kTeal, size: 16),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppPreferences.instance,
      builder: (context, _) {
        final prefs = AppPreferences.instance;
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final textColor = isDark ? Colors.white : kInk;

        return Scaffold(
          backgroundColor: isDark ? kDarkPage : kPage,
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
                            'More',
                            style: GoogleFonts.cormorant(
                              fontSize: 36,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.3,
                              color: textColor,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            'Settings & information',
                            style: GoogleFonts.jost(
                              fontSize: 12,
                              fontWeight: FontWeight.w400,
                              letterSpacing: 2.0,
                              color: context.appMutedFg(0.44),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _rule(isDark),
                        ],
                      ),
                      _headerCtrl,
                    ),
                    const SizedBox(height: 24),

                    // ── Preferences ──
                    _fadeUp(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SectionHeader(title: 'Preferences', isDark: isDark),
                          const SizedBox(height: 14),
                          _MoreCard(
                            icon: Icons.language_rounded,
                            title: 'Language',
                            subtitle: prefs.language,
                            isDark: isDark,
                            trailing: GestureDetector(
                              onTap: () => _showPicker(context, _languages, prefs.language, prefs.setLanguage),
                              child: Text(
                                'Change',
                                style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w500, color: kTeal, letterSpacing: 0.5),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.currency_pound_rounded,
                            title: 'Currency',
                            subtitle: prefs.currency,
                            isDark: isDark,
                            trailing: GestureDetector(
                              onTap: () => _showPicker(context, _currencies, prefs.currency, prefs.setCurrency),
                              child: Text(
                                'Change',
                                style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w500, color: kTeal, letterSpacing: 0.5),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.dark_mode_outlined,
                            title: 'Dark Mode',
                            subtitle: prefs.darkMode ? 'On' : 'Off',
                            isDark: isDark,
                            trailing: Switch(
                              value: prefs.darkMode,
                              onChanged: prefs.setDarkMode,
                              activeThumbColor: kTeal,
                              activeTrackColor: kTeal.withValues(alpha: 0.35),
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.notifications_none_rounded,
                            title: 'Notifications',
                            subtitle: 'Manage alerts and updates',
                            isDark: isDark,
                            trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                          ),
                        ],
                      ),
                      _prefsCtrl,
                    ),
                    const SizedBox(height: 24),

                    // ── About ──
                    _fadeUp(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SectionHeader(title: 'About', isDark: isDark),
                          const SizedBox(height: 14),
                          _MoreCard(
                            icon: Icons.info_outline_rounded,
                            title: 'About Concourse',
                            subtitle: 'Version 1.0.0',
                            isDark: isDark,
                            trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.shield_outlined,
                            title: 'Privacy Policy',
                            subtitle: 'How we use your data',
                            isDark: isDark,
                            trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.description_outlined,
                            title: 'Terms of Service',
                            subtitle: 'Usage terms and conditions',
                            isDark: isDark,
                            trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                          ),
                          const SizedBox(height: 10),
                          _MoreCard(
                            icon: Icons.mail_outline_rounded,
                            title: 'Contact Us',
                            subtitle: 'Get in touch with our team',
                            isDark: isDark,
                            trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                          ),
                          const SizedBox(height: 28),

                          // ── Admin ──
                          if (_isAdmin) ...[
                            _SectionHeader(title: 'Admin', isDark: isDark),
                            const SizedBox(height: 14),
                            _MoreCard(
                              icon: Icons.admin_panel_settings_outlined,
                              title: 'Admin Panel',
                              subtitle: 'Manage airports & restaurants',
                              isDark: isDark,
                              onTap: () => context.go('/admin'),
                              trailing: Icon(Icons.chevron_right_rounded, size: 18, color: textColor.withValues(alpha: 0.35)),
                            ),
                            const SizedBox(height: 28),
                          ],

                          Center(
                            child: Column(
                              children: [
                                Text(
                                  'concourse',
                                  style: GoogleFonts.cormorant(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 2.0,
                                    color: textColor.withValues(alpha: 0.34),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'airport dining guide',
                                  style: GoogleFonts.jost(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w400,
                                    letterSpacing: 2.6,
                                    color: textColor.withValues(alpha: 0.32),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      _aboutCtrl,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _rule(bool isDark) {
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            kGoldLight.withValues(alpha: isDark ? 0.18 : 0.28),
            kInk.withValues(alpha: isDark ? 0.20 : 0.08),
            Colors.transparent,
          ],
          stops: const [0.0, 0.3, 0.7, 1.0],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  MORE CARD
// ─────────────────────────────────────────────────────────────
class _MoreCard extends StatefulWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget trailing;
  final bool isDark;
  final VoidCallback? onTap;

  const _MoreCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.isDark,
    this.onTap,
  });

  @override
  State<_MoreCard> createState() => _MoreCardState();
}

class _MoreCardState extends State<_MoreCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final cardColor = widget.isDark ? kDarkCard : Colors.white;
    final textColor = widget.isDark ? Colors.white : kInk;

    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.99 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: cardColor,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withValues(alpha: widget.isDark ? 0.15 : 0.28)),
            boxShadow: _pressed
                ? []
                : [BoxShadow(color: kInk.withValues(alpha: widget.isDark ? 0.12 : 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: kTeal.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Icon(widget.icon, color: kTeal, size: 18),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w400, color: textColor),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.subtitle,
                      style: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: context.appMutedFg(0.44)),
                    ),
                  ],
                ),
              ),
              widget.trailing,
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  final bool isDark;
  const _SectionHeader({required this.title, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final textColor = isDark ? Colors.white : kInk;
    return Row(
      children: [
        Text(
          title,
          style: GoogleFonts.cormorant(fontSize: 22, fontWeight: FontWeight.w400, color: textColor, letterSpacing: 0.2),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [kGoldLight.withValues(alpha: isDark ? 0.18 : 0.28), Colors.transparent],
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Transform.rotate(
          angle: math.pi / 4,
          child: Container(width: 4, height: 4, color: kGoldLight.withValues(alpha: 0.6)),
        ),
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

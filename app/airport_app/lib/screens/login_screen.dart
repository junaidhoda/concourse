import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/admin_service.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  LOGIN SCREEN
// ─────────────────────────────────────────────────────────────
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _isLoading = false;

  // Staggered entrance animations
  late final AnimationController _headerCtrl;
  late final AnimationController _formCtrl;
  late final AnimationController _dividerCtrl;
  late final AnimationController _socialCtrl;
  late final AnimationController _footerCtrl;
  late final AnimationController _ruleCtrl;

  void _delayed(int ms, AnimationController c) => Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl = AnimationController(vsync: this, duration: dur);
    _formCtrl = AnimationController(vsync: this, duration: dur);
    _dividerCtrl = AnimationController(vsync: this, duration: dur);
    _socialCtrl = AnimationController(vsync: this, duration: dur);
    _footerCtrl = AnimationController(vsync: this, duration: dur);
    _ruleCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));

    _delayed(100, _headerCtrl);
    _delayed(200, _ruleCtrl);
    _delayed(300, _formCtrl);
    _delayed(460, _dividerCtrl);
    _delayed(540, _socialCtrl);
    _delayed(620, _footerCtrl);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    for (final c in [_headerCtrl, _formCtrl, _dividerCtrl, _socialCtrl, _footerCtrl, _ruleCtrl]) {
      c.dispose();
    }
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

  // ─── Auth handlers ─────────────────────────────────────────
  Future<void> _signInWithEmail() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    try {
      if (_emailCtrl.text.trim().toLowerCase() == 'admin') {
        final success = AdminService.authenticateAdmin(_emailCtrl.text.trim(), _passwordCtrl.text);
        if (success && mounted) context.go('/admin/dashboard');
        if (!success && mounted) _showError('Invalid admin credentials');
      } else {
        await AuthService.signInWithEmailAndPassword(
          email: _emailCtrl.text.trim(),
          password: _passwordCtrl.text,
        );
        if (mounted) context.go('/explore');
      }
    } catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() => _isLoading = true);
    try {
      final result = await AuthService.signInWithGoogle();
      if (result != null && mounted) context.go('/explore');
    } catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _resetPassword() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      _showWarning('Please enter your email address first');
      return;
    }
    try {
      await AuthService.resetPassword(email);
      if (mounted) _showSuccess('Password reset email sent! Check your inbox.');
    } catch (e) {
      if (mounted) _showError(e.toString());
    }
  }

  void _showError(String msg) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: const Color(0xFFB04040),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ),
      );

  void _showWarning(String msg) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: kGold,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ),
      );

  void _showSuccess(String msg) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: kTeal,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ),
      );

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          toolbarHeight: 44,
          leadingWidth: 44,
          leading: IconButton(
            iconSize: 18,
            padding: EdgeInsets.zero,
            icon: Icon(Icons.arrow_back_rounded, color: context.appOnSurface.withValues(alpha: 0.75)),
            onPressed: () => context.pop(),
          ),
          actions: [
            TextButton(
              onPressed: () => context.go('/explore'),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                minimumSize: const Size(0, 36),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'skip',
                style: GoogleFonts.jost(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 2.0,
                  color: kTeal.withOpacity(0.75),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(
              height: 1,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    kGoldLight.withOpacity(0.20),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),
        ),
        body: Stack(
          children: [
            _Background(),
            SafeArea(
              top: false,
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _fadeUp(_Header(ruleCtrl: _ruleCtrl), _headerCtrl),
                          const SizedBox(height: 28),
                          _fadeUp(
                            Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _PremiumField(
                                    controller: _emailCtrl,
                                    label: 'EMAIL ADDRESS',
                                    hint: 'you@example.com',
                                    keyboardType: TextInputType.emailAddress,
                                    prefixIcon: Icons.mail_outline_rounded,
                                    enabled: !_isLoading,
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please enter your email';
                                      if (v.toLowerCase() == 'admin') return null;
                                      if (!RegExp(r'^[\\w\\-.]+@([\\w-]+\\.)+[\\w-]{2,4}\$').hasMatch(v)) {
                                        return 'Please enter a valid email';
                                      }
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 14),
                                  _PremiumField(
                                    controller: _passwordCtrl,
                                    label: 'PASSWORD',
                                    hint: 'Enter your password',
                                    obscureText: _obscurePassword,
                                    prefixIcon: Icons.lock_outline_rounded,
                                    enabled: !_isLoading,
                                    suffixIcon: _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    onSuffixTap: _isLoading ? null : () => setState(() => _obscurePassword = !_obscurePassword),
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please enter your password';
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 8),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: GestureDetector(
                                      onTap: _isLoading ? null : () => context.push('/forgot-password'),
                                      child: Text(
                                        'Forgot password?',
                                        style: GoogleFonts.jost(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w400,
                                          color: kTeal.withOpacity(0.85),
                                          letterSpacing: 0.3,
                                          decoration: TextDecoration.underline,
                                          decorationColor: kTeal.withOpacity(0.35),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 24),
                                  _TealButton(
                                    label: 'Sign in',
                                    isLoading: _isLoading,
                                    onTap: _isLoading ? null : _signInWithEmail,
                                  ),
                                ],
                              ),
                            ),
                            _formCtrl,
                          ),
                          const SizedBox(height: 28),
                          _fadeUp(const _Flourish(), _dividerCtrl),
                          const SizedBox(height: 24),
                          _fadeUp(
                            Column(
                              children: [
                                _SocialButton(
                                  label: 'Continue with Google',
                                  icon: Icons.g_mobiledata_rounded,
                                  backgroundColor: appCardSurface(context),
                                  foregroundColor: context.appOnSurface,
                                  hasBorder: true,
                                  isLoading: _isLoading,
                                  onTap: _isLoading ? null : _signInWithGoogle,
                                ),
                              ],
                            ),
                            _socialCtrl,
                          ),
                          const SizedBox(height: 28),
                          _fadeUp(
                            Center(
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    "Don't have an account?  ",
                                    style: GoogleFonts.jost(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w400,
                                      color: context.appMutedFg(0.45),
                                    ),
                                  ),
                                  GestureDetector(
                                    onTap: () => context.push('/signup'),
                                    child: Text(
                                      'Create account',
                                      style: GoogleFonts.jost(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w400,
                                        color: kTeal,
                                        decoration: TextDecoration.underline,
                                        decorationColor: kTeal.withOpacity(0.4),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            _footerCtrl,
                          ),
                        ],
                      ),
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
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
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

// ─────────────────────────────────────────────────────────────
//  HEADER
// ─────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final AnimationController ruleCtrl;
  const _Header({required this.ruleCtrl});
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Column(
              children: [
                Text(
                  'concourse',
                  style: GoogleFonts.cormorant(
                    fontSize: 36,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 2.2,
                    color: context.appOnSurface.withValues(alpha: 0.80),
                  ),
                ),
                const SizedBox(height: 0),
                Text(
                  'airport dining guide',
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.lerp(FontWeight.w400, FontWeight.w500, 0.5),
                    letterSpacing: 4.0,
                    color: kTeal.withOpacity(0.75),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          AnimatedBuilder(
            animation: ruleCtrl,
            builder: (_, __) => Transform.scale(
              scaleX: ruleCtrl.value,
              child: Container(
                height: 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      kGoldLight.withOpacity(0.28),
                      context.appOnSurface.withValues(alpha: 0.08),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.3, 0.7, 1.0],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Welcome back',
            style: GoogleFonts.cormorant(
              fontSize: 28,
              fontWeight: FontWeight.w400,
              color: context.appOnSurface,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Sign in to continue your journey.',
            style: GoogleFonts.jost(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              color: context.appMutedFg(0.45),
              height: 1.6,
              letterSpacing: 0.2,
            ),
          ),
        ],
      );
}

// ─────────────────────────────────────────────────────────────
//  PREMIUM TEXT FIELD
// ─────────────────────────────────────────────────────────────
class _PremiumField extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType keyboardType;
  final bool obscureText;
  final IconData prefixIcon;
  final IconData? suffixIcon;
  final VoidCallback? onSuffixTap;
  final String? Function(String?)? validator;
  final bool enabled;

  const _PremiumField({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType = TextInputType.text,
    this.obscureText = false,
    required this.prefixIcon,
    this.suffixIcon,
    this.onSuffixTap,
    this.validator,
    this.enabled = true,
  });

  @override
  State<_PremiumField> createState() => _PremiumFieldState();
}

class _PremiumFieldState extends State<_PremiumField> {
  final _focus = FocusNode();
  bool _focused = false;
  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() => _focused = _focus.hasFocus));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.label.toUpperCase(),
            style: GoogleFonts.jost(
              fontSize: 10,
              fontWeight: FontWeight.w400,
              letterSpacing: 2.0,
              color: _focused ? kTeal : context.appMutedFg(0.45),
            ),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: widget.controller,
            focusNode: _focus,
            keyboardType: widget.keyboardType,
            obscureText: widget.obscureText,
            validator: widget.validator,
            enabled: widget.enabled,
            style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface),
            decoration: InputDecoration(
              hintText: widget.hint,
              hintStyle: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: context.appMutedFg(0.38),
              ),
              errorStyle: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: Colors.red.shade400),
              prefixIcon: Icon(widget.prefixIcon, size: 16, color: _focused ? kTeal : context.appMutedFg(0.42)),
              suffixIcon: widget.suffixIcon != null
                  ? GestureDetector(
                      onTap: widget.onSuffixTap,
                      child: Icon(widget.suffixIcon, size: 16, color: context.appMutedFg(0.42)),
                    )
                  : null,
              filled: true,
              fillColor: appInputFill(context),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(3),
                borderSide: BorderSide(color: kGoldLight.withOpacity(0.28)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(3),
                borderSide: const BorderSide(color: kTeal, width: 1),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(3),
                borderSide: BorderSide(color: kGoldLight.withOpacity(0.18)),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(3),
                borderSide: BorderSide(color: Colors.red.shade300),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(3),
                borderSide: BorderSide(color: Colors.red.shade400),
              ),
            ),
          ),
        ],
      );
}

// ─────────────────────────────────────────────────────────────
//  TEAL BUTTON  (with loading state)
// ─────────────────────────────────────────────────────────────
class _TealButton extends StatefulWidget {
  final String label;
  final bool isLoading;
  final VoidCallback? onTap;
  const _TealButton({required this.label, this.isLoading = false, this.onTap});
  @override
  State<_TealButton> createState() => _TealButtonState();
}

class _TealButtonState extends State<_TealButton> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: widget.onTap,
        onTapDown: widget.onTap == null ? null : (_) => setState(() => _pressed = true),
        onTapUp: widget.onTap == null ? null : (_) => setState(() => _pressed = false),
        onTapCancel: widget.onTap == null ? null : () => setState(() => _pressed = false),
        child: AnimatedScale(
          scale: _pressed ? 0.988 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: double.infinity,
            height: 52,
            decoration: BoxDecoration(
              color: widget.isLoading ? kTeal.withOpacity(0.7) : kTeal,
              borderRadius: BorderRadius.circular(3),
              boxShadow: [BoxShadow(color: kTeal.withOpacity(0.25), blurRadius: 20, offset: const Offset(0, 4))],
            ),
            child: Center(
              child: widget.isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.5,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Text(
                      widget.label.toUpperCase(),
                      style: GoogleFonts.jost(
                        fontSize: 11,
                        fontWeight: FontWeight.w400,
                        letterSpacing: 2.2,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ),
      );
}

// ─────────────────────────────────────────────────────────────
//  FLOURISH DIVIDER
// ─────────────────────────────────────────────────────────────
class _Flourish extends StatelessWidget {
  const _Flourish();
  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Container(
              height: 1,
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Colors.transparent, Color(0x40C9A96E)]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              children: [
                _dia(3, 0.35),
                const SizedBox(width: 5),
                _dia(4, 0.65),
                const SizedBox(width: 5),
                _dia(3, 0.35),
              ],
            ),
          ),
          Expanded(
            child: Container(
              height: 1,
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0x40C9A96E), Colors.transparent]),
              ),
            ),
          ),
        ],
      );

  Widget _dia(double size, double op) => Transform.rotate(
        angle: math.pi / 4,
        child: Container(width: size, height: size, color: kGoldLight.withOpacity(op)),
      );
}

// ─────────────────────────────────────────────────────────────
//  SOCIAL BUTTON
// ─────────────────────────────────────────────────────────────
class _SocialButton extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final bool hasBorder;
  final bool isLoading;
  final VoidCallback? onTap;
  const _SocialButton({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    this.hasBorder = false,
    this.isLoading = false,
    this.onTap,
  });
  @override
  State<_SocialButton> createState() => _SocialButtonState();
}

class _SocialButtonState extends State<_SocialButton> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: widget.onTap,
        onTapDown: widget.onTap == null ? null : (_) => setState(() => _pressed = true),
        onTapUp: widget.onTap == null ? null : (_) => setState(() => _pressed = false),
        onTapCancel: widget.onTap == null ? null : () => setState(() => _pressed = false),
        child: AnimatedScale(
          scale: _pressed ? 0.988 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: double.infinity,
            height: 48,
            decoration: BoxDecoration(
              color: widget.backgroundColor,
              borderRadius: BorderRadius.circular(3),
              border: widget.hasBorder ? Border.all(color: kGoldLight.withOpacity(0.28)) : null,
              boxShadow: widget.hasBorder ? [BoxShadow(color: context.appOnSurface.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))] : [],
            ),
            child: Center(
              child: widget.isLoading
                  ? SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.5,
                        valueColor: AlwaysStoppedAnimation(widget.foregroundColor),
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(widget.icon, size: 18, color: widget.foregroundColor),
                        const SizedBox(width: 10),
                        Text(
                          widget.label,
                          style: GoogleFonts.jost(
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                            letterSpacing: 0.4,
                            color: widget.foregroundColor,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      );
}
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/auth_service.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  CREATE ACCOUNT SCREEN
// ─────────────────────────────────────────────────────────────
class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});
  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _isSubmitting = false;

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
    _delayed(480, _dividerCtrl);
    _delayed(560, _socialCtrl);
    _delayed(640, _footerCtrl);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    for (final c in [
      _headerCtrl,
      _formCtrl,
      _dividerCtrl,
      _socialCtrl,
      _footerCtrl,
      _ruleCtrl,
    ]) {
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

  SnackBar _snackBar(String msg, {Color? bg}) => SnackBar(
        content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
        backgroundColor: bg ?? kTeal,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      );

  Future<void> _handleCreateAccount() async {
    if (_isSubmitting) return;
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    setState(() => _isSubmitting = true);
    try {
      await AuthService.signUpWithEmailAndPassword(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (!mounted) return;
      context.go('/explore');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        _snackBar(e.toString(), bg: Colors.red.shade400),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _handleGoogle() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      final cred = await AuthService.signInWithGoogle();
      if (!mounted) return;
      if (cred == null) return;
      context.go('/explore');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        _snackBar(e.toString(), bg: Colors.red.shade400),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: kPage,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          toolbarHeight: 44,
          leadingWidth: 44,
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
          leading: IconButton(
            iconSize: 18,
            padding: EdgeInsets.zero,
            icon: Icon(Icons.arrow_back_rounded, color: kInk.withOpacity(0.75)),
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
                  fontSize: 10.5,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 2.0,
                  color: kTeal.withOpacity(0.75),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: Stack(
          children: [
            const _Background(),
            SafeArea(
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Transform.translate(
                            offset: const Offset(0, -5),
                            child: _fadeUp(_Header(ruleCtrl: _ruleCtrl), _headerCtrl),
                          ),
                          const SizedBox(height: 28),
                          _fadeUp(
                            Form(
                              key: _formKey,
                              child: Column(
                                children: [
                                  _PremiumField(
                                    controller: _emailCtrl,
                                    label: 'EMAIL ADDRESS',
                                    hint: 'you@example.com',
                                    keyboardType: TextInputType.emailAddress,
                                    prefixIcon: Icons.mail_outline_rounded,
                                    enabled: !_isSubmitting,
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please enter your email';
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
                                    hint: '6+ characters',
                                    obscureText: _obscurePassword,
                                    prefixIcon: Icons.lock_outline_rounded,
                                    suffixIcon: _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    onSuffixTap: _isSubmitting ? null : () => setState(() => _obscurePassword = !_obscurePassword),
                                    enabled: !_isSubmitting,
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please enter a password';
                                      if (v.length < 6) return 'Password must be at least 6 characters';
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 14),
                                  _PremiumField(
                                    controller: _confirmCtrl,
                                    label: 'CONFIRM PASSWORD',
                                    hint: 'Repeat your password',
                                    obscureText: _obscureConfirm,
                                    prefixIcon: Icons.lock_outline_rounded,
                                    suffixIcon: _obscureConfirm ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    onSuffixTap: _isSubmitting ? null : () => setState(() => _obscureConfirm = !_obscureConfirm),
                                    enabled: !_isSubmitting,
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please confirm your password';
                                      if (v != _passwordCtrl.text) return 'Passwords do not match';
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 24),
                                  _TealButton(
                                    label: 'Create account',
                                    isLoading: _isSubmitting,
                                    onTap: _handleCreateAccount,
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
                                  backgroundColor: Colors.white,
                                  foregroundColor: kInk,
                                  hasBorder: true,
                                  onTap: _handleGoogle,
                                ),
                                const SizedBox(height: 10),
                                _SocialButton(
                                  label: 'Continue with Apple',
                                  icon: Icons.apple_rounded,
                                  backgroundColor: kInk,
                                  foregroundColor: Colors.white,
                                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                                    _snackBar('Apple sign in requires an Apple Developer account.'),
                                  ),
                                ),
                                const SizedBox(height: 10),
                                _SocialButton(
                                  label: 'Continue with Email',
                                  icon: Icons.mail_outline_rounded,
                                  backgroundColor: kTeal,
                                  foregroundColor: Colors.white,
                                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                                    _snackBar('You’re already signing up with email above.'),
                                  ),
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
                                    'Already have an account?  ',
                                    style: GoogleFonts.jost(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w300,
                                      color: kInk.withOpacity(0.45),
                                    ),
                                  ),
                                  GestureDetector(
                                    onTap: () => context.push('/login'),
                                    child: Text(
                                      'Sign in',
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
  const _Background();
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFDFBF6), Color(0xFFF8F5EE), Color(0xFFF2EDE3)],
          stops: [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  HEADER  (wordmark + rule + title + subtitle)
// ─────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final AnimationController ruleCtrl;
  const _Header({required this.ruleCtrl});

  @override
  Widget build(BuildContext context) {
    return Column(
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
                  color: kInk.withOpacity(0.80),
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
        const SizedBox(height: 10),
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
                    kInk.withOpacity(0.08),
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
          'Create account',
          style: GoogleFonts.cormorant(
            fontSize: 28,
            fontWeight: FontWeight.w300,
            color: kInk,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Save favourite airports and get\npersonalised dining recommendations.',
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: FontWeight.w300,
            color: kInk.withOpacity(0.45),
            height: 1.6,
            letterSpacing: 0.2,
          ),
        ),
      ],
    );
  }
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
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label.toUpperCase(),
          style: GoogleFonts.jost(
            fontSize: 9,
            fontWeight: FontWeight.w300,
            letterSpacing: 2.0,
            color: _focused ? kTeal : kInk.withOpacity(0.45),
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
          style: GoogleFonts.jost(
            fontSize: 14,
            fontWeight: FontWeight.w300,
            color: kInk,
          ),
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: GoogleFonts.jost(
              fontSize: 14,
              fontWeight: FontWeight.w300,
              color: kInk.withOpacity(0.30),
            ),
            errorStyle: GoogleFonts.jost(
              fontSize: 11,
              fontWeight: FontWeight.w300,
              color: Colors.red.shade400,
            ),
            prefixIcon: Icon(
              widget.prefixIcon,
              size: 16,
              color: _focused ? kTeal : kInk.withOpacity(0.35),
            ),
            suffixIcon: widget.suffixIcon != null
                ? GestureDetector(
                    onTap: widget.onSuffixTap,
                    child: Icon(widget.suffixIcon, size: 16, color: kInk.withOpacity(0.35)),
                  )
                : null,
            filled: true,
            fillColor: Colors.white,
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
              borderSide: BorderSide(color: Colors.red.shade300, width: 1),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(3),
              borderSide: BorderSide(color: Colors.red.shade400, width: 1),
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  TEAL PRIMARY BUTTON
// ─────────────────────────────────────────────────────────────
class _TealButton extends StatefulWidget {
  final String label;
  final Future<void> Function() onTap;
  final bool isLoading;
  const _TealButton({required this.label, required this.onTap, this.isLoading = false});
  @override
  State<_TealButton> createState() => _TealButtonState();
}

class _TealButtonState extends State<_TealButton> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) {
    final disabled = widget.isLoading;
    return GestureDetector(
      onTap: disabled ? null : widget.onTap,
      onTapDown: disabled ? null : (_) => setState(() => _pressed = true),
      onTapUp: disabled ? null : (_) => setState(() => _pressed = false),
      onTapCancel: disabled ? null : () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.988 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: Container(
          width: double.infinity,
          height: 52,
          decoration: BoxDecoration(
            color: disabled ? kTeal.withOpacity(0.6) : kTeal,
            borderRadius: BorderRadius.circular(3),
            boxShadow: [
              BoxShadow(color: kTeal.withOpacity(0.25), blurRadius: 20, offset: const Offset(0, 4)),
            ],
          ),
          child: Center(
            child: widget.isLoading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withOpacity(0.95)),
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
}

// ─────────────────────────────────────────────────────────────
//  FLOURISH DIVIDER
// ─────────────────────────────────────────────────────────────
class _Flourish extends StatelessWidget {
  const _Flourish();
  @override
  Widget build(BuildContext context) {
    return Row(
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
  }

  Widget _dia(double size, double op) => Transform.rotate(
        angle: math.pi / 4,
        child: Container(width: size, height: size, color: kGoldLight.withOpacity(op)),
      );
}

// ─────────────────────────────────────────────────────────────
//  SOCIAL SIGN-IN BUTTON
// ─────────────────────────────────────────────────────────────
class _SocialButton extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final bool hasBorder;
  final VoidCallback onTap;

  const _SocialButton({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    this.hasBorder = false,
    required this.onTap,
  });

  @override
  State<_SocialButton> createState() => _SocialButtonState();
}

class _SocialButtonState extends State<_SocialButton> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
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
            boxShadow: widget.hasBorder ? [BoxShadow(color: kInk.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))] : [],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(widget.icon, size: 18, color: widget.foregroundColor),
              const SizedBox(width: 10),
              Text(
                widget.label,
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w300,
                  letterSpacing: 0.4,
                  color: widget.foregroundColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
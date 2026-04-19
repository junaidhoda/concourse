import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/auth_service.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  FORGOT PASSWORD SCREEN
// ─────────────────────────────────────────────────────────────
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  bool _isLoading = false;
  bool _emailSent = false;

  // Staggered entrance animations
  late final AnimationController _headerCtrl;
  late final AnimationController _formCtrl;
  late final AnimationController _footerCtrl;
  late final AnimationController _ruleCtrl;

  // Success state animation
  late final AnimationController _successCtrl;

  void _delayed(int ms, AnimationController c) => Future.delayed(Duration(milliseconds: ms), () {
        if (mounted) c.forward();
      });

  @override
  void initState() {
    super.initState();
    const dur = Duration(milliseconds: 900);
    _headerCtrl = AnimationController(vsync: this, duration: dur);
    _formCtrl = AnimationController(vsync: this, duration: dur);
    _footerCtrl = AnimationController(vsync: this, duration: dur);
    _ruleCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    _successCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));

    _delayed(100, _headerCtrl);
    _delayed(200, _ruleCtrl);
    _delayed(300, _formCtrl);
    _delayed(460, _footerCtrl);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    for (final c in [_headerCtrl, _formCtrl, _footerCtrl, _ruleCtrl, _successCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  Widget _fadeUp(Widget child, AnimationController ctrl) => FadeTransition(
        opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
              .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
          child: child,
        ),
      );

  void _showError(String msg) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: const Color(0xFFB04040),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ),
      );

  Future<void> _sendReset() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    try {
      await AuthService.resetPassword(_emailCtrl.text.trim());
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _emailSent = true;
      });
      _successCtrl.forward();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      _showError(e.toString());
    }
  }

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
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
                child: _emailSent ? _buildSuccessState() : _buildFormState(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFormState() {
    return Column(
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
                  label: 'Email address',
                  hint: 'you@example.com',
                  keyboardType: TextInputType.emailAddress,
                  prefixIcon: Icons.mail_outline_rounded,
                  enabled: !_isLoading,
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Please enter your email';
                    if (!RegExp(r'^[\\w\\-.]+@([\\w-]+\\.)+[\\w-]{2,4}\$').hasMatch(v)) {
                      return 'Please enter a valid email';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 8),
                Text(
                  "We'll send a reset link to this address.",
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: context.appMutedFg(0.44),
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 24),
                _TealButton(
                  label: 'Send reset link',
                  isLoading: _isLoading,
                  onTap: _isLoading ? null : _sendReset,
                ),
              ],
            ),
          ),
          _formCtrl,
        ),
        const SizedBox(height: 40),
        _fadeUp(const _Flourish(), _footerCtrl),
        const SizedBox(height: 24),
        _fadeUp(
          Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Remember your password?  ',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: context.appMutedFg(0.45),
                  ),
                ),
                GestureDetector(
                  onTap: () => context.pop(),
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
    );
  }

  Widget _buildSuccessState() {
    return FadeTransition(
      opacity: CurvedAnimation(parent: _successCtrl, curve: Curves.easeOut),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
            .animate(CurvedAnimation(parent: _successCtrl, curve: Curves.easeOut)),
        child: Padding(
          padding: const EdgeInsets.only(top: 40),
          child: Column(
            children: [
              const _CheckCircle(),
              const SizedBox(height: 32),
              Text(
                'Check your inbox',
                style: GoogleFonts.cormorant(
                  fontSize: 26,
                  fontWeight: FontWeight.w400,
                  color: context.appOnSurface,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'We sent a reset link to\n${_emailCtrl.text.trim()}',
                textAlign: TextAlign.center,
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  color: context.appMutedFg(0.45),
                  height: 1.7,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 40),
              const _Flourish(),
              const SizedBox(height: 32),
              Text(
                "Didn't receive it?",
                style: GoogleFonts.jost(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: context.appMutedFg(0.44),
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => setState(() {
                  _emailSent = false;
                  _successCtrl.reset();
                }),
                child: Text(
                  'Try a different address',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: kTeal,
                    decoration: TextDecoration.underline,
                    decorationColor: kTeal.withOpacity(0.4),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              _TealButton(
                label: 'Back to sign in',
                onTap: () => context.pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  ANIMATED CHECK CIRCLE
// ─────────────────────────────────────────────────────────────
class _CheckCircle extends StatefulWidget {
  const _CheckCircle();
  @override
  State<_CheckCircle> createState() => _CheckCircleState();
}

class _CheckCircleState extends State<_CheckCircle> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _check;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _scale = CurvedAnimation(parent: _ctrl, curve: const Interval(0.0, 0.6, curve: Curves.elasticOut));
    _check = CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 1.0, curve: Curves.easeOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => Transform.scale(
        scale: _scale.value,
        child: Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: kTeal.withOpacity(0.08),
            border: Border.all(color: kTeal.withOpacity(0.30), width: 1),
          ),
          child: CustomPaint(painter: _CheckPainter(progress: _check.value)),
        ),
      ),
    );
  }
}

class _CheckPainter extends CustomPainter {
  final double progress;
  const _CheckPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = kTeal
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final cx = size.width / 2;
    final cy = size.height / 2;

    final p1 = Offset(cx - 10, cy);
    final p2 = Offset(cx - 3, cy + 7);
    final p3 = Offset(cx + 11, cy - 8);

    final totalLen = (p2 - p1).distance + (p3 - p2).distance;
    final drawn = progress * totalLen;
    final seg1Len = (p2 - p1).distance;

    if (drawn <= seg1Len) {
      final t = drawn / seg1Len;
      canvas.drawLine(p1, Offset.lerp(p1, p2, t)!, paint);
    } else {
      canvas.drawLine(p1, p2, paint);
      final t = (drawn - seg1Len) / (p3 - p2).distance;
      canvas.drawLine(p2, Offset.lerp(p2, p3, t.clamp(0, 1))!, paint);
    }
  }

  @override
  bool shouldRepaint(_CheckPainter old) => old.progress != progress;
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
            'Reset password',
            style: GoogleFonts.cormorant(
              fontSize: 28,
              fontWeight: FontWeight.w400,
              color: context.appOnSurface,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Enter the email associated with your account\nand we'll send you a reset link.",
            style: GoogleFonts.jost(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              color: context.appMutedFg(0.45),
              height: 1.65,
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
  final IconData prefixIcon;
  final String? Function(String?)? validator;
  final bool enabled;

  const _PremiumField({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType = TextInputType.text,
    required this.prefixIcon,
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
            validator: widget.validator,
            enabled: widget.enabled,
            style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appOnSurface),
            decoration: InputDecoration(
              hintText: widget.hint,
              hintStyle: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400, color: context.appMutedFg(0.38)),
              errorStyle: GoogleFonts.jost(fontSize: 12, fontWeight: FontWeight.w400, color: Colors.red.shade400),
              prefixIcon: Icon(widget.prefixIcon, size: 16, color: _focused ? kTeal : context.appMutedFg(0.42)),
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
//  TEAL BUTTON
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


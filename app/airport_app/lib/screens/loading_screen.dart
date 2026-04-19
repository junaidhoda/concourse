import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  ROUTE / RESTAURANT DATA
// ─────────────────────────────────────────────────────────────
class _Restaurant {
  final String terminal;
  final String cuisine;
  final bool open;
  const _Restaurant(this.terminal, this.cuisine, this.open);
}

const _restaurants = [
  _Restaurant('T5 · Heathrow',     'British Modern',  true),
  _Restaurant('T3 · Heathrow',     'Japanese Ramen',  true),
  _Restaurant('T1 · CDG',          'French Bistro',   false),
  _Restaurant('Concourse B · JFK', 'American Grill',  true),
  _Restaurant('T3 · DXB',          'Middle Eastern',  true),
  _Restaurant('T2 · SIN',          'Hawker Street',   true),
];

const _statusSteps = [
  (pct: 0.10, label: 'Scanning menus',         ms: 600),
  (pct: 0.26, label: 'Finding restaurants',    ms: 1600),
  (pct: 0.44, label: 'Checking opening hours', ms: 2700),
  (pct: 0.60, label: 'Loading cuisine types',  ms: 3700),
  (pct: 0.76, label: 'Sorting by terminal',    ms: 4800),
  (pct: 0.90, label: 'Almost ready',           ms: 5700),
  (pct: 1.00, label: 'Enjoy your meal',        ms: 6500),
];

// Network node positions in the 300×200 SVG viewport
const _hubPos    = Offset(150, 100);
const _coffeePos = Offset(42,  52);
const _clochePos = Offset(258, 52);
const _winePos   = Offset(52,  158);
const _forkPos   = Offset(248, 158);

// Quadratic bezier control points for each route
// Each route: (from, control, to)
const _routes = [
  (_hubPos, Offset(96,  70),  _coffeePos),  // hub → coffee
  (_hubPos, Offset(204, 70),  _clochePos),  // hub → cloche
  (_hubPos, Offset(100, 138), _winePos),    // hub → wine
  (_hubPos, Offset(200, 138), _forkPos),    // hub → fork
];

// Flight sequence: (routeIndex, delayMs, durationMs)
const _flights = [
  (0, 1400, 1400),
  (1, 2800, 1300),
  (2, 4000, 1400),
  (3, 5200, 1300),
];

// ─────────────────────────────────────────────────────────────
//  LOADING SCREEN
// ─────────────────────────────────────────────────────────────
class LoadingScreen extends StatefulWidget {
  final VoidCallback? onComplete;

  const LoadingScreen({super.key, this.onComplete});

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen>
    with TickerProviderStateMixin {

  // Wordmark fade-up
  late final AnimationController _wordmarkCtrl;

  // Network reveal
  late final AnimationController _hubCtrl;
  late final List<AnimationController> _nodeCtrl;   // 4 satellite nodes
  late final List<AnimationController> _routeCtrl;  // 4 route draw animations

  // Orbit rings (continuous rotation)
  late final AnimationController _orbit1Ctrl;
  late final AnimationController _orbit2Ctrl;

  // Plane flight
  late final AnimationController _planeCtrl;
  int _currentRoute = 0;
  bool _planeVisible = false;

  // Progress bar (smooth animation 0 → 1 over 6.5s)
  late final AnimationController _progressCtrl;
  late final AnimationController _smoothProgressCtrl;
  String _statusLabel = 'Scanning menus';

  // Finder strip cycling
  int _restaurantIndex = 0;
  double _finderOpacity = 1;

  // Open-dot pulse
  late final AnimationController _dotCtrl;

  // Finder fade-up
  late final AnimationController _finderCtrl;

  bool _hasCompleted = false;

  void _delayed(int ms, VoidCallback fn) =>
      Future.delayed(Duration(milliseconds: ms), () { if (mounted) fn(); });

  @override
  void initState() {
    super.initState();

    // ── Wordmark ──
    _wordmarkCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000))
      ..forward();

    // ── Hub ──
    _hubCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _delayed(800, _hubCtrl.forward);

    // ── Satellite nodes (4) ──
    _nodeCtrl = List.generate(4, (_) =>
        AnimationController(vsync: this, duration: const Duration(milliseconds: 500)));

    // ── Routes (4) ──
    _routeCtrl = List.generate(4, (_) =>
        AnimationController(vsync: this, duration: const Duration(milliseconds: 1000)));

    const nodeDelays = [1200, 1700, 2100, 2500];
    for (int i = 0; i < 4; i++) {
      _delayed(nodeDelays[i],          _routeCtrl[i].forward);
      _delayed(nodeDelays[i] + 700,    _nodeCtrl[i].forward);
    }

    // ── Orbits ──
    _orbit1Ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 12))
      ..repeat();
    _orbit2Ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 18))
      ..repeat();

    // ── Plane ──
    _planeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
    _scheduleFlight(0);

    // ── Progress bar ──
    _progressCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _smoothProgressCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 6500),
    )..forward();
    _runProgressSteps(0);

    // ── Open dot ──
    _dotCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);

    // ── Finder strip ──
    _finderCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _delayed(1000, _finderCtrl.forward);
    _startFinderCycling();
  }

  void _scheduleFlight(int idx) {
    if (!mounted) return;
    if (idx >= _flights.length) {
      _delayed(1400, () => _scheduleFlight(0));
      return;
    }
    final (routeIdx, delayMs, durMs) = _flights[idx];
    _delayed(idx == 0 ? delayMs : 300, () {
      if (!mounted) return;
      _planeCtrl.duration = Duration(milliseconds: durMs);
      _planeCtrl.reset();
      setState(() {
        _currentRoute = routeIdx;
        _planeVisible = false;
      });
      _planeCtrl.forward().then((_) {
        if (mounted) setState(() => _planeVisible = false);
        _scheduleFlight(idx + 1);
      });
      // Show plane slightly after start
      _delayed(50, () { if (mounted) setState(() => _planeVisible = true); });
    });
  }

  void _runProgressSteps(int base) {
    for (final step in _statusSteps) {
      _delayed(step.ms + base, () {
        if (!mounted) return;
        setState(() => _statusLabel = step.label);
        if (step.pct >= 1.0 && !_hasCompleted) {
          _hasCompleted = true;
          _delayed(2500, () => widget.onComplete?.call());
        }
      });
    }
    // Loop (only if we haven't completed yet)
    _delayed(8500 + base, () {
      if (!mounted) return;
      if (_hasCompleted) return;
      _smoothProgressCtrl.reset();
      _smoothProgressCtrl.forward();
      _runProgressSteps(base + 8500);
    });
  }

  void _startFinderCycling() {
    _delayed(2600, () {
      if (!mounted) return;
      setState(() => _finderOpacity = 0);
      _delayed(280, () {
        if (!mounted) return;
        setState(() {
          _restaurantIndex = (_restaurantIndex + 1) % _restaurants.length;
          _finderOpacity = 1;
        });
        _startFinderCycling();
      });
    });
  }

  @override
  void dispose() {
    _wordmarkCtrl.dispose();
    _hubCtrl.dispose();
    for (final c in _nodeCtrl)  { c.dispose(); }
    for (final c in _routeCtrl) { c.dispose(); }
    _orbit1Ctrl.dispose();
    _orbit2Ctrl.dispose();
    _planeCtrl.dispose();
    _progressCtrl.dispose();
    _smoothProgressCtrl.dispose();
    _dotCtrl.dispose();
    _finderCtrl.dispose();
    super.dispose();
  }

  // ─── BUILD ──────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            // Background gradient
            _Background(),
            // Gold inset frame
            const _GoldFrame(),
            // Main content
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 40),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Wordmark
                        _fadeUp(
                          ctrl: _wordmarkCtrl,
                          child: const _Wordmark(),
                        ),
                        const SizedBox(height: 42),

                        // Network animation
                        FadeTransition(
                          opacity: CurvedAnimation(
                            parent: _wordmarkCtrl,
                            curve: const Interval(0.4, 1.0, curve: Curves.easeIn),
                          ),
                          child: SizedBox(
                            width: 300, height: 200,
                            child: AnimatedBuilder(
                              animation: Listenable.merge([
                                _hubCtrl, _orbit1Ctrl, _orbit2Ctrl, _planeCtrl,
                                ..._nodeCtrl, ..._routeCtrl,
                              ]),
                              builder: (ctx, __) => CustomPaint(
                                painter: _NetworkPainter(
                                  surfaceColor: Theme.of(ctx).scaffoldBackgroundColor,
                                  onSurfaceColor: Theme.of(ctx).colorScheme.onSurface,
                                  hubOpacity:    _hubCtrl.value,
                                  nodeOpacities: _nodeCtrl.map((c) => c.value).toList(),
                                  routeProgress: _routeCtrl.map((c) => c.value).toList(),
                                  orbit1Angle:   _orbit1Ctrl.value * 2 * math.pi,
                                  orbit2Angle:   -_orbit2Ctrl.value * 2 * math.pi,
                                  planeT:        _planeCtrl.value,
                                  currentRoute:  _currentRoute,
                                  planeVisible:  _planeVisible,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 34),

                        // Status label
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 220),
                          child: Text(
                            _statusLabel,
                            key: ValueKey(_statusLabel),
                            style: GoogleFonts.jost(
                              fontSize: 11, fontWeight: FontWeight.w400,
                              letterSpacing: 2.2, color: context.appMutedFg(0.38),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),

                        // Progress bar (smooth animation)
                        AnimatedBuilder(
                          animation: _smoothProgressCtrl,
                          builder: (_, __) => _ProgressBar(progress: _smoothProgressCtrl.value),
                        ),
                        const SizedBox(height: 30),

                        // Flourish
                        const _Flourish(),
                        const SizedBox(height: 22),

                        // Finder strip
                        _fadeUp(
                          ctrl: _finderCtrl,
                          child: AnimatedOpacity(
                            opacity: _finderOpacity,
                            duration: const Duration(milliseconds: 280),
                            child: _FinderStrip(
                              restaurant: _restaurants[_restaurantIndex],
                              dotCtrl: _dotCtrl,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fadeUp({required AnimationController ctrl, required Widget child}) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOut),
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.05), end: Offset.zero)
            .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
        child: child,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
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

// ─────────────────────────────────────────────────────────────
//  GOLD INSET FRAME
// ─────────────────────────────────────────────────────────────
class _GoldFrame extends StatelessWidget {
  const _GoldFrame();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(38),
          border: Border.all(color: kGoldLight.withOpacity(0.28), width: 1),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CORNER ORNAMENTS
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  WORDMARK
// ─────────────────────────────────────────────────────────────
class _Wordmark extends StatelessWidget {
  const _Wordmark();
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'concourse',
          style: GoogleFonts.cormorant(
            fontSize: 44, fontWeight: FontWeight.w600,
            letterSpacing: 2.2, color: context.appOnSurface.withValues(alpha: 0.80),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'airport dining guide',
          style: GoogleFonts.jost(
            fontSize: 15, fontWeight: FontWeight.lerp(FontWeight.w400, FontWeight.w500, 0.5),
            letterSpacing: 4.0, color: kTeal.withOpacity(0.75),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  NETWORK PAINTER
// ─────────────────────────────────────────────────────────────
class _NetworkPainter extends CustomPainter {
  final Color surfaceColor;
  final Color onSurfaceColor;
  final double hubOpacity;
  final List<double> nodeOpacities;   // 4 values
  final List<double> routeProgress;   // 4 values 0→1
  final double orbit1Angle;
  final double orbit2Angle;
  final double planeT;
  final int currentRoute;
  final bool planeVisible;

  const _NetworkPainter({
    required this.surfaceColor,
    required this.onSurfaceColor,
    required this.hubOpacity,
    required this.nodeOpacities,
    required this.routeProgress,
    required this.orbit1Angle,
    required this.orbit2Angle,
    required this.planeT,
    required this.currentRoute,
    required this.planeVisible,
  });

  // Scale from 300×200 viewBox to actual canvas size
  Offset _s(Offset p, Size size) =>
      Offset(p.dx * size.width / 300, p.dy * size.height / 200);
  double _sx(double v, Size size) => v * size.width / 300;

  @override
  void paint(Canvas canvas, Size size) {
    // ── Orbit rings ──
    if (hubOpacity > 0) {
      final hub = _s(_hubPos, size);
      _drawOrbitRing(canvas, hub, _sx(38, size), orbit1Angle, kTeal.withOpacity(0.30 * hubOpacity), 0.6, [4,8]);
      _drawOrbitRing(canvas, hub, _sx(58, size), orbit2Angle, kGoldLight.withOpacity(0.25 * hubOpacity), 0.4, [2,10]);
    }

    // ── Route lines ──
    final routePaths = [
      (_hubPos, Offset(96, 70),  _coffeePos),
      (_hubPos, Offset(204, 70), _clochePos),
      (_hubPos, Offset(100, 138),_winePos),
      (_hubPos, Offset(200, 138),_forkPos),
    ];
    for (int i = 0; i < 4; i++) {
      if (routeProgress[i] > 0) {
        final (from, ctrl, to) = routePaths[i];
        _drawDashedQuadBezier(
          canvas, size,
          from, ctrl, to,
          routeProgress[i],
          Paint()
            ..color = kGoldLight.withOpacity(0.35)
            ..strokeWidth = 0.8
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round,
          3, 5,
        );
      }
    }

    // ── Satellite node glow backgrounds ──
    final nodePositions = [_coffeePos, _clochePos, _winePos, _forkPos];
    for (int i = 0; i < 4; i++) {
      final pos = _s(nodePositions[i], size);
      canvas.drawCircle(pos, _sx(16, size), Paint()..color = kGold.withOpacity(0.04 * nodeOpacities[i]));
    }

    // ── Hub node ──
    if (hubOpacity > 0) {
      final hub = _s(_hubPos, size);
      // Glow
      canvas.drawCircle(hub, _sx(24, size), Paint()..color = kTeal.withOpacity(0.05 * hubOpacity));
      canvas.drawCircle(hub, _sx(16, size), Paint()..color = kTeal.withOpacity(0.08 * hubOpacity));
      // Circle
      canvas.drawCircle(hub, _sx(18, size),
          Paint()..color = surfaceColor.withOpacity(hubOpacity)..style = PaintingStyle.fill);
      canvas.drawCircle(hub, _sx(18, size),
          Paint()..color = kTeal.withOpacity(hubOpacity)..strokeWidth = 1..style = PaintingStyle.stroke);
      canvas.drawCircle(hub, _sx(21, size),
          Paint()..color = kTeal.withOpacity(0.3 * hubOpacity)..strokeWidth = 0.4..style = PaintingStyle.stroke);
      // Centre dot
      canvas.drawCircle(hub, _sx(3.5, size), Paint()..color = kTeal.withOpacity(0.85 * hubOpacity));
      canvas.drawCircle(hub, _sx(6, size),
          Paint()..color = kTeal.withOpacity(0.3 * hubOpacity)..strokeWidth = 0.6..style = PaintingStyle.stroke);
    }

    // ── Satellite nodes ──
    final nodeIcons = [_paintCoffee, _paintCloche, _paintWine, _paintFork];
    for (int i = 0; i < 4; i++) {
      if (nodeOpacities[i] > 0) {
        final pos = _s(nodePositions[i], size);
        final r = _sx(13, size);
        final op = nodeOpacities[i];
        // Circle
        canvas.drawCircle(pos, r, Paint()..color = surfaceColor.withOpacity(op * 0.8));
        canvas.drawCircle(pos, r,
            Paint()..color = kGoldLight.withOpacity(0.8 * op)..strokeWidth = 0.8..style = PaintingStyle.stroke);
        // Icon
        canvas.save();
        canvas.translate(pos.dx, pos.dy);
        canvas.scale(size.width / 300);
        nodeIcons[i](canvas, op);
        canvas.restore();
        // Label
        _drawLabel(canvas, pos, _labelFor(i), op, size);
      }
    }

    // ── Travelling plane ──
    if (planeVisible && planeT > 0.05 && planeT < 0.95) {
      final (from, ctrl, to) = routePaths[currentRoute];
      final ease = _easeInOutCubic(planeT);
      final pos  = _quadBezierPoint(_s(from, size), _s(ctrl, size), _s(to, size), ease);
      final pos2 = _quadBezierPoint(_s(from, size), _s(ctrl, size), _s(to, size), math.min(ease + 0.01, 1.0));
      final angle = math.atan2(pos2.dy - pos.dy, pos2.dx - pos.dx);
      canvas.save();
      canvas.translate(pos.dx, pos.dy);
      canvas.rotate(angle);
      canvas.scale(size.width / 300);
      _paintPlane(canvas, 1.0);
      canvas.restore();
    }
  }

  // ── Quadratic bezier helpers ──
  Offset _quadBezierPoint(Offset p0, Offset p1, Offset p2, double t) {
    final mt = 1 - t;
    return Offset(
      mt*mt*p0.dx + 2*mt*t*p1.dx + t*t*p2.dx,
      mt*mt*p0.dy + 2*mt*t*p1.dy + t*t*p2.dy,
    );
  }

  double _easeInOutCubic(double t) =>
      t < 0.5 ? 4*t*t*t : 1 - math.pow(-2*t+2, 3)/2;

  void _drawDashedQuadBezier(
    Canvas canvas, Size size,
    Offset p0, Offset ctrl, Offset p2,
    double progress,
    Paint paint, double on, double off,
  ) {
    final sp0 = _s(p0, size), sc = _s(ctrl, size), sp2 = _s(p2, size);
    // Approximate length with 50 segments
    double totalLen = 0;
    Offset prev = sp0;
    const steps = 50;
    for (int i = 1; i <= steps; i++) {
      final t = i / steps;
      final pt = _quadBezierPoint(sp0, sc, sp2, t);
      totalLen += (pt - prev).distance;
      prev = pt;
    }
    final drawLen = totalLen * progress;
    double drawn = 0;
    prev = sp0;
    double dashing = 0;
    bool drawing = true;
    for (int i = 1; i <= steps * 4; i++) {
      final t = i / (steps * 4);
      if (t > 1) break;
      final pt = _quadBezierPoint(sp0, sc, sp2, t);
      final seg = (pt - prev).distance;
      if (drawn + seg > drawLen) break;
      if (drawing) {
        canvas.drawLine(prev, pt, paint);
      }
      dashing += seg;
      if (drawing && dashing >= on)  { drawing = false; dashing = 0; }
      if (!drawing && dashing >= off){ drawing = true;  dashing = 0; }
      drawn += seg;
      prev = pt;
    }
  }

  void _drawOrbitRing(Canvas canvas, Offset centre, double r, double angle, Color color, double sw, List<double> dash) {
    canvas.save();
    canvas.translate(centre.dx, centre.dy);
    canvas.rotate(angle);
    final path = Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: r));
    final paint = Paint()
      ..color = color
      ..strokeWidth = sw
      ..style = PaintingStyle.stroke;
    // Draw dashed circle
    double dashOn = dash[0], dashOff = dash[1];
    final circum = 2 * math.pi * r;
    double d = 0;
    bool draw = true;
    while (d < circum) {
      final seg = draw ? dashOn : dashOff;
      final startAngle = d / r;
      final sweepAngle = math.min(seg, circum - d) / r;
      if (draw) {
        canvas.drawArc(Rect.fromCircle(center: Offset.zero, radius: r), startAngle, sweepAngle, false, paint);
      }
      d += seg;
      draw = !draw;
    }
    canvas.restore();
  }

  void _drawLabel(Canvas canvas, Offset centre, String text, double opacity, Size size) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontFamily: 'Jost', fontSize: _sx(6, size),
          fontWeight: FontWeight.w500,
          letterSpacing: _sx(0.72, size),
          color: kGold.withOpacity(0.88 * opacity),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(centre.dx - tp.width / 2, centre.dy + _sx(16, size)));
  }

  String _labelFor(int i) => ['COFFEE', 'DINING', 'DRINKS', 'CUISINE'][i];

  // ── Food icon painters (coordinates in SVG space, canvas scaled) ──
  void _paintCoffee(Canvas canvas, double op) {
    final p = Paint()
      ..color = kGold.withOpacity(0.75 * op)
      ..strokeWidth = 1.1..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    // Cup body
    final cup = Path()
      ..moveTo(-5, -3)..lineTo(-5, 3)
      ..quadraticBezierTo(-5, 6, -2, 6)
      ..lineTo(2, 6)..quadraticBezierTo(5, 6, 5, 3)..lineTo(5, -3)..close();
    canvas.drawPath(cup, p);
    // Handle
    final handle = Path()..moveTo(5, -1)..quadraticBezierTo(8, -1, 8, 1.5)..quadraticBezierTo(8, 4, 5, 4);
    canvas.drawPath(handle, p);
    // Rim
    canvas.drawLine(const Offset(-5.5, -3), const Offset(5.5, -3), p);
    // Steam
    final steam = Path()..moveTo(-1.5, -5.5)..quadraticBezierTo(-1.5, -4, 0, -4)..quadraticBezierTo(1.5, -4, 1.5, -5.5);
    canvas.drawPath(steam, p..color = kGold.withOpacity(0.45 * op));
  }

  void _paintCloche(Canvas canvas, double op) {
    final p = Paint()
      ..color = kGold.withOpacity(0.75 * op)
      ..strokeWidth = 1.1..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    final dome = Path()..moveTo(-7, 3)..quadraticBezierTo(-7, -4, 0, -4)..quadraticBezierTo(7, -4, 7, 3)..close();
    canvas.drawPath(dome, p);
    canvas.drawLine(const Offset(-8, 3), const Offset(8, 3), p);
    canvas.drawLine(const Offset(-2, 3), const Offset(-2, 6), p);
    canvas.drawLine(const Offset(2, 3), const Offset(2, 6), p);
    canvas.drawLine(const Offset(-4, 6), const Offset(4, 6), p);
    canvas.drawCircle(const Offset(0, -4), 1.5, p..style = PaintingStyle.stroke);
    canvas.drawLine(const Offset(0, -5.5), const Offset(0, -7), p);
  }

  void _paintWine(Canvas canvas, double op) {
    final p = Paint()
      ..color = kGold.withOpacity(0.75 * op)
      ..strokeWidth = 1.1..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    final glass = Path()
      ..moveTo(-4, -7)..quadraticBezierTo(-6, -1, 0, 3)
      ..quadraticBezierTo(6, -1, 4, -7)..close();
    canvas.drawPath(glass, p);
    canvas.drawLine(const Offset(0, 3), const Offset(0, 8), p);
    canvas.drawLine(const Offset(-3, 8), const Offset(3, 8), p);
  }

  void _paintFork(Canvas canvas, double op) {
    final p = Paint()
      ..color = kGold.withOpacity(0.75 * op)
      ..strokeWidth = 1.1..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    // Fork
    canvas.drawLine(const Offset(-3, -7), const Offset(-3, 7), p);
    canvas.drawLine(const Offset(-5, -7), const Offset(-5, -3), p);
    canvas.drawLine(const Offset(-1, -7), const Offset(-1, -3), p);
    final tines = Path()..moveTo(-5, -3)..quadraticBezierTo(-3, -1, -1, -3);
    canvas.drawPath(tines, p);
    // Knife
    canvas.drawLine(const Offset(3, -7), const Offset(3, 7), p);
    final blade = Path()..moveTo(1, -7)..quadraticBezierTo(3, -4, 5, -7);
    canvas.drawPath(blade, p);
  }

  void _paintPlane(Canvas canvas, double op) {
    final fill = Paint()..color = onSurfaceColor.withOpacity(0.55 * op)..style = PaintingStyle.fill;
    // Fuselage
    final fuse = Path()
      ..moveTo(-8, 0)
      ..quadraticBezierTo(-7, -2, -3, -2.2)
      ..lineTo(6.5, -1.8)
      ..quadraticBezierTo(8.5, -1.5, 9.5, 0)
      ..quadraticBezierTo(8.5, 1.5, 6.5, 1.8)
      ..lineTo(-3, 2.2)
      ..quadraticBezierTo(-7, 2, -8, 0)
      ..close();
    canvas.drawPath(fuse, fill);
    // Cockpit window (teal)
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(7, 0), width: 3.2, height: 2.2),
      Paint()..color = kTeal.withOpacity(0.85 * op),
    );
    // Wings
    canvas.drawPath(Path()..moveTo(1.5,-2)..lineTo(-2,-8.5)..lineTo(0.5,-8)..lineTo(4.5,-2.2)..close(), fill);
    canvas.drawPath(Path()..moveTo(1.5, 2)..lineTo(-2, 8.5)..lineTo(0.5, 8)..lineTo(4.5, 2.2)..close(), fill);
    // Engine nacelles
    final engine = Paint()..color = onSurfaceColor.withOpacity(0.55 * op);
    canvas.save();
    canvas.translate(0, -5.8); canvas.rotate(-8 * math.pi / 180);
    canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 3.8, height: 1.7), engine);
    canvas.restore();
    canvas.save();
    canvas.translate(0, 5.8); canvas.rotate(8 * math.pi / 180);
    canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 3.8, height: 1.7), engine);
    canvas.restore();
    // Tail fin
    canvas.drawPath(Path()..moveTo(-6,0)..lineTo(-8,-4.8)..lineTo(-5,-4.8)..lineTo(-3.5,-2)..close(), fill);
    // Horizontal stabs
    canvas.drawPath(Path()..moveTo(-5,-1.8)..lineTo(-7.5,-4.2)..lineTo(-6.5,-4)..lineTo(-4,-2)..close(), fill);
    canvas.drawPath(Path()..moveTo(-5, 1.8)..lineTo(-7.5, 4.2)..lineTo(-6.5, 4)..lineTo(-4, 2)..close(), fill);
  }

  @override
  bool shouldRepaint(_NetworkPainter old) =>
      old.surfaceColor != surfaceColor ||
      old.onSurfaceColor != onSurfaceColor ||
      old.hubOpacity != hubOpacity ||
      old.planeT != planeT ||
      old.orbit1Angle != orbit1Angle ||
      old.orbit2Angle != orbit2Angle ||
      old.planeVisible != planeVisible ||
      old.currentRoute != currentRoute;
}

// ─────────────────────────────────────────────────────────────
//  PROGRESS BAR
// ─────────────────────────────────────────────────────────────
class _ProgressBar extends StatelessWidget {
  final double progress;
  const _ProgressBar({required this.progress});
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 200, height: 9,
      child: CustomPaint(painter: _ProgressBarPainter(progress: progress)),
    );
  }
}

class _ProgressBarPainter extends CustomPainter {
  final double progress;
  const _ProgressBarPainter({required this.progress});
  @override
  void paint(Canvas canvas, Size size) {
    final trackPaint = Paint()..color = kGoldLight.withOpacity(0.25)..strokeWidth = 1..style = PaintingStyle.stroke;
    // Track
    canvas.drawLine(Offset(0, size.height / 2), Offset(size.width, size.height / 2), trackPaint);
    // End ticks
    canvas.drawLine(Offset(0, size.height / 2 - 4), Offset(0, size.height / 2 + 4), trackPaint);
    canvas.drawLine(Offset(size.width, size.height / 2 - 4), Offset(size.width, size.height / 2 + 4), trackPaint);
    if (progress <= 0) return;
    final fillW = size.width * progress;
    // Fill
    final fillPaint = Paint()
      ..shader = LinearGradient(colors: [kGold, kGoldLight]).createShader(Rect.fromLTWH(0, 0, fillW, 1))
      ..strokeWidth = 1..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(0, size.height / 2), Offset(fillW, size.height / 2), fillPaint);
    // Leading dot with glow
    canvas.drawCircle(
      Offset(fillW, size.height / 2), 3,
      Paint()..color = kGoldLight.withOpacity(0.4)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );
    canvas.drawCircle(Offset(fillW, size.height / 2), 3, Paint()..color = kGoldLight);
  }
  @override
  bool shouldRepaint(_ProgressBarPainter old) => old.progress != progress;
}

// ─────────────────────────────────────────────────────────────
//  FLOURISH
// ─────────────────────────────────────────────────────────────
class _Flourish extends StatelessWidget {
  const _Flourish();
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Container(height: 1, decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Colors.transparent, Color(0x40C9A96E)])))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(children: [
            _dia(3, 0.35), const SizedBox(width: 4),
            _dia(4, 0.60), const SizedBox(width: 4),
            _dia(3, 0.35),
          ]),
        ),
        Expanded(child: Container(height: 1, decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Color(0x40C9A96E), Colors.transparent])))),
      ],
    );
  }
  Widget _dia(double size, double op) => Transform.rotate(
    angle: math.pi / 4,
    child: Container(width: size, height: size, color: kGoldLight.withOpacity(op)),
  );
}

// ─────────────────────────────────────────────────────────────
//  FINDER STRIP
// ─────────────────────────────────────────────────────────────
class _FinderStrip extends StatelessWidget {
  final _Restaurant restaurant;
  final AnimationController dotCtrl;
  const _FinderStrip({required this.restaurant, required this.dotCtrl});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 320,
          padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
          decoration: BoxDecoration(
            color: kGold.withOpacity(0.08),
            border: Border.all(color: kGoldLight.withOpacity(0.28)),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            children: [
              _row(context, 'Terminal', restaurant.terminal, isTeal: true),
              const SizedBox(height: 2),
              Container(height: 1, color: kGoldLight.withOpacity(0.25)),
              const SizedBox(height: 12),
              _row(context, 'Cuisine', restaurant.cuisine),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Status', style: _labelStyle(context)),
                  Row(children: [
                    if (restaurant.open)
                      AnimatedBuilder(
                        animation: dotCtrl,
                        builder: (_, __) => Container(
                          width: 6, height: 6,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: kTeal.withOpacity(0.4 + 0.6 * dotCtrl.value),
                            shape: BoxShape.circle,
                          ),
                        ),
                      )
                    else
                      Container(
                        width: 6, height: 6,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(color: kGold.withOpacity(0.7), shape: BoxShape.circle),
                      ),
                    Text(
                      restaurant.open ? 'Open now' : 'Closes soon',
                      style: GoogleFonts.jost(
                        fontSize: 12, fontWeight: FontWeight.w500,
                        letterSpacing: 1.8,
                        color: restaurant.open ? kTeal : kGold,
                      ),
                    ),
                  ]),
                ],
              ),
            ],
          ),
        ),
        // Corner brackets
        Positioned(top: -1, left: -1, child: _corner(true)),
        Positioned(bottom: -1, right: -1, child: _corner(false)),
      ],
    );
  }

  Widget _row(BuildContext context, String label, String value, {bool isTeal = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: _labelStyle(context)),
        Text(
          value,
          style: isTeal
              ? GoogleFonts.jost(fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: 0.6, color: kTeal)
              : GoogleFonts.cormorant(fontSize: 18, fontWeight: FontWeight.w400, letterSpacing: 0.15, color: context.appOnSurface),
        ),
      ],
    );
  }

  TextStyle _labelStyle(BuildContext context) => GoogleFonts.jost(
    fontSize: 12, fontWeight: FontWeight.w400,
    letterSpacing: 1.8, color: context.appMutedFg(0.38),
  );

  Widget _corner(bool topLeft) => SizedBox(
    width: 11, height: 11,
    child: CustomPaint(
      painter: _CornerBracketPainter(topLeft: topLeft),
    ),
  );
}

class _CornerBracketPainter extends CustomPainter {
  final bool topLeft;
  const _CornerBracketPainter({required this.topLeft});
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = kGoldLight.withOpacity(0.6)..strokeWidth = 1..style = PaintingStyle.stroke;
    if (topLeft) {
      canvas.drawLine(Offset.zero, Offset(0, size.height), p);
      canvas.drawLine(Offset.zero, Offset(size.width, 0), p);
    } else {
      canvas.drawLine(Offset(size.width, 0), Offset(size.width, size.height), p);
      canvas.drawLine(Offset(0, size.height), Offset(size.width, size.height), p);
    }
  }
  @override bool shouldRepaint(_) => false;
}

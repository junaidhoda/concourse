import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
//  WELCOME SCREEN
// ─────────────────────────────────────────────────────────────
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});
  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with TickerProviderStateMixin {

  // Staggered content fade-ups
  late final AnimationController _catCtrl;
  late final AnimationController _heroCtrl;
  late final AnimationController _subCtrl;
  late final AnimationController _flourishCtrl;
  late final AnimationController _statsCtrl;
  late final AnimationController _ctaCtrl;

  // Decorative element fades
  late final AnimationController _frameCtrl;
  late final AnimationController _ruleCtrl;

  /// Which CTA was pressed: 'sign_in' | 'create_account' | 'guest'
  String? _selectedCta;

  static const _ease = Curves.easeOutQuart;

  Animation<double> _fade(AnimationController c) =>
      CurvedAnimation(parent: c, curve: _ease);
  Animation<Offset> _slide(AnimationController c) =>
      Tween(begin: const Offset(0, 0.06), end: Offset.zero)
          .animate(CurvedAnimation(parent: c, curve: _ease));

  void _delayed(int ms, AnimationController c) =>
      Future.delayed(Duration(milliseconds: ms), () { if (mounted) c.forward(); });

  @override
  void initState() {
    super.initState();
    const d = Duration(milliseconds: 900);

    _catCtrl      = AnimationController(vsync: this, duration: d);
    _heroCtrl     = AnimationController(vsync: this, duration: d);
    _subCtrl      = AnimationController(vsync: this, duration: d);
    _flourishCtrl = AnimationController(vsync: this, duration: d);
    _statsCtrl    = AnimationController(vsync: this, duration: d);
    _ctaCtrl      = AnimationController(vsync: this, duration: d);
    _frameCtrl    = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
    _ruleCtrl     = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

    // Staggered start sequence
    _delayed(100,  _catCtrl);
    _delayed(460,  _heroCtrl);
    _delayed(620,  _subCtrl);
    _delayed(900,  _flourishCtrl);
    _delayed(900,  _frameCtrl);
    _delayed(1100, _ruleCtrl);
    _delayed(1300, _statsCtrl);
    _delayed(1600, _ctaCtrl);
  }

  @override
  void dispose() {
    for (final c in [
      _catCtrl, _heroCtrl, _subCtrl, _flourishCtrl,
      _statsCtrl, _ctaCtrl, _frameCtrl, _ruleCtrl,
    ]) { c.dispose(); }
    super.dispose();
  }

  Widget _fadeUp(Widget child, AnimationController ctrl) => FadeTransition(
        opacity: _fade(ctrl),
        child: SlideTransition(position: _slide(ctrl), child: child),
      );

  // ─── BUILD ───────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: appSystemUiOverlayStyle(context),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Stack(
          children: [
            // 1 — Background gradient
            _Background(),

            // 2 — Gold inset frame
            FadeTransition(
              opacity: _fade(_frameCtrl),
              child: const _GoldFrame(),
            ),

            // 6 — Horizontal rule + dots
            _HRule(ctrl: _ruleCtrl),

            // 7 — Main content column
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Upper block (logo removed for space)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 42),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 32),
                        _fadeUp(const _CategoryPill(), _catCtrl),
                        const SizedBox(height: 24),
                        _fadeUp(const _HeroText(), _heroCtrl),
                        const SizedBox(height: 20),
                        _fadeUp(const _SubCopy(), _subCtrl),
                      ],
                    ),
                  ),
                  // Flourish divider
                  const SizedBox(height: 28),
                  _fadeUp(
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 42),
                      child: const _Flourish(),
                    ),
                    _flourishCtrl,
                  ),
                  // Spacer — illustrations float behind this via Stack
                  const Spacer(),
                  const SizedBox(height: 20),
                  // Stats band
                  _fadeUp(
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 42),
                      child: const _StatsBand(),
                    ),
                    _statsCtrl,
                  ),
                  const SizedBox(height: 12),
                  // CTA buttons
                  _fadeUp(
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 42),
                      child: _CtaButtons(
                        selectedCta: _selectedCta,
                        onSignIn: () async {
                          setState(() => _selectedCta = 'sign_in');
                          await Future<void>.delayed(const Duration(milliseconds: 180));
                          context.push('/login');
                        },
                        onCreateAccount: () async {
                          setState(() => _selectedCta = 'create_account');
                          await Future<void>.delayed(const Duration(milliseconds: 180));
                          context.push('/signup');
                        },
                        onGuest: () async {
                          setState(() => _selectedCta = 'guest');
                          await Future<void>.delayed(const Duration(milliseconds: 180));
                          context.go('/explore');
                        },
                      ),
                    ),
                    _ctaCtrl,
                  ),
                  const SizedBox(height: 16),
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
          border: Border.all(
            color: const Color(0x47C9A96E),
            width: 1,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  HORIZONTAL RULE + DOTS
// ─────────────────────────────────────────────────────────────
class _HRule extends StatelessWidget {
  final AnimationController ctrl;
  const _HRule({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, __) {
        return Opacity(
          opacity: ctrl.value,
          child: Stack(
            children: [
              // Rule line at ~80px from top of screen
              Positioned(
                top: 80,
                left: 0,
                right: 0,
                child: Transform.scale(
                  scaleX: ctrl.value,
                  child: Container(
                    height: 1,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.transparent,
                          Color(0x47C9A96E),
                          Color(0x14C9A96E),
                          Colors.transparent,
                        ],
                        stops: [0.03, 0.18, 0.50, 0.97],
                      ),
                    ),
                  ),
                ),
              ),
              // Left dot
              Positioned(
                top: 78,
                left: 40,
                child: Container(
                  width: 4, height: 4,
                  decoration: const BoxDecoration(
                    color: kGoldLight,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              // Right dot
              Positioned(
                top: 78,
                right: 40,
                child: Container(
                  width: 4, height: 4,
                  decoration: const BoxDecoration(
                    color: kGoldLight,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CORNER ORNAMENTS  (custom painter)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
//  WORLD MAP + FLIGHT PATH  (spacer zone)
// ─────────────────────────────────────────────────────────────
class _WorldMapZone extends StatelessWidget {
  final AnimationController mapCtrl;
  final AnimationController flightCtrl;
  const _WorldMapZone({required this.mapCtrl, required this.flightCtrl});

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    return Positioned(
      top: h * 0.40,   // below hero block
      left: 0, right: 0,
      height: 100,
      child: Stack(
        children: [
          // World map
          FadeTransition(
            opacity: CurvedAnimation(parent: mapCtrl, curve: Curves.easeIn),
            child: SizedBox.expand(
              child: CustomPaint(painter: _WorldMapPainter()),
            ),
          ),
          // Flight path overlay
          FadeTransition(
            opacity: CurvedAnimation(parent: flightCtrl, curve: Curves.easeIn),
            child: SizedBox.expand(
              child: CustomPaint(painter: _FlightPathPainter()),
            ),
          ),
        ],
      ),
    );
  }
}

class _WorldMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Scale factor: SVG viewBox 1009×650 → current size
    final sx = size.width / 1009;
    final sy = size.height / 650;

    final fill = Paint()
      ..color = kInk.withOpacity(0.09)
      ..style = PaintingStyle.fill;

    // Helper to scale a path point
    Offset s(double x, double y) => Offset(x * sx, y * sy);

    // ── Continent paths (Natural Earth simplified) ──

    // North America
    _drawPath(canvas, fill, [
      s(120,80),s(135,72),s(158,68),s(175,72),s(188,82),s(195,96),s(192,112),
      s(180,125),s(165,138),s(155,152),s(148,168),s(142,182),s(138,195),s(132,208),
      s(125,220),s(118,232),s(112,244),s(108,256),s(106,268),s(108,278),s(115,284),
      s(125,285),s(135,280),s(142,272),s(148,262),s(152,252),s(155,240),s(158,228),
      s(162,218),s(168,210),s(176,206),s(185,206),s(194,210),s(202,218),s(208,228),
      s(212,240),s(214,252),s(212,264),s(208,274),s(202,282),s(194,288),s(185,292),
      s(176,294),s(168,296),s(162,300),s(158,308),s(156,318),s(158,330),s(163,340),
      s(170,348),s(178,354),s(186,358),s(192,360),s(196,365),s(194,372),s(188,378),
      s(180,382),s(172,384),s(164,382),s(156,376),s(148,368),s(140,358),s(132,348),
      s(124,340),s(116,335),s(108,334),s(100,336),s(92,342),s(85,350),s(78,360),
      s(72,370),s(66,380),s(60,388),s(54,393),s(48,395),s(42,393),s(36,388),
      s(31,380),s(28,370),s(27,360),s(28,350),s(32,340),s(38,330),s(46,320),
      s(55,310),s(65,300),s(76,290),s(87,280),s(97,268),s(105,255),s(110,240),
      s(112,224),s(110,208),s(104,192),s(95,177),s(84,163),s(72,150),s(62,138),
      s(54,126),s(50,114),s(50,102),s(54,91),s(62,82),s(74,75),s(88,70),
      s(104,68),s(120,70),
    ]);

    // Greenland
    _drawPath(canvas, fill, [
      s(185,28),s(198,24),s(212,24),s(224,28),s(232,36),s(236,46),s(234,56),
      s(228,64),s(218,68),s(206,69),s(194,65),s(185,57),s(180,46),s(182,36),
    ]);

    // South America
    _drawPath(canvas, fill, [
      s(195,330),s(210,322),s(226,318),s(242,318),s(256,322),s(268,330),s(276,342),
      s(280,356),s(278,370),s(272,383),s(262,394),s(248,402),s(232,406),s(216,406),
      s(200,402),s(186,394),s(175,383),s(168,370),s(165,356),s(166,342),s(172,330),
      s(182,322),s(195,318),
    ]);
    _drawPath(canvas, fill, [
      s(210,406),s(218,412),s(224,422),s(226,434),s(222,445),s(214,453),s(203,457),
      s(192,455),s(183,448),s(177,437),s(176,425),s(180,414),s(187,406),s(198,402),
    ]);

    // Africa
    _drawPath(canvas, fill, [
      s(462,200),s(478,194),s(496,192),s(514,196),s(528,205),s(536,218),s(537,233),
      s(532,247),s(521,258),s(506,265),s(490,267),s(475,263),s(462,253),s(455,239),s(453,224),
    ]);
    _drawPath(canvas, fill, [
      s(475,268),s(492,264),s(508,268),s(520,278),s(526,292),s(524,308),s(515,321),
      s(501,328),s(486,328),s(473,320),s(466,306),s(466,290),
    ]);
    _drawPath(canvas, fill, [
      s(484,330),s(498,326),s(511,330),s(520,342),s(520,357),s(511,368),s(497,372),s(484,367),s(476,354),s(477,340),
    ]);
    _drawPath(canvas, fill, [s(487,374),s(500,370),s(512,375),s(517,388),s(512,401),s(499,407),s(487,402),s(481,389)]);
    _drawPath(canvas, fill, [s(490,408),s(500,405),s(508,412),s(508,424),s(498,430),s(489,425),s(487,413)]);

    // Europe blobs
    for (final pts in [
      [s(448,92),s(458,86),s(468,84),s(478,86),s(485,93),s(487,103),s(483,113),s(475,120),s(465,123),s(455,120),s(447,113),s(444,103)],
      [s(460,124),s(472,120),s(484,122),s(493,130),s(496,141),s(493,152),s(484,160),s(473,162),s(462,158),s(455,149),s(454,138)],
      [s(488,102),s(498,96),s(510,94),s(522,96),s(530,104),s(532,115),s(528,126),s(518,133),s(506,135),s(494,131),s(487,122)],
      [s(498,136),s(510,132),s(522,134),s(530,142),s(532,153),s(528,163),s(518,169),s(506,170),s(495,165),s(490,155)],
      [s(475,165),s(490,162),s(504,165),s(513,175),s(514,188),s(508,199),s(496,205),s(483,204),s(472,196),s(468,184)],
      [s(435,148),s(446,144),s(458,146),s(465,154),s(464,165),s(456,173),s(444,175),s(433,170),s(428,160)],
    ]) {
      _drawPath(canvas, fill, pts);
    }

    // Scandinavia
    _drawPath(canvas, fill, [s(488,60),s(496,54),s(506,52),s(516,56),s(521,65),s(519,76),s(512,83),s(502,85),s(492,80),s(487,70)]);
    _drawPath(canvas, fill, [s(510,52),s(520,46),s(532,46),s(540,54),s(540,65),s(533,73),s(522,75),s(512,70)]);

    // UK
    _drawPath(canvas, fill, [s(432,106),s(440,100),s(450,98),s(458,103),s(460,113),s(454,122),s(444,125),s(435,120)]);
    _drawPath(canvas, fill, [s(420,118),s(428,114),s(437,116),s(441,125),s(437,134),s(428,138),s(420,133),s(416,124)]);

    // Russia / N Asia
    _drawPath(canvas, fill, [
      s(540,52),s(560,46),s(590,42),s(625,40),s(660,42),s(694,48),s(720,58),s(740,72),
      s(750,88),s(748,104),s(738,116),s(722,122),s(704,122),s(688,116),s(675,106),
      s(665,95),s(658,84),s(654,73),s(652,63),s(648,56),s(638,52),s(620,50),s(600,52),
      s(582,58),s(566,66),s(553,74),s(544,82),s(540,90),s(538,100),s(540,110),
      s(546,118),s(554,123),s(562,124),s(568,118),s(570,108),s(566,98),s(558,90),s(548,84),
    ]);

    // Middle East
    _drawPath(canvas, fill, [s(546,178),s(558,172),s(572,170),s(584,175),s(590,185),s(588,197),s(578,206),s(564,208),s(552,202),s(546,190)]);
    _drawPath(canvas, fill, [s(570,178),s(582,172),s(596,172),s(606,180),s(607,193),s(599,203),s(585,206),s(573,200),s(567,188)]);

    // India
    _drawPath(canvas, fill, [s(620,190),s(636,182),s(654,180),s(668,188),s(674,202),s(670,218),s(658,228),s(641,232),s(625,226),s(615,212)]);
    _drawPath(canvas, fill, [s(634,234),s(648,228),s(660,232),s(664,246),s(656,258),s(640,262),s(627,254),s(624,240)]);
    _drawPath(canvas, fill, [s(638,264),s(650,260),s(658,268),s(654,280),s(641,284),s(632,275)]);

    // SE Asia
    _drawPath(canvas, fill, [s(700,210),s(714,202),s(730,200),s(742,208),s(746,222),s(738,235),s(722,240),s(707,234),s(700,220)]);
    _drawPath(canvas, fill, [s(720,242),s(732,236),s(743,240),s(745,254),s(734,264),s(720,264),s(712,254)]);

    // China / East Asia
    _drawPath(canvas, fill, [s(700,130),s(720,120),s(744,116),s(766,120),s(782,132),s(786,148),s(778,163),s(762,172),s(742,174),s(724,168),s(710,156),s(704,142)]);
    _drawPath(canvas, fill, [s(756,174),s(772,168),s(786,172),s(792,185),s(786,198),s(770,204),s(755,198),s(749,185)]);

    // Japan
    _drawPath(canvas, fill, [s(796,128),s(804,122),s(813,124),s(815,134),s(808,142),s(799,140)]);
    _drawPath(canvas, fill, [s(808,144),s(817,138),s(826,142),s(826,153),s(816,159),s(807,154)]);

    // Australia
    _drawPath(canvas, fill, [
      s(740,346),s(762,334),s(788,328),s(816,328),s(840,336),s(856,350),s(860,368),
      s(852,386),s(834,398),s(810,404),s(786,402),s(764,392),s(748,376),s(740,358),
    ]);

    // Madagascar
    _drawPath(canvas, fill, [s(548,320),s(555,314),s(562,316),s(564,326),s(560,335),s(552,338),s(546,332)]);

    // Graticule lines
    final gridPaint = Paint()
      ..color = kInk.withOpacity(0.05)
      ..strokeWidth = 0.4
      ..style = PaintingStyle.stroke;
    // Equator
    canvas.drawLine(Offset(0, 325*sy), Offset(size.width, 325*sy), gridPaint);
    // Tropics (dashed)
    _drawDashedLine(canvas, Offset(0, 253*sy), Offset(size.width, 253*sy), gridPaint..color = kInk.withOpacity(0.04), 4, 4);
    _drawDashedLine(canvas, Offset(0, 397*sy), Offset(size.width, 397*sy), gridPaint, 4, 4);
    // Meridians
    for (final x in [0.0, 168.0, 336.0, 504.0, 672.0, 840.0, 1008.0]) {
      canvas.drawLine(Offset(x*sx, 0), Offset(x*sx, size.height), gridPaint);
    }
  }

  void _drawPath(Canvas canvas, Paint paint, List<Offset> pts) {
    if (pts.isEmpty) return;
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (int i = 1; i < pts.length; i++) { path.lineTo(pts[i].dx, pts[i].dy); }
    path.close();
    canvas.drawPath(path, paint);
  }

  void _drawDashedLine(Canvas c, Offset p1, Offset p2, Paint paint, double on, double off) {
    final dx = p2.dx - p1.dx, dy = p2.dy - p1.dy;
    final len = math.sqrt(dx*dx + dy*dy);
    final ux = dx/len, uy = dy/len;
    double d = 0;
    bool drawing = true;
    while (d < len) {
      final seg = drawing ? on : off;
      final next = math.min(d + seg, len);
      if (drawing) {
        c.drawLine(Offset(p1.dx + ux*d, p1.dy + uy*d), Offset(p1.dx + ux*next, p1.dy + uy*next), paint);
      }
      d = next;
      drawing = !drawing;
    }
  }

  @override
  bool shouldRepaint(_) => false;
}

class _FlightPathPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Arc from LHR (~80,120 in 390×148) to JFK (~315,72)
    final sx = size.width / 390;
    final sy = size.height / 148;

    // Dashed arc
    final arcPath = Path()
      ..moveTo(80*sx, 120*sy)
      ..quadraticBezierTo(195*sx, 20*sy, 315*sx, 72*sy);
    _drawDashedPath(canvas, arcPath,
      Paint()..color = kGoldLight.withOpacity(0.45)..strokeWidth = 1..style = PaintingStyle.stroke,
      4, 6,
    );

    // Origin dot
    canvas.drawCircle(Offset(80*sx, 120*sy), 3*sx,
        Paint()..color = kGoldLight.withOpacity(0.6)..style = PaintingStyle.fill);

    // Destination dot + rings
    final dest = Offset(315*sx, 72*sy);
    canvas.drawCircle(dest, 3*sx, Paint()..color = kTeal.withOpacity(0.7)..style = PaintingStyle.fill);
    canvas.drawCircle(dest, 8*sx, Paint()..color = kTeal.withOpacity(0.28)..strokeWidth = 0.75..style = PaintingStyle.stroke);
    canvas.drawCircle(dest, 14*sx, Paint()..color = kTeal.withOpacity(0.12)..strokeWidth = 0.5..style = PaintingStyle.stroke);

    // Airport labels
    final labelStyle = TextStyle(
      fontFamily: 'Jost', fontSize: 8*sx,
      fontWeight: FontWeight.w300, letterSpacing: 1.0,
    );
    _drawText(canvas, 'LHR', Offset(54*sx, 134*sy), labelStyle.copyWith(color: kInk.withOpacity(0.38)));
    _drawText(canvas, 'JFK', Offset(296*sx, 62*sy), labelStyle.copyWith(color: kTeal.withOpacity(0.65)));

    // Plane icon at ~60% along arc
    final planePos = Offset(214*sx, 44*sy);
    canvas.save();
    canvas.translate(planePos.dx, planePos.dy);
    canvas.rotate(-26 * math.pi / 180);
    _drawPlane(canvas, sx);
    canvas.restore();
  }

  void _drawPlane(Canvas canvas, double sx) {
    final body  = Paint()..color = kInk.withOpacity(0.38)..style = PaintingStyle.fill;
    final wing  = Paint()..color = kInk.withOpacity(0.33)..style = PaintingStyle.fill;
    final tail  = Paint()..color = kInk.withOpacity(0.28)..style = PaintingStyle.fill;
    final cockp = Paint()..color = kTeal.withOpacity(0.55)..style = PaintingStyle.fill;

    canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 22*sx, height: 6*sx), body);
    canvas.drawPath(Path()..moveTo(-1*sx,0)..lineTo(-7*sx,-8*sx)..lineTo(2*sx,-5*sx)..close(), wing);
    canvas.drawPath(Path()..moveTo(-1*sx,0)..lineTo(-7*sx, 8*sx)..lineTo(2*sx, 5*sx)..close(), wing);
    canvas.drawPath(Path()..moveTo(-9*sx,0)..lineTo(-13*sx,-3.5*sx)..lineTo(-9*sx,-1*sx)..close(), tail);
    canvas.drawPath(Path()..moveTo(-9*sx,0)..lineTo(-13*sx, 3.5*sx)..lineTo(-9*sx, 1*sx)..close(), tail);
    canvas.drawOval(Rect.fromCenter(center: Offset(8*sx, 0), width: 5*sx, height: 3.6*sx), cockp);
  }

  void _drawDashedPath(Canvas canvas, Path path, Paint paint, double on, double off) {
    for (final metric in path.computeMetrics()) {
      double d = 0;
      bool drawing = true;
      while (d < metric.length) {
        final len = drawing ? on : off;
        final next = math.min(d + len, metric.length);
        if (drawing) {
          canvas.drawPath(metric.extractPath(d, next), paint);
        }
        d = next;
        drawing = !drawing;
      }
    }
  }

  void _drawText(Canvas canvas, String text, Offset offset, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(_) => false;
}

// ─────────────────────────────────────────────────────────────
//  BOARDING PASS
// ─────────────────────────────────────────────────────────────
class _BoardingPassWidget extends StatelessWidget {
  final AnimationController ctrl;
  const _BoardingPassWidget({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    return Positioned(
      top: h * 0.61,   // below world map + food icons
      left: 30, right: 30,
      height: 48,
      child: FadeTransition(
        opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeIn),
        child: CustomPaint(painter: _BoardingPassPainter()),
      ),
    );
  }
}

class _BoardingPassPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final borderPaint = Paint()
      ..color = kGoldLight.withOpacity(0.75)
      ..strokeWidth = 0.75
      ..style = PaintingStyle.stroke;
    final fillPaint = Paint()
      ..color = kGold.withOpacity(0.03)
      ..style = PaintingStyle.fill;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0.5, 0.5, size.width - 1, size.height - 1),
      const Radius.circular(3),
    );

    // Fill
    canvas.drawRRect(rrect, fillPaint);

    // Dashed border
    _drawDashedRRect(canvas, rrect, borderPaint, 3, 5);

    // Perforation line
    _drawDashedLine(canvas,
      Offset(size.width * 0.745, 0), Offset(size.width * 0.745, size.height),
      Paint()..color = kGoldLight.withOpacity(0.45)..strokeWidth = 0.5..style = PaintingStyle.stroke,
      2, 3,
    );

    // Barcode centred in strip between perforation (0.745) and right dotted border
    final bcPaint = Paint()..color = kInk.withOpacity(0.18)..style = PaintingStyle.fill;
    const gap = 3.0;
    const List<double> widths = [2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2, 0.75, 2]; // all bars width 2 (13 bars, 12 gaps)
    const leftMargin = 5.0;
    const rightMargin = 6.0;
    final barcodeLeft = size.width * 0.745 + leftMargin;
    final barcodeRight = size.width - rightMargin;
    final availableWidth = barcodeRight - barcodeLeft;
    const barCount = 13;
    final totalNaturalWidth = barCount * 2.0 + 12 * gap; // 13 bars (width 2) + 12 gaps
    final scale = availableWidth / totalNaturalWidth; // scale to fill the strip
    final totalScaledWidth = totalNaturalWidth * scale;
    final startX = barcodeLeft + (availableWidth - totalScaledWidth) / 2; // centre in strip
    double bx = startX;
    bool bar = true;
    for (final w in widths) {
      if (bar) {
        canvas.drawRect(Rect.fromLTWH(bx, 7, w * scale, size.height - 14), bcPaint);
      }
      bx += (bar ? w * scale : gap * scale);
      bar = !bar;
    }

    // Text
    _drawText(canvas, 'LHR → JFK', const Offset(16, 6),
      const TextStyle(fontFamily: 'Cormorant', fontSize: 14, fontWeight: FontWeight.w400,
        color: Color(0x800F1214), letterSpacing: 0.3));
    _drawText(canvas, 'BOARDING PASS', const Offset(16, 26),
      const TextStyle(fontFamily: 'Jost', fontSize: 7.5, fontWeight: FontWeight.w300,
        color: Color(0x470F1214), letterSpacing: 1.4));
    _drawText(canvas, 'GATE 14B', Offset(size.width * 0.46, 6),
      const TextStyle(fontFamily: 'Jost', fontSize: 8.5, fontWeight: FontWeight.w300,
        color: Color(0x520F1214), letterSpacing: 1.0));
    _drawText(canvas, 'SEAT 12A', Offset(size.width * 0.46, 22),
      const TextStyle(fontFamily: 'Jost', fontSize: 8.5, fontWeight: FontWeight.w300,
        color: Color(0x470F1214), letterSpacing: 1.0));
  }

  void _drawDashedRRect(Canvas canvas, RRect rrect, Paint paint, double on, double off) {
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      double d = 0; bool drawing = true;
      while (d < metric.length) {
        final len = drawing ? on : off;
        final next = math.min(d + len, metric.length);
        if (drawing) canvas.drawPath(metric.extractPath(d, next), paint);
        d = next; drawing = !drawing;
      }
    }
  }

  void _drawDashedLine(Canvas c, Offset p1, Offset p2, Paint paint, double on, double off) {
    final dx = p2.dx-p1.dx, dy = p2.dy-p1.dy;
    final len = math.sqrt(dx*dx+dy*dy);
    final ux = dx/len, uy = dy/len;
    double d = 0; bool drawing = true;
    while (d < len) {
      final seg = drawing ? on : off;
      final next = math.min(d+seg, len);
      if (drawing) c.drawLine(Offset(p1.dx+ux*d,p1.dy+uy*d), Offset(p1.dx+ux*next,p1.dy+uy*next), paint);
      d = next; drawing = !drawing;
    }
  }

  void _drawText(Canvas canvas, String text, Offset offset, TextStyle style) {
    (TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr)..layout())
      .paint(canvas, offset);
  }

  @override
  bool shouldRepaint(_) => false;
}

// ─────────────────────────────────────────────────────────────
//  FOOD ICONS
// ─────────────────────────────────────────────────────────────
class _FoodIcons extends StatelessWidget {
  final AnimationController ctrl;
  const _FoodIcons({required this.ctrl});

  static const _iconSize = 28.0;

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    // Just above the boarding pass (boarding pass is at h * 0.61, height 48)
    final top = h * 0.61 - _iconSize - 10;
    return FadeTransition(
      opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeIn),
      child: Stack(
        children: [
          Positioned(
            top: top,
            left: 24,
            right: 24,
            height: _iconSize,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Fork/Knife: 18×28, lowest y=26 → baseline ref (0)
                _iconBox(const Size(18, 28), _ForkKnifePainter(), 0),
                // Cloche: 30×24, lowest y=20 → shift down so baseline aligns
                _iconBox(const Size(30, 24), _ClochePainter(), 2),
                // Coffee: 24×22, lowest y=19 → shift down
                _iconBox(const Size(24, 22), _CoffeePainter(), 2),
                // Wine: 18×30, lowest y=26 → shift down
                _iconBox(const Size(18, 30), _WineGlassPainter(), 2),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconBox(Size painterSize, CustomPainter painter, double topBaselineOffset) {
    return Padding(
      padding: EdgeInsets.only(top: topBaselineOffset),
      child: SizedBox(
        width: _iconSize,
        height: _iconSize,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: FittedBox(
            fit: BoxFit.contain,
            alignment: Alignment.bottomCenter,
            child: SizedBox(
              width: painterSize.width,
              height: painterSize.height,
              child: CustomPaint(painter: painter),
            ),
          ),
        ),
      ),
    );
  }
}

class _ForkKnifePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = kInk.withOpacity(0.16)..strokeWidth = 1.2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    // Fork
    canvas.drawLine(const Offset(4,2), const Offset(4,26), p);
    canvas.drawLine(const Offset(2,2), const Offset(2,8), p);
    canvas.drawLine(const Offset(6,2), const Offset(6,8), p);
    canvas.drawPath(Path()..moveTo(2,8)..quadraticBezierTo(4,10.5,6,8), p);
    // Knife
    canvas.drawLine(const Offset(13,2), const Offset(13,26), p);
    canvas.drawPath(Path()..moveTo(10,2)..quadraticBezierTo(13,9,16,2), p);
  }
  @override bool shouldRepaint(_) => false;
}

class _ClochePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = kTeal.withOpacity(0.16)..strokeWidth = 1.2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    canvas.drawPath(Path()..moveTo(2,16)..quadraticBezierTo(2,4,15,4)..quadraticBezierTo(28,4,28,16)..close(), p);
    canvas.drawLine(const Offset(0,16), const Offset(30,16), p);
    canvas.drawLine(const Offset(11,16), const Offset(11,20), p);
    canvas.drawLine(const Offset(19,16), const Offset(19,20), p);
    canvas.drawLine(const Offset(9,20), const Offset(21,20), p);
    canvas.drawCircle(const Offset(15,4), 2.5, p);
    canvas.drawLine(const Offset(15,1.5), const Offset(15,0), p);
  }
  @override bool shouldRepaint(_) => false;
}

class _CoffeePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = kInk.withOpacity(0.16)..strokeWidth = 1.2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    canvas.drawPath(Path()..moveTo(3,6)..lineTo(3,16)..quadraticBezierTo(3,19,6,19)..lineTo(14,19)..quadraticBezierTo(17,19,17,16)..lineTo(17,6)..close(), p);
    canvas.drawPath(Path()..moveTo(17,8)..quadraticBezierTo(21,8,21,11.5)..quadraticBezierTo(21,15,17,15), p);
    canvas.drawLine(const Offset(2,6), const Offset(18,6), p);
    canvas.drawPath(Path()..moveTo(7,2.5)..quadraticBezierTo(7,4.5,9,4.5)..quadraticBezierTo(11,4.5,11,2.5), p..color = kInk.withOpacity(0.11));
  }
  @override bool shouldRepaint(_) => false;
}

class _WineGlassPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = kInk.withOpacity(0.16)..strokeWidth = 1.2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    canvas.drawPath(Path()..moveTo(3,2)..quadraticBezierTo(1,10,9,14)..quadraticBezierTo(17,10,15,2)..close(), p);
    canvas.drawLine(const Offset(9,14), const Offset(9,26), p);
    canvas.drawLine(const Offset(5,26), const Offset(13,26), p);
  }
  @override bool shouldRepaint(_) => false;
}

// ─────────────────────────────────────────────────────────────
//  CATEGORY PILL
// ─────────────────────────────────────────────────────────────
class _CategoryPill extends StatelessWidget {
  const _CategoryPill();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 12, 5),
      decoration: BoxDecoration(
        color: kGold.withOpacity(0.10),
        border: Border.all(color: kGoldLight.withOpacity(0.28)),
        borderRadius: BorderRadius.circular(2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Transform.rotate(
            angle: math.pi / 4,
            child: Container(width: 5, height: 5, color: kGoldLight),
          ),
          const SizedBox(width: 8),
          Text(
            'AIRPORT DINING GUIDE',
            style: GoogleFonts.jost(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              letterSpacing: 2.4,
              color: kGold,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  HERO TEXT
// ─────────────────────────────────────────────────────────────
class _HeroText extends StatelessWidget {
  const _HeroText();
  @override
  Widget build(BuildContext context) {
    final muted = GoogleFonts.cormorant(
      fontSize: 35, fontWeight: FontWeight.w400,
      height: 1.20, letterSpacing: -0.35,
      color: context.appMutedFg(0.72),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Every airport.', style: muted),
        Text('Every terminal.', style: muted),
        // Accent line with gold underline
        Stack(
          children: [
            Text(
              'Every great meal.',
              style: GoogleFonts.cormorant(
                fontSize: 38, fontWeight: FontWeight.w400,
                fontStyle: FontStyle.italic,
                height: 1.20, letterSpacing: -0.38,
                color: context.appOnSurface,
              ),
            ),
            // Gold underline drawn via a positioned container
            Positioned(
              bottom: 2, left: 0, right: 0,
              child: Container(
                height: 1,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0x47C9A96E), Colors.transparent],
                    stops: [0.0, 0.8],
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SUB COPY
// ─────────────────────────────────────────────────────────────
class _SubCopy extends StatelessWidget {
  const _SubCopy();
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 230,
      child: Text(
        'Restaurants, menus and live opening hours — wherever your flight takes you.',
        style: GoogleFonts.jost(
          fontSize: 13, fontWeight: FontWeight.w400,
          height: 1.72, letterSpacing: 0.3,
          color: context.appMutedFg(0.44),
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
        Expanded(child: Container(height: 1, decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Colors.transparent, Color(0x47C9A96E)])))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
            children: [
              _diamond(3, 0.4),
              const SizedBox(width: 5),
              _diamond(4, 0.7),
              const SizedBox(width: 5),
              _diamond(3, 0.4),
            ],
          ),
        ),
        Expanded(child: Container(height: 1, decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Color(0x47C9A96E), Colors.transparent])))),
      ],
    );
  }

  Widget _diamond(double size, double opacity) => Transform.rotate(
    angle: math.pi / 4,
    child: Container(
      width: size, height: size,
      color: kGoldLight.withOpacity(opacity),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  STATS BAND
// ─────────────────────────────────────────────────────────────
class _StatsBand extends StatelessWidget {
  const _StatsBand();
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Gold top edge
        Container(height: 1, decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [kGold, kGoldLight, Colors.transparent],
            stops: [0.0, 0.4, 0.8],
          ),
        )),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Row(
            children: [
              _stat(context, '500+', 'Airports'),
              _divider(context),
              _stat(context, '12k', 'Restaurants'),
              _divider(context),
              _stat(context, 'Live', 'Opening hours'),
            ],
          ),
        ),
        Container(height: 1, color: context.appOnSurface.withValues(alpha: 0.08)),
      ],
    );
  }

  Widget _stat(BuildContext context, String number, String label) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: number.replaceAll(RegExp(r'[+k]'), ''),
                style: GoogleFonts.cormorant(
                  fontSize: 27, fontWeight: FontWeight.w400,
                  color: context.appOnSurface, letterSpacing: -0.5, height: 1,
                ),
              ),
              if (number.contains('+') || number.contains('k'))
                TextSpan(
                  text: number.contains('+') ? '+' : 'k',
                  style: GoogleFonts.cormorant(
                    fontSize: 22, fontWeight: FontWeight.w400,
                    color: kGold, height: 1,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 5),
        Text(
          label.toUpperCase(),
          style: GoogleFonts.jost(
            fontSize: 10, fontWeight: FontWeight.w400,
            letterSpacing: 1.8, color: context.appMutedFg(0.44),
          ),
        ),
      ],
    ),
  );

  Widget _divider(BuildContext context) => Container(
    width: 1, height: 44,
    color: context.appOnSurface.withValues(alpha: 0.08),
    margin: const EdgeInsets.only(right: 18),
  );
}

// ─────────────────────────────────────────────────────────────
//  CTA BUTTONS
// ─────────────────────────────────────────────────────────────
class _CtaButtons extends StatelessWidget {
  final String? selectedCta;
  final VoidCallback onSignIn;
  final VoidCallback onCreateAccount;
  final VoidCallback onGuest;
  const _CtaButtons({
    required this.onSignIn,
    required this.onCreateAccount,
    required this.onGuest,
    this.selectedCta,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Sign in — plain teal with tap ripple
        _TealButton(label: 'Sign in', onTap: onSignIn, isSelected: selectedCta == 'sign_in'),
        const SizedBox(height: 9),
        // Create account — gold border with tap ripple
        _GoldOutlineButton(label: 'Create account', onTap: onCreateAccount, isSelected: selectedCta == 'create_account'),
        const SizedBox(height: 9),
        // Guest — underline when selected
        GestureDetector(
          onTap: onGuest,
          child: SizedBox(
            height: 32,
            child: Center(
              child: Text(
                'Continue as guest',
                style: GoogleFonts.jost(
                  fontSize: 11,
                  fontWeight: FontWeight.w400,
                  letterSpacing: 1.8,
                  color: context.appMutedFg(0.44),
                  decoration: selectedCta == 'guest' ? TextDecoration.underline : null,
                  decorationColor: context.appMutedFg(0.44),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TealButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool isSelected;
  const _TealButton({required this.label, required this.onTap, this.isSelected = false});
  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: double.infinity,
        height: 52,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(3),
          boxShadow: [
            BoxShadow(
              color: kTeal.withOpacity(isSelected ? 0.35 : 0.25),
              blurRadius: isSelected ? 24 : 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(3),
          splashColor: Colors.white.withOpacity(0.45),
          highlightColor: Colors.white.withOpacity(0.2),
          child: Ink(
            decoration: BoxDecoration(
              color: kTeal,
              borderRadius: BorderRadius.circular(3),
            ),
            child: Center(
              child: Text(
                label.toUpperCase(),
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
      ),
    );
  }
}

class _GoldOutlineButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool isSelected;
  const _GoldOutlineButton({required this.label, required this.onTap, this.isSelected = false});
  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(3),
        splashColor: kGoldLight.withOpacity(0.2),
        highlightColor: kGoldLight.withOpacity(0.08),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: double.infinity,
          height: 52,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            border: Border.all(
              color: kGoldLight.withOpacity(isSelected ? 0.55 : 0.28),
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Stack(
            children: [
              Center(
                child: Text(
                  label.toUpperCase(),
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 2.0,
                    color: context.appMutedFg(0.70),
                  ),
                ),
              ),
              // Gold corner brackets
              Positioned(top: -1, left: -1, child: _corner(topLeft: true)),
              Positioned(bottom: -1, right: -1, child: _corner(topLeft: false)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _corner({required bool topLeft}) => SizedBox(
    width: 9, height: 9,
    child: CustomPaint(painter: _CornerBracketPainter(topLeft: topLeft)),
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

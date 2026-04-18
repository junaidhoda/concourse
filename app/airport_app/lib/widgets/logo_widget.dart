import 'package:flutter/material.dart';

class LogoWidget extends StatelessWidget {
  final double size;
  final Color? backgroundColor;
  
  const LogoWidget({
    super.key,
    this.size = 200,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: LogoPainter(backgroundColor: backgroundColor),
    );
  }
}

class LogoPainter extends CustomPainter {
  final Color? backgroundColor;
  
  LogoPainter({this.backgroundColor});
  
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    
    // Background circle
    final backgroundPaint = Paint()
      ..color = backgroundColor ?? const Color(0xFF3E6BC1)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, radius, backgroundPaint);
    
    // Globe
    final globeRadius = radius * 0.6;
    final globePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, globeRadius, globePaint);
    
    // Globe outline
    final outlinePaint = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = radius * 0.02;
    canvas.drawCircle(center, globeRadius, outlinePaint);
    
    // Globe shadow
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.3)
      ..style = PaintingStyle.fill;
    final shadowCenter = Offset(center.dx, center.dy + globeRadius * 0.8);
    canvas.drawOval(
      Rect.fromCenter(
        center: shadowCenter,
        width: globeRadius * 1.6,
        height: globeRadius * 0.2,
      ),
      shadowPaint,
    );
    
    // Landmasses (simplified)
    final landPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    
    // Europe/Africa
    final path = Path();
    path.moveTo(center.dx - globeRadius * 0.5, center.dy - globeRadius * 0.2);
    path.quadraticBezierTo(
      center.dx - globeRadius * 0.25,
      center.dy - globeRadius * 0.4,
      center.dx,
      center.dy - globeRadius * 0.3,
    );
    path.quadraticBezierTo(
      center.dx + globeRadius * 0.25,
      center.dy - globeRadius * 0.2,
      center.dx + globeRadius * 0.2,
      center.dy,
    );
    path.quadraticBezierTo(
      center.dx,
      center.dy + globeRadius * 0.2,
      center.dx - globeRadius * 0.25,
      center.dy + globeRadius * 0.1,
    );
    path.quadraticBezierTo(
      center.dx - globeRadius * 0.5,
      center.dy,
      center.dx - globeRadius * 0.5,
      center.dy - globeRadius * 0.2,
    );
    path.close();
    canvas.drawPath(path, landPaint);
    
    // Airplane/Fork
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(-0.26); // -15 degrees
    
    // Fork handle / Airplane nose
    final forkPaint = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.fill;
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(globeRadius * 0.8, 0),
        width: globeRadius * 0.16,
        height: globeRadius * 0.08,
      ),
      forkPaint,
    );
    
    // Fork shaft / Airplane body
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(0, 0),
        width: globeRadius * 1.4,
        height: globeRadius * 0.08,
      ),
      forkPaint,
    );
    
    // Airplane windows
    final windowPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    
    for (int i = 0; i < 14; i++) {
      canvas.drawRect(
        Rect.fromCenter(
          center: Offset(-globeRadius * 0.6 + i * globeRadius * 0.08, 0),
          width: globeRadius * 0.04,
          height: globeRadius * 0.12,
        ),
        windowPaint,
      );
    }
    
    // Fork tines / Airplane tail
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(-globeRadius * 0.7, -globeRadius * 0.05),
        width: globeRadius * 0.04,
        height: globeRadius * 0.2,
      ),
      windowPaint,
    );
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(-globeRadius * 0.6, -globeRadius * 0.07),
        width: globeRadius * 0.04,
        height: globeRadius * 0.28,
      ),
      windowPaint,
    );
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(-globeRadius * 0.5, -globeRadius * 0.09),
        width: globeRadius * 0.04,
        height: globeRadius * 0.36,
      ),
      windowPaint,
    );
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(-globeRadius * 0.4, -globeRadius * 0.11),
        width: globeRadius * 0.04,
        height: globeRadius * 0.44,
      ),
      windowPaint,
    );
    
    canvas.restore();
  }
  
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
} 
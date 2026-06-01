import 'dart:math' as math;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // userChanges() fires on profile updates (displayName, photoURL) too.
    return StreamBuilder<User?>(
      stream: AuthService.userChanges,
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

class _SignedInScreenState extends State<_SignedInScreen>
    with TickerProviderStateMixin {
  late final AnimationController _headerCtrl;
  late final AnimationController _avatarCtrl;
  late final AnimationController _sectionsCtrl;

  bool _uploadingPhoto = false;

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

  Widget _fadeUp(Widget child, AnimationController ctrl) => FadeTransition(
        opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
              .animate(CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart)),
          child: child,
        ),
      );

  // ── Computed properties ─────────────────────────────────────

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

  bool get _hasPasswordProvider =>
      widget.user.providerData.any((p) => p.providerId == 'password');

  // ── Sheet launchers ─────────────────────────────────────────

  void _openSheet(Widget sheet) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => sheet,
    );
  }

  void _showAvatarOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _SheetShell(
        title: 'Profile Photo',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SheetActionTile(
              icon: Icons.photo_library_outlined,
              label: 'Choose from Gallery',
              onTap: () { Navigator.pop(ctx); _pickPhoto(ImageSource.gallery); },
            ),
            const SizedBox(height: 8),
            _SheetActionTile(
              icon: Icons.camera_alt_outlined,
              label: 'Take Photo',
              onTap: () { Navigator.pop(ctx); _pickPhoto(ImageSource.camera); },
            ),
            if (widget.user.photoURL != null) ...[
              const SizedBox(height: 8),
              _SheetActionTile(
                icon: Icons.delete_outline_rounded,
                label: 'Remove Photo',
                danger: true,
                onTap: () { Navigator.pop(ctx); _removePhoto(); },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final image = await ImagePicker().pickImage(
        source: source, imageQuality: 85, maxWidth: 512,
      );
      if (image == null) return;
      setState(() => _uploadingPhoto = true);
      await AuthService.uploadProfilePhoto(image);
      if (mounted) _snack('Profile photo updated');
    } catch (e) {
      if (mounted) _snack(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Future<void> _removePhoto() async {
    try {
      setState(() => _uploadingPhoto = true);
      await AuthService.removeProfilePhoto();
      if (mounted) _snack('Photo removed');
    } catch (e) {
      if (mounted) _snack(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Future<void> _sendVerificationEmail() async {
    try {
      await AuthService.sendEmailVerification();
      if (mounted) _snack('Verification email sent — check your inbox');
    } catch (e) {
      if (mounted) _snack(e.toString(), error: true);
    }
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
      backgroundColor: error ? const Color(0xFFB04040) : kTeal,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
    ));
  }

  // ── Build ───────────────────────────────────────────────────

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
                      Text('Account', style: GoogleFonts.cormorant(
                        fontSize: 36, fontWeight: FontWeight.w600,
                        letterSpacing: 0.3, color: context.appOnSurface,
                      )),
                      const SizedBox(height: 1),
                      Text('Your Concourse profile', style: GoogleFonts.jost(
                        fontSize: 12, fontWeight: FontWeight.w400,
                        letterSpacing: 2.0, color: context.appMutedFg(0.44),
                      )),
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
                      // Tappable avatar
                      GestureDetector(
                        onTap: _showAvatarOptions,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 88, height: 88,
                              decoration: BoxDecoration(
                                color: kTeal.withValues(alpha: 0.12),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: kTeal.withValues(alpha: 0.35), width: 1.5,
                                ),
                              ),
                              child: _uploadingPhoto
                                  ? const Center(child: SizedBox(
                                      width: 22, height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 1.5,
                                        valueColor: AlwaysStoppedAnimation(kTeal),
                                      ),
                                    ))
                                  : widget.user.photoURL != null
                                      ? ClipOval(
                                          child: Image.network(
                                            widget.user.photoURL!,
                                            width: 88, height: 88, fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) => Center(
                                              child: Text(_initials, style: GoogleFonts.cormorant(
                                                fontSize: 32, fontWeight: FontWeight.w500,
                                                color: kTeal, letterSpacing: 1,
                                              )),
                                            ),
                                          ),
                                        )
                                      : Center(
                                          child: Text(_initials, style: GoogleFonts.cormorant(
                                            fontSize: 32, fontWeight: FontWeight.w500,
                                            color: kTeal, letterSpacing: 1,
                                          )),
                                        ),
                            ),
                            Positioned(
                              bottom: 0, right: 0,
                              child: Container(
                                width: 26, height: 26,
                                decoration: BoxDecoration(
                                  color: kTeal,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Theme.of(context).scaffoldBackgroundColor,
                                    width: 2,
                                  ),
                                ),
                                child: const Icon(
                                  Icons.camera_alt_rounded, size: 13, color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Name with edit icon
                      GestureDetector(
                        onTap: () => _openSheet(_ChangeNameSheet(user: widget.user)),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(_displayName, style: GoogleFonts.cormorant(
                              fontSize: 26, fontWeight: FontWeight.w400,
                              color: context.appOnSurface, letterSpacing: 0.2,
                            )),
                            const SizedBox(width: 7),
                            Icon(Icons.edit_outlined, size: 14,
                              color: kTeal.withValues(alpha: 0.65)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),

                      // Email with verification badge
                      GestureDetector(
                        onTap: widget.user.emailVerified ? null : _sendVerificationEmail,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(widget.user.email ?? '', style: GoogleFonts.jost(
                              fontSize: 12, fontWeight: FontWeight.w400,
                              letterSpacing: 0.5, color: context.appMutedFg(0.50),
                            )),
                            const SizedBox(width: 5),
                            Icon(
                              widget.user.emailVerified
                                  ? Icons.verified_rounded
                                  : Icons.warning_amber_rounded,
                              size: 13,
                              color: widget.user.emailVerified
                                  ? kTeal
                                  : Colors.amber.shade600,
                            ),
                          ],
                        ),
                      ),
                      if (_memberSince.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(_memberSince, style: GoogleFonts.jost(
                          fontSize: 11, fontWeight: FontWeight.w400,
                          letterSpacing: 1.2, color: context.appMutedFg(0.35),
                        )),
                      ],
                    ],
                  ),
                  _avatarCtrl,
                ),
                const SizedBox(height: 20),

                // ── Email verification banner ──
                if (!widget.user.emailVerified && _hasPasswordProvider) ...[
                  _fadeUp(
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(color: Colors.amber.shade400.withValues(alpha: 0.5)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.warning_amber_rounded,
                            color: Colors.amber.shade700, size: 16),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Email not verified — tap to send a verification link.',
                              style: GoogleFonts.jost(
                                fontSize: 12, fontWeight: FontWeight.w400,
                                color: Colors.amber.shade800.withValues(alpha: 0.85),
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: _sendVerificationEmail,
                            child: Text('SEND', style: GoogleFonts.jost(
                              fontSize: 10, fontWeight: FontWeight.w500,
                              letterSpacing: 1.5, color: Colors.amber.shade700,
                            )),
                          ),
                        ],
                      ),
                    ),
                    _sectionsCtrl,
                  ),
                  const SizedBox(height: 20),
                ],

                // ── Sections ──
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [

                      // My Account
                      _SectionHeader(title: 'My Account'),
                      const SizedBox(height: 14),
                      _OptionRow(icon: Icons.bookmark_outline_rounded,
                        label: 'Saved Airports', onTap: () {}),
                      const SizedBox(height: 8),
                      _OptionRow(icon: Icons.star_outline_rounded,
                        label: 'Favourite Restaurants', onTap: () {}),
                      const SizedBox(height: 8),
                      _OptionRow(icon: Icons.notifications_none_rounded,
                        label: 'Notifications', onTap: () {}),
                      const SizedBox(height: 28),

                      // Profile
                      _SectionHeader(title: 'Profile'),
                      const SizedBox(height: 14),
                      _SettingsRow(
                        icon: Icons.badge_outlined,
                        label: 'Change Display Name',
                        onTap: () => _openSheet(_ChangeNameSheet(user: widget.user)),
                      ),
                      const SizedBox(height: 8),
                      _SettingsRow(
                        icon: Icons.photo_camera_outlined,
                        label: 'Change Profile Photo',
                        onTap: _showAvatarOptions,
                      ),
                      if (_hasPasswordProvider) ...[
                        const SizedBox(height: 8),
                        _SettingsRow(
                          icon: Icons.alternate_email_rounded,
                          label: 'Change Email Address',
                          subtitle: widget.user.email,
                          onTap: () => _openSheet(_ChangeEmailSheet(user: widget.user)),
                        ),
                      ],
                      const SizedBox(height: 28),

                      // Security
                      _SectionHeader(title: 'Security'),
                      const SizedBox(height: 14),
                      if (_hasPasswordProvider) ...[
                        _SettingsRow(
                          icon: Icons.lock_outline_rounded,
                          label: 'Change Password',
                          onTap: () => _openSheet(_ChangePasswordSheet(user: widget.user)),
                        ),
                        const SizedBox(height: 8),
                        _SettingsRow(
                          icon: Icons.lock_reset_rounded,
                          label: 'Reset Password',
                          subtitle: 'Send reset link to ${widget.user.email}',
                          onTap: () => context.push('/forgot-password'),
                        ),
                        const SizedBox(height: 8),
                      ],
                      _SettingsRow(
                        icon: Icons.link_rounded,
                        label: 'Connected Accounts',
                        subtitle: _connectedSummary(),
                        onTap: () => _openSheet(
                          _ConnectedAccountsSheet(user: widget.user)),
                      ),
                      const SizedBox(height: 28),

                      // Account
                      _SectionHeader(title: 'Account'),
                      const SizedBox(height: 14),
                      _SettingsRow(
                        icon: Icons.download_outlined,
                        label: 'Export My Data',
                        subtitle: 'Download a copy of your account data',
                        onTap: () => _openSheet(
                          _ExportDataSheet(user: widget.user)),
                      ),
                      const SizedBox(height: 8),
                      _SettingsRow(
                        icon: Icons.delete_forever_rounded,
                        label: 'Delete Account',
                        subtitle: 'Permanently remove your account and data',
                        danger: true,
                        onTap: () => _openSheet(
                          _DeleteAccountSheet(user: widget.user)),
                      ),
                      const SizedBox(height: 28),

                      // Session
                      _SectionHeader(title: 'Session'),
                      const SizedBox(height: 14),
                      _SettingsRow(
                        icon: Icons.devices_rounded,
                        label: 'Sign Out of All Devices',
                        subtitle: 'Other sessions expire within 1 hour',
                        onTap: () async {
                          await AuthService.signOut();
                        },
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => AuthService.signOut(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.red.shade400,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            side: BorderSide(
                              color: Colors.red.withValues(alpha: 0.30)),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(3)),
                          ),
                          child: Text('SIGN OUT', style: GoogleFonts.jost(
                            fontSize: 11, fontWeight: FontWeight.w400,
                            letterSpacing: 2.2, color: Colors.red.shade400,
                          )),
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

  String _connectedSummary() {
    final providers = widget.user.providerData.map((p) => p.providerId).toList();
    final parts = <String>[];
    if (providers.contains('google.com')) parts.add('Google');
    if (providers.contains('apple.com')) parts.add('Apple');
    if (providers.contains('password')) parts.add('Email');
    return parts.isEmpty ? 'None linked' : parts.join(' · ');
  }

  Widget _rule(BuildContext context) => Container(
    height: 1,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28),
          context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
        stops: const [0.0, 0.3, 0.7, 1.0],
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  BOTTOM SHEET SHELL
// ─────────────────────────────────────────────────────────────
class _SheetShell extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  const _SheetShell({required this.title, this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
          border: Border(
            top: BorderSide(color: kGoldLight.withValues(alpha: 0.18)),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 3,
                decoration: BoxDecoration(
                  color: kGoldLight.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(title, style: GoogleFonts.cormorant(
              fontSize: 24, fontWeight: FontWeight.w500,
              color: context.appOnSurface, letterSpacing: 0.2,
            )),
            if (subtitle != null) ...[
              const SizedBox(height: 5),
              Text(subtitle!, style: GoogleFonts.jost(
                fontSize: 13, fontWeight: FontWeight.w400,
                color: context.appMutedFg(0.50), height: 1.5,
              )),
            ],
            const SizedBox(height: 22),
            child,
          ],
        ),
      ),
    );
  }
}

// Simple action tile used inside the avatar options sheet.
class _SheetActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool danger;
  final VoidCallback onTap;
  const _SheetActionTile({
    required this.icon, required this.label,
    this.danger = false, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = danger ? Colors.red.shade400 : context.appOnSurface;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        decoration: BoxDecoration(
          color: danger
              ? Colors.red.shade400.withValues(alpha: 0.06)
              : kTeal.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(
            color: danger
                ? Colors.red.shade400.withValues(alpha: 0.18)
                : kGoldLight.withValues(alpha: 0.25),
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: danger ? Colors.red.shade400 : kTeal, size: 18),
            const SizedBox(width: 14),
            Text(label, style: GoogleFonts.jost(
              fontSize: 14, fontWeight: FontWeight.w400, color: color,
            )),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CHANGE NAME SHEET
// ─────────────────────────────────────────────────────────────
class _ChangeNameSheet extends StatefulWidget {
  final User user;
  const _ChangeNameSheet({required this.user});

  @override
  State<_ChangeNameSheet> createState() => _ChangeNameSheetState();
}

class _ChangeNameSheetState extends State<_ChangeNameSheet> {
  late final TextEditingController _ctrl;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.user.displayName ?? '');
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  Future<void> _submit() async {
    final name = _ctrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter a display name');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.updateDisplayName(name);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Display name updated', style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: kTeal,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ));
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Display Name',
      subtitle: 'This is the name shown on your profile.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SheetField(
            controller: _ctrl,
            label: 'NAME',
            hint: 'Your display name',
            enabled: !_loading,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: GoogleFonts.jost(
              fontSize: 12, color: Colors.red.shade400)),
          ],
          const SizedBox(height: 20),
          _SheetSubmitButton(label: 'Save Name', loading: _loading, onTap: _submit),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CHANGE EMAIL SHEET
// ─────────────────────────────────────────────────────────────
class _ChangeEmailSheet extends StatefulWidget {
  final User user;
  const _ChangeEmailSheet({required this.user});

  @override
  State<_ChangeEmailSheet> createState() => _ChangeEmailSheetState();
}

class _ChangeEmailSheetState extends State<_ChangeEmailSheet> {
  final _passwordCtrl = TextEditingController();
  final _emailCtrl    = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _passwordCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final password = _passwordCtrl.text;
    final email    = _emailCtrl.text.trim();
    if (password.isEmpty || email.isEmpty) {
      setState(() => _error = 'Please fill in all fields');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.updateEmail(email, password);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Verification sent to $email — click the link to confirm the change.',
            style: GoogleFonts.jost(fontSize: 13),
          ),
          backgroundColor: kTeal,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ));
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Change Email',
      subtitle: 'A verification link will be sent to the new address.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SheetField(
            controller: _passwordCtrl,
            label: 'CURRENT PASSWORD',
            hint: 'Enter your current password',
            obscure: _obscure,
            enabled: !_loading,
            suffixIcon: _obscure
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            onSuffixTap: () => setState(() => _obscure = !_obscure),
          ),
          const SizedBox(height: 14),
          _SheetField(
            controller: _emailCtrl,
            label: 'NEW EMAIL ADDRESS',
            hint: 'you@example.com',
            keyboardType: TextInputType.emailAddress,
            enabled: !_loading,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: GoogleFonts.jost(
              fontSize: 12, color: Colors.red.shade400)),
          ],
          const SizedBox(height: 20),
          _SheetSubmitButton(
            label: 'Send Verification', loading: _loading, onTap: _submit),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CHANGE PASSWORD SHEET
// ─────────────────────────────────────────────────────────────
class _ChangePasswordSheet extends StatefulWidget {
  final User user;
  const _ChangePasswordSheet({required this.user});

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _currentCtrl  = TextEditingController();
  final _newCtrl      = TextEditingController();
  final _confirmCtrl  = TextEditingController();
  bool _loading = false;
  bool _obscureCurrent = true;
  bool _obscureNew     = true;
  bool _obscureConfirm = true;
  String? _error;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentCtrl.text;
    final newPass = _newCtrl.text;
    final confirm = _confirmCtrl.text;
    if (current.isEmpty || newPass.isEmpty || confirm.isEmpty) {
      setState(() => _error = 'Please fill in all fields');
      return;
    }
    if (newPass != confirm) {
      setState(() => _error = 'New passwords do not match');
      return;
    }
    if (newPass.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.updatePassword(current, newPass);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Password updated', style: GoogleFonts.jost(fontSize: 14)),
          backgroundColor: kTeal,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        ));
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Change Password',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SheetField(
            controller: _currentCtrl,
            label: 'CURRENT PASSWORD',
            hint: 'Enter your current password',
            obscure: _obscureCurrent,
            enabled: !_loading,
            suffixIcon: _obscureCurrent
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            onSuffixTap: () => setState(() => _obscureCurrent = !_obscureCurrent),
          ),
          const SizedBox(height: 14),
          _SheetField(
            controller: _newCtrl,
            label: 'NEW PASSWORD',
            hint: 'At least 6 characters',
            obscure: _obscureNew,
            enabled: !_loading,
            suffixIcon: _obscureNew
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            onSuffixTap: () => setState(() => _obscureNew = !_obscureNew),
          ),
          const SizedBox(height: 14),
          _SheetField(
            controller: _confirmCtrl,
            label: 'CONFIRM NEW PASSWORD',
            hint: 'Repeat new password',
            obscure: _obscureConfirm,
            enabled: !_loading,
            suffixIcon: _obscureConfirm
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            onSuffixTap: () => setState(() => _obscureConfirm = !_obscureConfirm),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: GoogleFonts.jost(
              fontSize: 12, color: Colors.red.shade400)),
          ],
          const SizedBox(height: 20),
          _SheetSubmitButton(
            label: 'Update Password', loading: _loading, onTap: _submit),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  CONNECTED ACCOUNTS SHEET
// ─────────────────────────────────────────────────────────────
class _ConnectedAccountsSheet extends StatefulWidget {
  final User user;
  const _ConnectedAccountsSheet({required this.user});

  @override
  State<_ConnectedAccountsSheet> createState() =>
      _ConnectedAccountsSheetState();
}

class _ConnectedAccountsSheetState extends State<_ConnectedAccountsSheet> {
  bool _loadingGoogle = false;
  bool _loadingApple  = false;

  List<String> get _providers =>
      FirebaseAuth.instance.currentUser?.providerData
          .map((p) => p.providerId)
          .toList() ??
      [];

  Future<void> _toggleGoogle() async {
    setState(() => _loadingGoogle = true);
    try {
      if (_providers.contains('google.com')) {
        if (_providers.length < 2) {
          _snack('Cannot unlink — this is your only sign-in method', error: true);
          return;
        }
        await AuthService.unlinkProvider('google.com');
        if (mounted) _snack('Google account disconnected');
      } else {
        await AuthService.linkWithGoogle();
        if (mounted) _snack('Google account connected');
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) _snack(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loadingGoogle = false);
    }
  }

  Future<void> _toggleApple() async {
    setState(() => _loadingApple = true);
    try {
      if (_providers.contains('apple.com')) {
        if (_providers.length < 2) {
          _snack('Cannot unlink — this is your only sign-in method', error: true);
          return;
        }
        await AuthService.unlinkProvider('apple.com');
        if (mounted) _snack('Apple account disconnected');
      } else {
        await AuthService.linkWithApple();
        if (mounted) _snack('Apple account connected');
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) _snack(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loadingApple = false);
    }
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.jost(fontSize: 14)),
      backgroundColor: error ? const Color(0xFFB04040) : kTeal,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final providers = _providers;
    final googleLinked = providers.contains('google.com');
    final appleLinked  = providers.contains('apple.com');

    return _SheetShell(
      title: 'Connected Accounts',
      subtitle: 'Link sign-in methods to your Concourse account.',
      child: Column(
        children: [
          _ProviderRow(
            icon: Icons.g_mobiledata_rounded,
            name: 'Google',
            connected: googleLinked,
            loading: _loadingGoogle,
            onToggle: _toggleGoogle,
          ),
          const SizedBox(height: 10),
          _ProviderRow(
            icon: Icons.apple_rounded,
            name: 'Apple',
            connected: appleLinked,
            loading: _loadingApple,
            onToggle: _toggleApple,
          ),
        ],
      ),
    );
  }
}

class _ProviderRow extends StatelessWidget {
  final IconData icon;
  final String name;
  final bool connected;
  final bool loading;
  final VoidCallback onToggle;

  const _ProviderRow({
    required this.icon, required this.name, required this.connected,
    required this.loading, required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: appCardSurface(context),
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: kTeal.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Icon(icon, color: kTeal, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: GoogleFonts.jost(
                  fontSize: 14, fontWeight: FontWeight.w400,
                  color: context.appOnSurface,
                )),
                Text(
                  connected ? 'Connected' : 'Not connected',
                  style: GoogleFonts.jost(
                    fontSize: 11, fontWeight: FontWeight.w400,
                    color: connected ? kTeal : context.appMutedFg(0.42),
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
          loading
              ? const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 1.5,
                    valueColor: AlwaysStoppedAnimation(kTeal)),
                )
              : GestureDetector(
                  onTap: onToggle,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: connected
                          ? Colors.red.shade400.withValues(alpha: 0.08)
                          : kTeal.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(
                        color: connected
                            ? Colors.red.shade400.withValues(alpha: 0.25)
                            : kTeal.withValues(alpha: 0.30),
                      ),
                    ),
                    child: Text(
                      connected ? 'Unlink' : 'Connect',
                      style: GoogleFonts.jost(
                        fontSize: 11, fontWeight: FontWeight.w400,
                        letterSpacing: 0.5,
                        color: connected ? Colors.red.shade400 : kTeal,
                      ),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  EXPORT DATA SHEET
// ─────────────────────────────────────────────────────────────
class _ExportDataSheet extends StatefulWidget {
  final User user;
  const _ExportDataSheet({required this.user});

  @override
  State<_ExportDataSheet> createState() => _ExportDataSheetState();
}

class _ExportDataSheetState extends State<_ExportDataSheet> {
  String? _data;
  bool _loading = true;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AuthService.exportUserData();
      if (mounted) setState(() { _data = data; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _data = 'Error: $e'; _loading = false; });
    }
  }

  Future<void> _copy() async {
    if (_data == null) return;
    await Clipboard.setData(ClipboardData(text: _data!));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Export My Data',
      subtitle: 'A summary of the data Concourse holds for your account.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  valueColor: AlwaysStoppedAnimation(kTeal),
                ),
              ),
            )
          else
            Container(
              constraints: const BoxConstraints(maxHeight: 220),
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Theme.of(context).scaffoldBackgroundColor,
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: kGoldLight.withValues(alpha: 0.25)),
              ),
              child: SingleChildScrollView(
                child: Text(_data ?? '', style: GoogleFonts.sourceCodePro(
                  fontSize: 11.5,
                  color: context.appMutedFg(0.65),
                  height: 1.6,
                )),
              ),
            ),
          const SizedBox(height: 16),
          _SheetSubmitButton(
            label: _copied ? 'Copied!' : 'Copy to Clipboard',
            loading: false,
            onTap: _data != null ? _copy : null,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  DELETE ACCOUNT SHEET
// ─────────────────────────────────────────────────────────────
class _DeleteAccountSheet extends StatefulWidget {
  final User user;
  const _DeleteAccountSheet({required this.user});

  @override
  State<_DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends State<_DeleteAccountSheet> {
  final _passwordCtrl = TextEditingController();
  bool _loading  = false;
  bool _obscure  = true;
  bool _confirmed = false;
  String? _error;

  bool get _hasPasswordProvider =>
      widget.user.providerData.any((p) => p.providerId == 'password');

  @override
  void dispose() { _passwordCtrl.dispose(); super.dispose(); }

  Future<void> _delete() async {
    if (!_confirmed) return;
    if (_hasPasswordProvider && _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Please enter your current password');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.deleteAccount(
        password: _hasPasswordProvider ? _passwordCtrl.text : null,
      );
      // Auth state stream will navigate away automatically.
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Delete Account',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.red.shade400.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(
                color: Colors.red.shade400.withValues(alpha: 0.20)),
            ),
            child: Text(
              'This will permanently delete your account and all associated data. '
              'This action cannot be undone.',
              style: GoogleFonts.jost(
                fontSize: 13, color: Colors.red.shade400, height: 1.55),
            ),
          ),
          const SizedBox(height: 16),
          if (_hasPasswordProvider) ...[
            _SheetField(
              controller: _passwordCtrl,
              label: 'CONFIRM PASSWORD',
              hint: 'Enter your password to confirm',
              obscure: _obscure,
              enabled: !_loading,
              suffixIcon: _obscure
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              onSuffixTap: () => setState(() => _obscure = !_obscure),
            ),
            const SizedBox(height: 14),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: kTeal.withValues(alpha: 0.20)),
              ),
              child: Text(
                "You'll be asked to sign in with your connected account "
                "to verify your identity.",
                style: GoogleFonts.jost(
                  fontSize: 12, color: context.appMutedFg(0.55), height: 1.5),
              ),
            ),
            const SizedBox(height: 14),
          ],
          GestureDetector(
            onTap: _loading
                ? null
                : () => setState(() => _confirmed = !_confirmed),
            child: Row(
              children: [
                SizedBox(
                  width: 20, height: 20,
                  child: Checkbox(
                    value: _confirmed,
                    onChanged: _loading
                        ? null
                        : (v) => setState(() => _confirmed = v ?? false),
                    activeColor: Colors.red.shade400,
                    side: BorderSide(
                      color: Colors.red.shade400.withValues(alpha: 0.50)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'I understand this cannot be undone',
                    style: GoogleFonts.jost(
                      fontSize: 13, color: context.appMutedFg(0.60)),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: GoogleFonts.jost(
              fontSize: 12, color: Colors.red.shade400)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: _loading
                ? const Center(child: SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      valueColor: AlwaysStoppedAnimation(Colors.red),
                    ),
                  ))
                : OutlinedButton(
                    onPressed: _confirmed ? _delete : null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade400,
                      disabledForegroundColor:
                          Colors.red.shade400.withValues(alpha: 0.35),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: BorderSide(
                        color: _confirmed
                            ? Colors.red.shade400.withValues(alpha: 0.55)
                            : Colors.red.shade400.withValues(alpha: 0.20),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(3)),
                    ),
                    child: Text('DELETE MY ACCOUNT', style: GoogleFonts.jost(
                      fontSize: 11, fontWeight: FontWeight.w400,
                      letterSpacing: 2.0,
                    )),
                  ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  SHEET HELPERS
// ─────────────────────────────────────────────────────────────
class _SheetField extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final bool obscure;
  final bool enabled;
  final TextInputType keyboardType;
  final IconData? suffixIcon;
  final VoidCallback? onSuffixTap;

  const _SheetField({
    required this.controller,
    required this.label,
    required this.hint,
    this.obscure = false,
    this.enabled = true,
    this.keyboardType = TextInputType.text,
    this.suffixIcon,
    this.onSuffixTap,
  });

  @override
  State<_SheetField> createState() => _SheetFieldState();
}

class _SheetFieldState extends State<_SheetField> {
  final _focus = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() => _focused = _focus.hasFocus));
  }

  @override
  void dispose() { _focus.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: GoogleFonts.jost(
          fontSize: 10, fontWeight: FontWeight.w400,
          letterSpacing: 2.0,
          color: _focused ? kTeal : context.appMutedFg(0.45),
        )),
        const SizedBox(height: 6),
        TextField(
          controller: widget.controller,
          focusNode: _focus,
          obscureText: widget.obscure,
          keyboardType: widget.keyboardType,
          enabled: widget.enabled,
          style: GoogleFonts.jost(
            fontSize: 14, color: context.appOnSurface),
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: GoogleFonts.jost(
              fontSize: 14, color: context.appMutedFg(0.38)),
            filled: true,
            fillColor: appInputFill(context),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14, vertical: 13),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(3),
              borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.28)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(3),
              borderSide: const BorderSide(color: kTeal, width: 1),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(3),
              borderSide: BorderSide(color: kGoldLight.withValues(alpha: 0.15)),
            ),
            suffixIcon: widget.suffixIcon != null
                ? GestureDetector(
                    onTap: widget.onSuffixTap,
                    child: Icon(widget.suffixIcon,
                      size: 16, color: context.appMutedFg(0.42)),
                  )
                : null,
          ),
        ),
      ],
    );
  }
}

class _SheetSubmitButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onTap;
  const _SheetSubmitButton({
    required this.label, required this.loading, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: loading ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: kTeal,
          disabledBackgroundColor: kTeal.withValues(alpha: 0.45),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
          elevation: 0,
        ),
        child: loading
            ? const SizedBox(
                width: 18, height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  valueColor: AlwaysStoppedAnimation(Colors.white),
                ),
              )
            : Text(label.toUpperCase(), style: GoogleFonts.jost(
                fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 2.2,
              )),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  GUEST SCREEN
// ─────────────────────────────────────────────────────────────
class _GuestScreen extends StatefulWidget {
  const _GuestScreen();

  @override
  State<_GuestScreen> createState() => _GuestScreenState();
}

class _GuestScreenState extends State<_GuestScreen>
    with TickerProviderStateMixin {
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

  Widget _fadeUp(Widget child, AnimationController ctrl) => FadeTransition(
        opacity: CurvedAnimation(parent: ctrl, curve: Curves.easeOutQuart),
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
              .animate(CurvedAnimation(
                parent: ctrl, curve: Curves.easeOutQuart)),
          child: child,
        ),
      );

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
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Account', style: GoogleFonts.cormorant(
                        fontSize: 36, fontWeight: FontWeight.w600,
                        letterSpacing: 0.3, color: context.appOnSurface,
                      )),
                      const SizedBox(height: 1),
                      Text('Sign in to save your favourites',
                        style: GoogleFonts.jost(
                          fontSize: 12, fontWeight: FontWeight.w400,
                          letterSpacing: 2.0, color: context.appMutedFg(0.44),
                        )),
                      const SizedBox(height: 14),
                      _rule(context),
                    ],
                  ),
                  _headerCtrl,
                ),
                const SizedBox(height: 28),
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
                                border: Border.all(
                                  color: kGoldLight.withValues(alpha: 0.35),
                                  width: 1,
                                ),
                              ),
                              child: Icon(Icons.person_outline_rounded,
                                size: 40,
                                color: kTeal.withValues(alpha: 0.70)),
                            ),
                            Positioned(
                              bottom: 0, right: 0,
                              child: Container(
                                width: 26, height: 26,
                                decoration: BoxDecoration(
                                  color: kTeal, shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white, width: 2),
                                ),
                                child: const Icon(Icons.add,
                                  size: 14, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text('Guest', style: GoogleFonts.cormorant(
                        fontSize: 26, fontWeight: FontWeight.w400,
                        color: context.appOnSurface, letterSpacing: 0.2,
                      )),
                      const SizedBox(height: 4),
                      Text('Not signed in', style: GoogleFonts.jost(
                        fontSize: 12, fontWeight: FontWeight.w400,
                        letterSpacing: 1.6, color: context.appMutedFg(0.42),
                      )),
                    ],
                  ),
                  _avatarCtrl,
                ),
                const SizedBox(height: 28),
                _fadeUp(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                        decoration: BoxDecoration(
                          color: appCardSurface(context),
                          borderRadius: BorderRadius.circular(3),
                          border: Border.all(
                            color: kGoldLight.withValues(alpha: 0.28)),
                          boxShadow: [BoxShadow(
                            color: context.appOnSurface.withValues(alpha: 0.06),
                            blurRadius: 8, offset: const Offset(0, 2),
                          )],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 2,
                              margin: const EdgeInsets.only(bottom: 16),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(colors: [
                                  kTeal.withValues(alpha: 0.5),
                                  Colors.transparent,
                                ]),
                                borderRadius: BorderRadius.circular(1),
                              ),
                            ),
                            Text('Join Concourse',
                              style: GoogleFonts.cormorant(
                                fontSize: 22, fontWeight: FontWeight.w500,
                                color: context.appOnSurface,
                                letterSpacing: 0.2,
                              )),
                            const SizedBox(height: 6),
                            Text(
                              'Save favourite airports, bookmark restaurants, '
                              'and get personalised dining recommendations.',
                              style: GoogleFonts.jost(
                                fontSize: 13, fontWeight: FontWeight.w400,
                                color: context.appMutedFg(0.58), height: 1.6,
                              ),
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: () => context.push('/signup'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: kTeal,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 14),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(3)),
                                  elevation: 0,
                                ),
                                child: Text('CREATE ACCOUNT',
                                  style: GoogleFonts.jost(
                                    fontSize: 11, fontWeight: FontWeight.w500,
                                    letterSpacing: 2.2,
                                  )),
                              ),
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton(
                                onPressed: () => context.push('/login'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: context.appOnSurface,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 14),
                                  side: BorderSide(
                                    color: kGoldLight.withValues(alpha: 0.50)),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(3)),
                                ),
                                child: Text('LOG IN', style: GoogleFonts.jost(
                                  fontSize: 11, fontWeight: FontWeight.w400,
                                  letterSpacing: 2.2,
                                  color: context.appOnSurface.withValues(
                                    alpha: 0.70),
                                )),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),
                      _SectionHeader(title: 'Benefits'),
                      const SizedBox(height: 14),
                      const _BenefitRow(
                        icon: Icons.bookmark_outline_rounded,
                        title: 'Save Favourites',
                        subtitle: 'Bookmark airports and restaurants for quick access',
                      ),
                      const SizedBox(height: 10),
                      const _BenefitRow(
                        icon: Icons.notifications_none_rounded,
                        title: 'Flight Alerts',
                        subtitle: 'Get notified when dining options change at your airport',
                      ),
                      const SizedBox(height: 10),
                      const _BenefitRow(
                        icon: Icons.star_outline_rounded,
                        title: 'Personalised Picks',
                        subtitle: 'Recommendations based on your preferences',
                      ),
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
        colors: [Colors.transparent, kGoldLight.withValues(alpha: 0.28),
          context.appOnSurface.withValues(alpha: 0.08), Colors.transparent],
        stops: const [0.0, 0.3, 0.7, 1.0],
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
//  OPTION ROW  (My Account items)
// ─────────────────────────────────────────────────────────────
class _OptionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _OptionRow({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: appCardSurface(context),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
            boxShadow: [BoxShadow(
              color: context.appOnSurface.withValues(alpha: 0.06),
              blurRadius: 8, offset: const Offset(0, 2),
            )],
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: kTeal.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Icon(icon, color: kTeal, size: 17),
              ),
              const SizedBox(width: 14),
              Expanded(child: Text(label, style: GoogleFonts.jost(
                fontSize: 14, fontWeight: FontWeight.w400,
                color: context.appOnSurface,
              ))),
              Icon(Icons.chevron_right_rounded,
                size: 16, color: context.appMutedFg(0.35)),
            ],
          ),
        ),
      );
}

// ─────────────────────────────────────────────────────────────
//  SETTINGS ROW  (settings / management items)
// ─────────────────────────────────────────────────────────────
class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final bool danger;
  final VoidCallback? onTap;
  const _SettingsRow({
    required this.icon, required this.label,
    this.subtitle, this.danger = false, this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final iconColor = danger ? Colors.red.shade400 : kTeal;
    final iconBg    = danger
        ? Colors.red.shade400.withValues(alpha: 0.10)
        : kTeal.withValues(alpha: 0.10);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(
            color: danger
                ? Colors.red.shade400.withValues(alpha: 0.18)
                : kGoldLight.withValues(alpha: 0.28),
          ),
          boxShadow: [BoxShadow(
            color: context.appOnSurface.withValues(alpha: 0.05),
            blurRadius: 6, offset: const Offset(0, 1),
          )],
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: iconBg, borderRadius: BorderRadius.circular(3)),
              child: Icon(icon, color: iconColor, size: 17),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: GoogleFonts.jost(
                    fontSize: 14, fontWeight: FontWeight.w400,
                    color: danger ? Colors.red.shade400 : context.appOnSurface,
                  )),
                  if (subtitle != null) ...[
                    const SizedBox(height: 1),
                    Text(subtitle!, style: GoogleFonts.jost(
                      fontSize: 11, fontWeight: FontWeight.w400,
                      color: context.appMutedFg(0.42), letterSpacing: 0.2,
                    )),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
              size: 16,
              color: context.appMutedFg(danger ? 0.40 : 0.35)),
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
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: appCardSurface(context),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: kGoldLight.withValues(alpha: 0.28)),
          boxShadow: [BoxShadow(
            color: context.appOnSurface.withValues(alpha: 0.06),
            blurRadius: 8, offset: const Offset(0, 2),
          )],
        ),
        child: Row(
          children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: kTeal.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Icon(icon, color: kTeal, size: 18),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.jost(
                    fontSize: 15, fontWeight: FontWeight.w400,
                    color: context.appOnSurface,
                  )),
                  const SizedBox(height: 2),
                  Text(subtitle, style: GoogleFonts.jost(
                    fontSize: 12, fontWeight: FontWeight.w400,
                    color: context.appMutedFg(0.44),
                  )),
                ],
              ),
            ),
          ],
        ),
      );
}

// ─────────────────────────────────────────────────────────────
//  SECTION HEADER
// ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Text(title, style: GoogleFonts.cormorant(
            fontSize: 22, fontWeight: FontWeight.w400,
            color: context.appOnSurface, letterSpacing: 0.2,
          )),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              height: 1,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [kGoldLight.withValues(alpha: 0.28), Colors.transparent],
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          Transform.rotate(
            angle: math.pi / 4,
            child: Container(
              width: 4, height: 4,
              color: kGoldLight.withValues(alpha: 0.6),
            ),
          ),
        ],
      );
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND
// ─────────────────────────────────────────────────────────────
class _Background extends StatelessWidget {
  const _Background();
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

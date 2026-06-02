import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:image_picker/image_picker.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

class AuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final GoogleSignIn _googleSignIn = GoogleSignIn();

  static User? get currentUser => _auth.currentUser;
  static Stream<User?> get authStateChanges => _auth.authStateChanges();

  // Emits on profile updates (displayName, photoURL) in addition to sign-in/out.
  static Stream<User?> get userChanges => _auth.userChanges();

  // ── Sign up / Sign in ──────────────────────────────────────────────────────

  static Future<UserCredential?> signUpWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    try {
      return await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<UserCredential?> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    try {
      return await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<UserCredential?> signInWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return null;
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      return await _auth.signInWithCredential(credential);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    } catch (e) {
      throw 'Google sign-in failed: $e';
    }
  }

  static Future<void> signOut() async {
    try {
      await Future.wait<void>([_auth.signOut(), _googleSignIn.signOut()]);
    } catch (e) {
      throw 'Sign out failed: $e';
    }
  }

  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // ── Profile updates ────────────────────────────────────────────────────────

  static Future<void> updateDisplayName(String name) async {
    try {
      await _auth.currentUser?.updateDisplayName(name.trim());
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> sendEmailVerification() async {
    try {
      await _auth.currentUser?.sendEmailVerification();
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // Requires firebase_storage to be enabled in Firebase console.
  // iOS: add NSPhotoLibraryUsageDescription + NSCameraUsageDescription to Info.plist.
  static Future<void> uploadProfilePhoto(XFile image) async {
    try {
      final user = _auth.currentUser;
      if (user == null) throw 'Not signed in';
      final ref = FirebaseStorage.instance.ref('profile_photos/${user.uid}.jpg');
      final bytes = await image.readAsBytes();
      await ref.putData(bytes, SettableMetadata(contentType: 'image/jpeg'));
      final url = await ref.getDownloadURL();
      await user.updatePhotoURL(url);
    } on FirebaseException catch (e) {
      throw 'Failed to upload photo: ${e.message}';
    }
  }

  static Future<void> removeProfilePhoto() async {
    try {
      await _auth.currentUser?.updatePhotoURL(null);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // ── Re-authentication ──────────────────────────────────────────────────────

  static Future<void> reauthenticateWithPassword(String password) async {
    try {
      final user = _auth.currentUser;
      if (user?.email == null) throw 'No email on account';
      final cred = EmailAuthProvider.credential(email: user!.email!, password: password);
      await user.reauthenticateWithCredential(cred);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> reauthenticateWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) throw 'Google sign-in was cancelled';
      final googleAuth = await googleUser.authentication;
      final cred = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      await _auth.currentUser?.reauthenticateWithCredential(cred);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> reauthenticateWithApple() async {
    try {
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
      );
      final cred = OAuthProvider('apple.com').credential(
        idToken: appleCredential.identityToken,
        accessToken: appleCredential.authorizationCode,
      );
      await _auth.currentUser?.reauthenticateWithCredential(cred);
    } on SignInWithAppleAuthorizationException catch (e) {
      throw 'Apple sign-in failed: ${e.message}';
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // ── Sensitive account updates (re-auth handled internally) ────────────────

  // Sends a verification email to newEmail; the change takes effect when clicked.
  static Future<void> updateEmail(String newEmail, String currentPassword) async {
    try {
      await reauthenticateWithPassword(currentPassword);
      await _auth.currentUser?.verifyBeforeUpdateEmail(newEmail.trim());
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> updatePassword(String currentPassword, String newPassword) async {
    try {
      await reauthenticateWithPassword(currentPassword);
      await _auth.currentUser?.updatePassword(newPassword);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // ── Provider linking ───────────────────────────────────────────────────────

  static List<String> getLinkedProviderIds() =>
      _auth.currentUser?.providerData.map((p) => p.providerId).toList() ?? [];

  static Future<void> linkWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) throw 'Google sign-in was cancelled';
      final googleAuth = await googleUser.authentication;
      final cred = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      await _auth.currentUser?.linkWithCredential(cred);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> linkWithApple() async {
    try {
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
      );
      final cred = OAuthProvider('apple.com').credential(
        idToken: appleCredential.identityToken,
        accessToken: appleCredential.authorizationCode,
      );
      await _auth.currentUser?.linkWithCredential(cred);
    } on SignInWithAppleAuthorizationException catch (e) {
      throw 'Apple sign-in failed: ${e.message}';
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<void> unlinkProvider(String providerId) async {
    try {
      await _auth.currentUser?.unlink(providerId);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // ── Account lifecycle ──────────────────────────────────────────────────────

  // Re-authenticates using the appropriate provider before deletion.
  static Future<void> deleteAccount({String? password}) async {
    try {
      final user = _auth.currentUser;
      if (user == null) return;
      final providers = user.providerData.map((p) => p.providerId).toList();

      if (password != null && providers.contains('password')) {
        await reauthenticateWithPassword(password);
      } else if (providers.contains('google.com')) {
        await reauthenticateWithGoogle();
      } else if (providers.contains('apple.com')) {
        await reauthenticateWithApple();
      }

      try {
        await FirebaseFirestore.instance.collection('users').doc(user.uid).delete();
      } catch (_) {}

      await user.delete();
      await _googleSignIn.signOut();
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  static Future<String> exportUserData() async {
    final user = _auth.currentUser;
    if (user == null) throw 'Not signed in';
    final data = <String, dynamic>{
      'account': {
        'uid': user.uid,
        'email': user.email,
        'displayName': user.displayName,
        'emailVerified': user.emailVerified,
        'photoURL': user.photoURL,
        'createdAt': user.metadata.creationTime?.toIso8601String(),
        'linkedProviders': user.providerData.map((p) => p.providerId).toList(),
      },
    };
    try {
      final doc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      if (doc.exists) data['preferences'] = doc.data() ?? {};
    } catch (_) {}
    return const JsonEncoder.withIndent('  ').convert(data);
  }

  // ── Error handling ─────────────────────────────────────────────────────────

  static String _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No user found with this email address.';
      case 'wrong-password':
      case 'invalid-credential':
        return 'Incorrect password. Please try again.';
      case 'email-already-in-use':
        return 'An account already exists with this email address.';
      case 'weak-password':
        return 'Password must be at least 6 characters.';
      case 'invalid-email':
        return 'The email address is not valid.';
      case 'user-disabled':
        return 'This account has been disabled.';
      case 'too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'operation-not-allowed':
        return 'This operation is not allowed.';
      case 'network-request-failed':
        return 'Network error. Please check your connection.';
      case 'requires-recent-login':
        return 'Please sign in again before making this change.';
      case 'credential-already-in-use':
        return 'This account is already linked to another user.';
      case 'provider-already-linked':
        return 'This provider is already linked to your account.';
      case 'no-such-provider':
        return 'This provider is not linked to your account.';
      default:
        return 'Authentication failed: ${e.message}';
    }
  }
}

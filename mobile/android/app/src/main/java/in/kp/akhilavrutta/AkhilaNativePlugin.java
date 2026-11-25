package in.kp.akhilavrutta;

import android.accounts.Account;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.util.Collections;
import java.security.SecureRandom;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Akhila Vrutta's own native side.
 *  googleSignIn  Android's Google account picker (Credential Manager) gives a Google ID token, which the web
 *                code turns into a Firebase sign-in. Google doesn't allow its sign-in page inside an app.
 *  googleAccess  a Google access token for one more permission (Drive's "files this app made").
 *  bio*          a 32-byte secret kept encrypted under an Android Keystore key that only a strong fingerprint
 *                opens (never the phone's PIN), and that Android deletes when a fingerprint is added. The web
 *                code wraps the data key with this secret; the secret itself never leaves memory unencrypted.
 *  saveFile      a decrypted copy of a vault file into Downloads/Akhila Vrutta (Android 10 and newer).
 *  appCheckToken a Firebase App Check token from Google Play Integrity, for the web code's Firebase calls.
 *  shareFile     Android's share sheet for a decrypted copy, kept in the app's cache only until the next share
 *                or the next start.
 */
@CapacitorPlugin(name = "AkhilaNative", requestCodes = { AkhilaNativePlugin.AUTH_REQ })
public class AkhilaNativePlugin extends Plugin {
    private static final String KEY = "akhila_bio_v1";
    private static final String PREFS = "akhila_bio";
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    /* ---------- Google sign-in ---------- */

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = call.getString("serverClientId");
        if (clientId == null || clientId.isEmpty()) { call.reject("No Google client id", "config"); return; }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager cm = CredentialManager.create(getContext());
        cm.getCredentialAsync(getActivity(), request, new CancellationSignal(), ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse r) {
                    Credential c = r.getCredential();
                    if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                        try {
                            GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(c.getData());
                            JSObject o = new JSObject();
                            o.put("idToken", g.getIdToken());
                            call.resolve(o);
                        } catch (Exception e) { call.reject("Couldn't read the Google sign-in", "error", e); }
                    } else call.reject("Unexpected sign-in type", "error");
                }
                @Override public void onError(@NonNull GetCredentialException e) {
                    call.reject(e.getMessage() == null ? "Sign-in didn't finish" : e.getMessage(), e instanceof GetCredentialCancellationException ? "cancelled" : "error");
                }
            });
    }

    /* ---------- access to one more Google permission (Drive) ---------- */

    static final int AUTH_REQ = 4711;
    private PluginCall authCall;

    /** A Google access token for `scope` on `account` (asks the first time, on Android's own screen). */
    @PluginMethod
    public void googleAccess(PluginCall call) {
        String scope = call.getString("scope"), account = call.getString("account");
        if (scope == null) { call.reject("No scope", "config"); return; }
        AuthorizationRequest.Builder b = AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(scope)));
        if (account != null && !account.isEmpty()) b.setAccount(new Account(account, "com.google"));
        Identity.getAuthorizationClient(getActivity()).authorize(b.build())
            .addOnSuccessListener((AuthorizationResult r) -> {
                if (r.hasResolution() && r.getPendingIntent() != null) {
                    authCall = call;
                    try {
                        getActivity().startIntentSenderForResult(r.getPendingIntent().getIntentSender(), AUTH_REQ, null, 0, 0, 0);
                    } catch (IntentSender.SendIntentException e) { authCall = null; call.reject("Couldn't ask for access", "error", e); }
                } else token(call, r);
            })
            .addOnFailureListener((e) -> call.reject(e.getMessage() == null ? "Google didn't give access" : e.getMessage(), "error", e));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != AUTH_REQ || authCall == null) return;
        PluginCall call = authCall;
        authCall = null;
        if (resultCode != Activity.RESULT_OK) { call.reject("Cancelled", "cancelled"); return; }
        try { token(call, Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data)); }
        catch (Exception e) { call.reject("Google didn't give access", "error", e); }
    }

    private static void token(PluginCall call, AuthorizationResult r) {
        if (r.getAccessToken() == null) { call.reject("Google didn't give access", "error"); return; }
        JSObject o = new JSObject();
        o.put("accessToken", r.getAccessToken());
        call.resolve(o);
    }

    /* ---------- fingerprint key ---------- */

    @PluginMethod
    public void bioAvailable(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", BiometricManager.from(getContext()).canAuthenticate(STRONG) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(o);
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static KeyStore keystore() throws Exception { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); return ks; }

    private static SecretKey newKey() throws Exception {
        KeyStore ks = keystore();
        if (ks.containsAlias(KEY)) ks.deleteEntry(KEY);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(b.build());
        return kg.generateKey();
    }

    private void forget() {
        try { keystore().deleteEntry(KEY); } catch (Exception ignored) { }
        prefs().edit().clear().apply();
    }

    private interface OnCipher { void run(Cipher c) throws Exception; }

    private void prompt(PluginCall call, Cipher cipher, String subtitle, OnCipher done) {
        getActivity().runOnUiThread(() -> {
            Executor ex = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt bp = new BiometricPrompt((FragmentActivity) getActivity(), ex, new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                    try { done.run(r.getCryptoObject().getCipher()); } catch (Exception e) { call.reject("Fingerprint unlock failed", "error", e); }
                }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                    boolean cancel = code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_CANCELED;
                    call.reject(msg.toString(), cancel ? "cancelled" : "error");
                }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Akhila Vrutta").setSubtitle(subtitle)
                .setNegativeButtonText("Use passphrase").setAllowedAuthenticators(STRONG).build();
            bp.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    /** Makes the key and the secret (after a fingerprint) and returns the secret. */
    @PluginMethod
    public void bioEnroll(PluginCall call) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, newKey());
            prompt(call, c, "Touch the sensor to turn on fingerprint unlock", (ci) -> {
                byte[] secret = new byte[32];
                new SecureRandom().nextBytes(secret);
                byte[] ct = ci.doFinal(secret);
                prefs().edit().putString("iv", b64(ci.getIV())).putString("ct", b64(ct)).apply();
                JSObject o = new JSObject();
                o.put("secret", b64(secret));
                java.util.Arrays.fill(secret, (byte) 0);
                call.resolve(o);
            });
        } catch (Exception e) { call.reject("Fingerprint unlock can't be set up on this phone", "error", e); }
    }

    /** Asks for a fingerprint and returns the secret. "changed": a fingerprint was added, the key is gone. */
    @PluginMethod
    public void bioSecret(PluginCall call) {
        String iv = prefs().getString("iv", null), ct = prefs().getString("ct", null);
        try {
            SecretKey k = (SecretKey) keystore().getKey(KEY, null);
            if (k == null || iv == null || ct == null) { forget(); call.reject("Fingerprint isn't set up on this phone", "missing"); return; }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, unb64(iv)));
            prompt(call, c, "Touch the sensor", (ci) -> {
                JSObject o = new JSObject();
                o.put("secret", b64(ci.doFinal(unb64(ct))));
                call.resolve(o);
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            forget();
            call.reject("A fingerprint was added to this phone", "changed");
        } catch (Exception e) { call.reject("Fingerprint unlock failed", "error", e); }
    }

    @PluginMethod
    public void bioForget(PluginCall call) { forget(); call.resolve(); }

    private static String b64(byte[] b) { return Base64.encodeToString(b, Base64.NO_WRAP); }
    private static byte[] unb64(String s) { return Base64.decode(s, Base64.NO_WRAP); }

    /* ---------- a vault file out of the app: saved to Downloads, or shared ---------- */

    static final String FOLDER = "Akhila Vrutta";
    /** File names safe for Android: no slashes or control characters, not empty. */
    static String safeName(String n) {
        String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return s.isEmpty() ? "file" : s;
    }
    private File shareDir() { return new File(getContext().getCacheDir(), "share"); }
    /** Shared copies are removed at the next share and when the app starts. */
    void clearShared() {
        File[] old = shareDir().listFiles();
        if (old != null) for (File f : old) f.delete();
    }
    @Override public void load() { clearShared(); }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = safeName(call.getString("name")), mime = call.getString("mime", "application/octet-stream"), data = call.getString("data");
        if (data == null) { call.reject("No file", "error"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("Saving to Downloads needs Android 10 or newer. Use Share instead.", "old"); return; }
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("Android didn't make the file");
            try (OutputStream o = cr.openOutputStream(uri)) { o.write(Base64.decode(data, Base64.DEFAULT)); }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            JSObject r = new JSObject();
            r.put("folder", Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
            call.resolve(r);
        } catch (Exception e) {
            if (uri != null) cr.delete(uri, null, null);
            call.reject(e.getMessage() == null ? "Couldn't save the file" : e.getMessage(), "error", e);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = safeName(call.getString("name")), mime = call.getString("mime", "application/octet-stream"), data = call.getString("data");
        if (data == null) { call.reject("No file", "error"); return; }
        try {
            clearShared();
            File dir = shareDir();
            dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(data, Base64.DEFAULT)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Couldn't share the file" : e.getMessage(), "error", e);
        }
    }

    /* ---------- Firebase App Check (Play Integrity) ---------- */

    private FirebaseApp appCheckApp(String appId, String apiKey, String projectId) {
        for (FirebaseApp a : FirebaseApp.getApps(getContext())) if ("appcheck".equals(a.getName())) return a;
        FirebaseOptions o = new FirebaseOptions.Builder().setApplicationId(appId).setApiKey(apiKey).setProjectId(projectId).build();
        FirebaseApp app = FirebaseApp.initializeApp(getContext(), o, "appcheck");
        FirebaseAppCheck.getInstance(app).installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance());
        return app;
    }

    @PluginMethod
    public void appCheckToken(PluginCall call) {
        String appId = call.getString("appId"), apiKey = call.getString("apiKey"), projectId = call.getString("projectId");
        if (appId == null || apiKey == null || projectId == null) { call.reject("App Check isn't set up in this build", "config"); return; }
        try {
            FirebaseAppCheck.getInstance(appCheckApp(appId, apiKey, projectId)).getAppCheckToken(false)
                .addOnSuccessListener(t -> { JSObject r = new JSObject(); r.put("token", t.getToken()); r.put("expires", t.getExpireTimeMillis()); call.resolve(r); })
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "App Check failed" : e.getMessage(), "error", e));
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "App Check failed" : e.getMessage(), "error", e);
        }
    }
}

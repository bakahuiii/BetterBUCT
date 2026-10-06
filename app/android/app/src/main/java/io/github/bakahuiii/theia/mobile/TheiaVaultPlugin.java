package io.github.bakahuiii.theia.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private vault whose values are encrypted with a non-exportable Android Keystore key. */
@CapacitorPlugin(name = "TheiaVault")
public class TheiaVaultPlugin extends Plugin {
    private static final String PREFS_NAME = "theia_secure_vault_v1";
    private static final String KEY_ALIAS = "theia-vault-aes-gcm-v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey secretKey() throws Exception {
        return secretKey(getContext());
    }

    private static SecretKey secretKey(Context context) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    /** Read one encrypted vault value for another native plugin without
     * routing its plaintext through the Capacitor JS bridge. */
    public static String readStoredSecret(Context context, String key) throws Exception {
        if (context == null || key == null || key.isEmpty()) return null;
        String packed = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(key, null);
        if (packed == null) return null;
        int separator = packed.indexOf('.');
        if (separator <= 0 || separator == packed.length() - 1) throw new IllegalArgumentException("invalid encrypted record");
        byte[] iv = Base64.decode(packed.substring(0, separator), Base64.DEFAULT);
        byte[] encrypted = Base64.decode(packed.substring(separator + 1), Base64.DEFAULT);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(context), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    public static void writeStoredSecret(Context context, String key, String value) throws Exception {
        if (context == null || key == null || key.isEmpty() || value == null) throw new IllegalArgumentException("invalid secure record");
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(context));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(key, packed).commit()) {
            throw new IllegalStateException("secure preferences commit failed");
        }
    }

    public static void removeStoredSecret(Context context, String key) {
        if (context == null || key == null || key.isEmpty()) return;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().remove(key).commit();
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("安全存储需要 key 和 value");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            if (!preferences().edit().putString(key, packed).commit()) {
                throw new IllegalStateException("secure preferences commit failed");
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("设备安全存储写入失败");
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("安全存储需要 key");
            return;
        }
        try {
            String packed = preferences().getString(key, null);
            JSObject result = new JSObject();
            result.put("exists", packed != null);
            if (packed != null) {
                result.put("value", readStoredSecret(getContext(), key));
            } else {
                result.put("value", (String) null);
            }
            call.resolve(result);
        } catch (Exception error) {
            // Never erase an unreadable record here; the user may still recover it after a transient Keystore issue.
            call.reject("设备安全存储读取失败");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("安全存储需要 key");
            return;
        }
        if (!preferences().edit().remove(key).commit()) {
            call.reject("设备安全存储删除失败");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void keys(PluginCall call) {
        Set<String> stored = preferences().getAll().keySet();
        JSObject result = new JSObject();
        result.put("keys", new ArrayList<>(stored));
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!preferences().edit().clear().commit()) {
            call.reject("设备安全存储清理失败");
            return;
        }
        call.resolve();
    }
}

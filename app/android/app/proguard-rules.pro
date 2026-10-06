# BetterBUCT Android ProGuard 规则

# ─────────────────────────────────────────────────────────────────────
# 基础配置
# ─────────────────────────────────────────────────────────────────────

# 保留行号信息，用于调试崩溃堆栈
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# 保留注解
-keepattributes *Annotation*

# 保留泛型签名
-keepattributes Signature

# 保留异常信息
-keepattributes Exceptions

# ─────────────────────────────────────────────────────────────────────
# Capacitor 框架
# ─────────────────────────────────────────────────────────────────────

# 保留所有 Capacitor Plugin 类
-keep class com.getcapacitor.** { *; }
-keepclassmembers class com.getcapacitor.** { *; }

# 保留所有标注了 @CapacitorPlugin 的类
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# 保留所有标注了 @PluginMethod 的方法
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}

# 保留 JavaScript Bridge 接口
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─────────────────────────────────────────────────────────────────────
# BetterBUCT 自定义插件
# ─────────────────────────────────────────────────────────────────────

# 保留所有自定义 Plugin 类（TheiaSessionPlugin, TheiaVaultPlugin 等）
-keep class io.github.bakahuiii.theia.mobile.Theia**Plugin { *; }
-keep class io.github.bakahuiii.theia.mobile.Theia**Worker { *; }
-keep class io.github.bakahuiii.theia.mobile.MainActivity { *; }
-keep class io.github.bakahuiii.theia.mobile.RestrictedLoginActivity { *; }

# ─────────────────────────────────────────────────────────────────────
# Android WebView
# ─────────────────────────────────────────────────────────────────────

# 保留 WebView 相关类
-keep class android.webkit.** { *; }
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(android.webkit.WebView, java.lang.String);
}

# ─────────────────────────────────────────────────────────────────────
# AndroidX 和 Support 库
# ─────────────────────────────────────────────────────────────────────

-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# WorkManager
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context,androidx.work.WorkerParameters);
}

# ─────────────────────────────────────────────────────────────────────
# JSON 序列化（如果使用 Gson 或其他 JSON 库）
# ─────────────────────────────────────────────────────────────────────

# 保留所有 JSON 数据类（根据实际使用调整）
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ─────────────────────────────────────────────────────────────────────
# Kotlin（如果使用 Kotlin）
# ─────────────────────────────────────────────────────────────────────

-dontwarn kotlin.**
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings {
    <fields>;
}

# ─────────────────────────────────────────────────────────────────────
# 移除日志（可选，生产环境推荐）
# ─────────────────────────────────────────────────────────────────────

# 移除 Log.v, Log.d, Log.i 调用，保留 Log.w 和 Log.e
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# ─────────────────────────────────────────────────────────────────────
# 原生库
# ─────────────────────────────────────────────────────────────────────

-keepclasseswithmembernames class * {
    native <methods>;
}

# ─────────────────────────────────────────────────────────────────────
# 枚举
# ─────────────────────────────────────────────────────────────────────

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ─────────────────────────────────────────────────────────────────────
# Parcelable
# ─────────────────────────────────────────────────────────────────────

-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# ─────────────────────────────────────────────────────────────────────
# 反射
# ─────────────────────────────────────────────────────────────────────

-keepclassmembers class * {
    void *(**On*Event);
    void *(**On*Listener);
}

# ─────────────────────────────────────────────────────────────────────
# 优化选项
# ─────────────────────────────────────────────────────────────────────

# 允许优化，但禁用某些会破坏 WebView 的优化
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

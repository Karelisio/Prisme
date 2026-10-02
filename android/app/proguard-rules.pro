# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Prisme : traces d'erreur lisibles dans le journal de l'écran Diagnostic (sans fichier de correspondance).
-keepattributes SourceFile,LineNumberTable
-keepnames class io.karelisio.prisme.** { *; }

# Capacitor s'appuie sur la réflexion (plugins chargés par nom, annotations, rappels par nom) :
# ses classes restent intactes, seul le reste de l'app est optimisé.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }

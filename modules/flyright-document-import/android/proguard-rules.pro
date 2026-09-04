# PdfBox-Android loads fonts and CMaps reflectively from its bundled assets;
# release builds shrink with R8 (expo-build-properties), so keep it whole.
-keep class com.tom_roush.** { *; }
-dontwarn com.tom_roush.**

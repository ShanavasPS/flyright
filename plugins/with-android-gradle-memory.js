const { withGradleProperties } = require('expo/config-plugins');

/**
 * Give Gradle enough heap to run R8.
 *
 * `npx expo prebuild` writes `org.gradle.jvmargs=-Xmx2048m`, and R8 runs out
 * of memory on this app's release build at that size — reliably when anything
 * else heavy (an Xcode compile, a second emulator) is running alongside. It
 * used to be a manual edit re-applied after every prebuild, which is exactly
 * the kind of step that gets forgotten: android/ is generated and gitignored,
 * so the fix never survived. SDK 58 turns R8 on by default in release builds,
 * so this now matters for anyone who runs one, not only for our own release.
 *
 * Debug builds do not run R8 and do not use the extra heap — the JVM only
 * commits what it needs, so the ceiling costs nothing when it isn't reached.
 */
const JVM_ARGS = '-Xmx8g -XX:MaxMetaspaceSize=1g';

module.exports = function withAndroidGradleMemory(config) {
  return withGradleProperties(config, config => {
    const properties = config.modResults;
    const existing = properties.find(item => item.type === 'property' && item.key === 'org.gradle.jvmargs');
    if (existing) existing.value = JVM_ARGS;
    else properties.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return config;
  });
};

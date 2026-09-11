const { withAndroidManifest } = require('expo/config-plugins');

// Expo's template ships android:allowBackup="true", which puts the app's
// private files — the SQLite journal with booking references, seats and
// notes, and the key-value store — into Google's device backup. The journal
// syncs to the account anyway (and a signed-out journal is meant to stay on
// the phone), so nothing is lost by opting out, and a booking reference is
// enough to manage someone's flight on most airline sites. Off, and the
// Android 12+ data-extraction rules say the same for cloud and transfer.
module.exports = function withAndroidNoBackup(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:allowBackup'] = 'false';
      delete app.$['android:fullBackupContent'];
      delete app.$['android:dataExtractionRules'];
    }
    return mod;
  });
};

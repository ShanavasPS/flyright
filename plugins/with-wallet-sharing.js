/* global __dirname */
const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;

/** Keep Expo's extension target and App Group setup, with a receiver that
 * understands Wallet attachments and bounds/copies them before handing off. */
module.exports = config => withFinalizedMod(config, ['ios', async config => {
  fs.copyFileSync(
    path.join(__dirname, 'wallet-sharing', 'ShareIntoViewController.swift'),
    path.join(config.modRequest.platformProjectRoot, 'expo-sharing-extension', 'ShareIntoViewController.swift'),
  );
  const infoPath = path.join(config.modRequest.platformProjectRoot, 'expo-sharing-extension', 'Info.plist');
  const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  info.CFBundleDisplayName = 'FlyRight';
  fs.writeFileSync(infoPath, plist.build(info));
  return config;
}]);

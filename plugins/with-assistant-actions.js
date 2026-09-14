/* global __dirname */
const { IOSConfig, withXcodeProject, withAppDelegate } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/** Native App Intents on SDK 57, without pulling Expo 58's App Intents wrapper.
 * These sources belong to the app target, not the existing widget or share target. */
module.exports = config => {
  config = withXcodeProject(config, config => {
    const name = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const filename = 'FlyRightAppIntents.swift';
    fs.copyFileSync(path.join(__dirname, 'assistant', filename), path.join(config.modRequest.platformProjectRoot, name, filename));
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${name}/${filename}`,
      groupName: name,
      project: config.modResults,
    });
    return config;
  });
  return withAppDelegate(config, config => {
    const refresh = '    FlyRightShortcuts.updateAppShortcutParameters()';
    if (!config.modResults.contents.includes(refresh)) {
      const anchor = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
      if (!config.modResults.contents.includes(anchor)) throw new Error('Cannot register FlyRight shortcuts: Expo AppDelegate launch method has changed.');
      config.modResults.contents = config.modResults.contents.replace(anchor, `${refresh}\n\n${anchor}`);
    }
    return config;
  });
};

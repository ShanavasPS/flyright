const { withPodfile } = require('expo/config-plugins');

// Pod::Project hands out UUIDs from a fast sequential counter with no collision
// checks. When a CocoaPods hook creates objects late in the install (Clerk's
// spm_dependency adding the clerk-ios Swift package in post_install), the counter
// can restart and reuse the ROOT OBJECT's UUID — the PBXProject entry gets
// overwritten and every build dies with "The project 'Pods' is damaged"
// (surfacing as "no such module ..." because no pod targets build at all).
// Collision-checked random UUIDs make late object creation safe. Same approach
// as expo-modules-autolinking's own fix, which applies too late for this case.
const PATCH = `# Injected by plugins/with-pods-uuid-fix.js — see that file for the full story.
class Pod::Project
  def generate_available_uuid_list(count = 100)
    new_uuids = (0..count).map { SecureRandom.hex(12).upcase }
    uniques = new_uuids.reject { |u| objects_by_uuid.key?(u) || @generated_uuids.include?(u) }
    @generated_uuids += uniques
    @available_uuids += uniques
  end
end

`;

module.exports = function withPodsUuidFix(config) {
  return withPodfile(config, (config) => {
    const anchor = 'prepare_react_native_project!';
    if (!config.modResults.contents.includes('with-pods-uuid-fix')) {
      config.modResults.contents = config.modResults.contents.replace(anchor, PATCH + anchor);
    }
    return config;
  });
};

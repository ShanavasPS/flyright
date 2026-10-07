import { Picker } from '@expo/ui';
import { Host } from '@expo/ui/swift-ui';
import { dynamicTypeSize } from '@expo/ui/swift-ui/modifiers';

import type { OptionPickerProps } from './option-picker';

/** iOS: the native SwiftUI menu picker, as option-picker.tsx describes. The
 * universal Host is this SwiftUI Host on iOS; importing it directly lets it
 * take a modifier. SwiftUI follows Dynamic Type on its own and ignores the
 * 1.5x text cap, so at the accessibility sizes the picker grew until it
 * crushed its row's label to one letter per line. xxxLarge (about 1.35x) is
 * the last SwiftUI size under the cap.
 *
 * The Host ignores the container safe area: a hosting view laid out where
 * the tab bar's inset reaches (the Appearance row, at the foot of Settings)
 * otherwise fits its content to the inset-reduced region and draws the menu
 * button half above its own frame (y = −19), while the same picker higher
 * up the page sits right. */
export function OptionPicker<T extends string>({ value, options, onSelect }: OptionPickerProps<T>) {
  return (
    <Host matchContents ignoreSafeArea="container" modifiers={[dynamicTypeSize({ max: 'xxxLarge' })]}>
      <Picker
        selectedValue={value}
        onValueChange={(selected) => onSelect(selected as T)}>
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}

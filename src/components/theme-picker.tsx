import { Host, Picker } from '@expo/ui';

import type { ThemePreference } from '@/services/theme';

export type ThemePickerProps = {
  value: ThemePreference;
  options: { value: ThemePreference; label: string }[];
  onSelect: (value: ThemePreference) => void;
};

/** iOS: a native SwiftUI menu picker — compact at every window width (the old
 * inline segmented control collided with the label in narrow iPad windows,
 * App Review Guideline 4). Android uses theme-picker.android.tsx: the
 * universal Picker's M3 dropdown anchors on an uncontrolled TextField whose
 * label goes stale when selecting a theme re-renders the whole tree. */
export function ThemePicker({ value, options, onSelect }: ThemePickerProps) {
  return (
    <Host matchContents>
      <Picker
        selectedValue={value}
        onValueChange={(selected) => onSelect(selected as ThemePreference)}>
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}

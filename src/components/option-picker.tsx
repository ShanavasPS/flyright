import { Host, Picker } from '@expo/ui';

export type OptionPickerProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
};

/** A compact single-choice menu for a Settings row (theme, trip visibility).
 * iOS: a native SwiftUI menu picker — compact at every window width (the old
 * inline segmented control collided with the label in narrow iPad windows,
 * App Review Guideline 4). Android uses option-picker.android.tsx: the
 * universal Picker's M3 dropdown anchors on an uncontrolled TextField whose
 * label goes stale when selecting a theme re-renders the whole tree. */
export function OptionPicker<T extends string>({ value, options, onSelect }: OptionPickerProps<T>) {
  return (
    <Host matchContents>
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

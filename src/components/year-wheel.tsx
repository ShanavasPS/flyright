import { Host, Picker } from '@expo/ui';

export type YearWheelProps = {
  value: number;
  /** Newest first — the order the wheel shows them, top to bottom. */
  years: number[];
  onChange: (year: number) => void;
};

/** iOS: the native rotor — the same wheel the system's own date pickers
 * spin. Android has no wheel in @expo/ui (its Picker falls back to a
 * dropdown), so year-wheel.android.tsx builds one out of a snapping list. */
export function YearWheel({ value, years, onChange }: YearWheelProps) {
  return (
    <Host matchContents>
      <Picker
        appearance="wheel"
        selectedValue={value}
        onValueChange={(picked) => onChange(Number(picked))}
        testID="year-wheel">
        {years.map((y) => (
          <Picker.Item key={y} label={`${y}`} value={y} />
        ))}
      </Picker>
    </Host>
  );
}

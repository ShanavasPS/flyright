import { Picker } from '@expo/ui';
import { Host } from '@expo/ui/swift-ui';
import { dynamicTypeSize } from '@expo/ui/swift-ui/modifiers';

import type { YearWheelProps } from './year-wheel';

/** iOS: the native rotor, as year-wheel.tsx describes, held to xxxLarge
 * (about 1.35x, the last SwiftUI size under the 1.5x text cap) like the
 * option picker: SwiftUI ignores the cap and would outgrow its row. */
export function YearWheel({ value, years, onChange }: YearWheelProps) {
  return (
    <Host matchContents modifiers={[dynamicTypeSize({ max: 'xxxLarge' })]}>
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

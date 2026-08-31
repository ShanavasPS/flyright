import { Host } from '@expo/ui';
import { DropdownMenu, DropdownMenuItem, FilledTonalButton, Text } from '@expo/ui/jetpack-compose';
import { useState } from 'react';

import { useTheme } from '@/hooks/use-theme';

import type { ThemePickerProps } from './theme-picker';

/** Android: a Material 3 dropdown menu behind a tonal button, mirroring the
 * iOS menu picker. Built from the jetpack-compose layer instead of the
 * universal Picker because that one anchors on an uncontrolled TextField
 * whose label is pushed imperatively — it goes stale (or blank, if the view
 * remounts) when selecting a theme re-renders the whole tree. Here the
 * button label is ordinary React state, so it survives the theme flip. */
export function ThemePicker({ value, options, onSelect }: ThemePickerProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const label = options.find((option) => option.value === value)?.label ?? '';

  return (
    <Host matchContents>
      <DropdownMenu
        expanded={expanded}
        onDismissRequest={() => setExpanded(false)}
        color={theme.backgroundElement}>
        <DropdownMenu.Trigger>
          <FilledTonalButton
            onClick={() => setExpanded(true)}
            colors={{ containerColor: theme.backgroundSelected, contentColor: theme.text }}>
            <Text>{label}</Text>
          </FilledTonalButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              elementColors={{ textColor: theme.text }}
              onClick={() => {
                onSelect(option.value);
                setExpanded(false);
              }}>
              <DropdownMenuItem.Text>
                <Text>{option.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

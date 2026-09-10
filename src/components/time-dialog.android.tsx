import { AlertDialog, DateTimePicker, Text, TextButton } from '@expo/ui/jetpack-compose';
import { useRef } from 'react';

import { ComposeHost } from '@/components/compose-host';
import { useTheme } from '@/hooks/use-theme';

import type { TimeDialogProps } from './time-dialog';

/** Android: the Material 3 time picker in a dialog painted from the app
 * palette. Composed here rather than via `TimePickerDialog` because that one
 * (and the community DateTimePicker around it) leaves the dialog surface to
 * Material's neutral tones — a grey panel over navy cards, in both schemes.
 * `AlertDialog` takes a container colour; the picker inside takes the same,
 * and its dial and segments come from the tint. The picker reports every
 * spin; OK commits the last one, Cancel and tapping outside discard it. */
export function TimeDialog({ value, onPick, onDismiss }: TimeDialogProps) {
  const theme = useTheme();
  const selected = useRef(value);
  const buttonColors = { contentColor: theme.tint };
  return (
    <ComposeHost>
      <AlertDialog
        onDismissRequest={onDismiss}
        colors={{ containerColor: theme.backgroundElement, textContentColor: theme.text }}>
        <AlertDialog.Text>
          <DateTimePicker
            initialDate={value.toISOString()}
            displayedComponents="hourAndMinute"
            variant="picker"
            showVariantToggle={false}
            color={theme.tint}
            elementColors={{
              containerColor: theme.backgroundElement,
              clockDialColor: theme.backgroundSelected,
              clockDialUnselectedContentColor: theme.text,
              clockDialSelectedContentColor: '#FFFFFF',
              selectorColor: theme.tint,
              timeSelectorSelectedContainerColor: theme.tint,
              timeSelectorSelectedContentColor: '#FFFFFF',
              timeSelectorUnselectedContainerColor: theme.backgroundSelected,
              timeSelectorUnselectedContentColor: theme.text,
              periodSelectorBorderColor: theme.hairline,
              periodSelectorSelectedContainerColor: theme.tint,
              periodSelectorSelectedContentColor: '#FFFFFF',
              periodSelectorUnselectedContainerColor: theme.backgroundSelected,
              periodSelectorUnselectedContentColor: theme.text,
            }}
            onDateSelected={(picked) => {
              selected.current = picked;
            }}
          />
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton colors={buttonColors} onClick={onDismiss}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton
            colors={buttonColors}
            onClick={() => {
              onPick(selected.current);
              onDismiss();
            }}>
            <Text>OK</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </ComposeHost>
  );
}

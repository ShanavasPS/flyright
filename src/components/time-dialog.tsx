import DateTimePicker from '@expo/ui/community/datetime-picker';

import { useTheme } from '@/hooks/use-theme';

export type TimeDialogProps = {
  /** The clock to open on, as a local Date. */
  value: Date;
  onPick: (picked: Date) => void;
  onDismiss: () => void;
};

/** iOS (and web): the compact inline spinner under the time chips — the
 * caller places it in the card. Android has its own file: a Material time
 * dialog in a themed Compose host. */
export function TimeDialog({ value, onPick, onDismiss }: TimeDialogProps) {
  const theme = useTheme();
  return (
    <DateTimePicker
      value={value}
      mode="time"
      display="spinner"
      presentation="inline"
      accentColor={theme.tint}
      onDismiss={onDismiss}
      onValueChange={(_event, picked) => onPick(picked)}
    />
  );
}

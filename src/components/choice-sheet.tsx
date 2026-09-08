import { useState } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { MenuSheet, type MenuOption } from '@/components/menu-sheet';

/** One way to ask "which of these?": iOS's own action sheet, and the same
 * rows as a bottom sheet (components/menu-sheet) everywhere else — Android's
 * Alert reorders its buttons and stops at three. Render `sheet` once in the
 * screen; call `show` from anywhere in it. */
export function useChoiceSheet() {
  const [open, setOpen] = useState<{ title: string; options: MenuOption[] } | null>(null);
  const show = (title: string, options: MenuOption[]) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...options.map((o) => o.text), 'Cancel'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: options.flatMap((o, i) => (o.destructive ? [i] : [])),
        },
        (index) => options[index]?.onPress(),
      );
      return;
    }
    setOpen({ title, options });
  };
  const sheet = (
    <MenuSheet title={open?.title ?? ''} options={open?.options ?? null} onClose={() => setOpen(null)} />
  );
  return { show, sheet };
}

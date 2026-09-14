import { requireOptionalNativeModule, type NativeModule } from 'expo';

declare class AssistantModule extends NativeModule<{ onAction: () => void }> {
  takePendingAction(): string | null;
}

// Older development binaries and non-Apple platforms have no Siri bridge.
const native = requireOptionalNativeModule<AssistantModule>('FlyRightAssistant');
export const takePendingAssistantAction = () => native?.takePendingAction() ?? null;
export const addAssistantActionListener = (listener: () => void) =>
  native?.addListener('onAction', listener) ?? { remove() {} };

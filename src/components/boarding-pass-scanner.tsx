import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { parseBcbp, type BoardingPass } from '@/services/bcbp';
import { noteSuccess, noteWarning } from '@/services/haptics';

/**
 * Camera viewfinder that reads the IATA BCBP barcode off a boarding pass —
 * PDF417 on printed ones, Aztec/QR on phone and watch screens. Parsing is
 * pure (services/bcbp.ts); this component only owns camera plumbing:
 * permission, continuous-scan debounce, and the not-a-boarding-pass hint.
 */
export function BoardingPassScanner({
  onScan,
  onClose,
}: {
  onScan: (pass: BoardingPass) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [unrecognized, setUnrecognized] = useState(false);
  // onBarcodeScanned refires every frame the code stays in view — hand over
  // exactly once, and don't re-buzz the warning for the same wrong code.
  const doneRef = useRef(false);
  const lastRejectRef = useRef<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => {});
    }
  }, [permission, requestPermission]);

  const handleScan = (data: string) => {
    if (doneRef.current) return;
    const pass = parseBcbp(data);
    if (!pass) {
      if (lastRejectRef.current !== data) {
        lastRejectRef.current = data;
        setUnrecognized(true);
        noteWarning();
      }
      return;
    }
    doneRef.current = true;
    noteSuccess();
    onScan(pass);
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">FlyRight needs the camera to scan</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Point it at any boarding pass — paper or on a screen — and the flight fills
          itself in.
        </ThemedText>
        {!permission.canAskAgain && (
          <Pressable hitSlop={Spacing.two} onPress={() => Linking.openSettings()}>
            <ThemedText type="link">Allow camera access in Settings →</ThemedText>
          </Pressable>
        )}
        <Pressable hitSlop={Spacing.two} onPress={onClose}>
          <ThemedText type="link">Type the flight instead →</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <View style={styles.group} testID="boarding-pass-scanner">
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['aztec', 'qr', 'pdf417', 'datamatrix'] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {unrecognized
          ? "That code isn't a boarding pass — try the one on your pass."
          : 'Point at the barcode on a boarding pass.'}
      </ThemedText>
      <Pressable hitSlop={Spacing.two} onPress={onClose}>
        <ThemedText type="link">Type the flight instead →</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  camera: {
    height: 260,
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  hint: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
});

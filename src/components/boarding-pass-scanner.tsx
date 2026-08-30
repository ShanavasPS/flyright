import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';

import { MicroLabel, PassCard } from '@/components/pass-card';
import { ThemedText } from '@/components/themed-text';
import { COBALT, WHITE_DIM } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { parseBcbp, type BoardingPass } from '@/services/bcbp';
import { noteSuccess, noteWarning } from '@/services/haptics';

/**
 * Camera viewfinder that reads the IATA BCBP barcode off a boarding pass —
 * PDF417 on printed ones, Aztec/QR on phone and watch screens. Parsing is
 * pure (services/bcbp.ts); this component only owns camera plumbing:
 * permission, continuous-scan debounce, and the not-a-boarding-pass hint.
 * Dressed as the same night-sky pass card as the rest of the add-flight flow.
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
  // Ask once per mount: on Android a denial keeps canAskAgain true, so a
  // reactive ask would reopen the system dialog in a loop.
  const askedRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !askedRef.current) {
      askedRef.current = true;
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
      <PassCard>
        <MicroLabel>Scan boarding pass</MicroLabel>
        <ThemedText type="smallBold" style={styles.title}>
          FlyRight needs the camera to scan
        </ThemedText>
        <ThemedText type="small" style={styles.hintText}>
          Point it at any boarding pass — paper or on a screen — and the flight fills
          itself in.
        </ThemedText>
        {!permission.canAskAgain && (
          <Pressable hitSlop={Spacing.two} onPress={() => Linking.openSettings()}>
            <ThemedText type="smallBold" style={styles.link}>
              Allow camera access in Settings →
            </ThemedText>
          </Pressable>
        )}
        <Pressable hitSlop={Spacing.two} onPress={onClose}>
          <ThemedText type="smallBold" style={styles.link}>
            Type the flight instead →
          </ThemedText>
        </Pressable>
      </PassCard>
    );
  }

  return (
    <PassCard testID="boarding-pass-scanner">
      <MicroLabel>Scan boarding pass</MicroLabel>
      {/* No autofocus prop on purpose: the default 'off' is CONTINUOUS
          autofocus (the naming is inverted — 'on' focuses once and locks,
          which blinds the scanner when the pass moves closer).

          iOS gets a ~2x digital zoom: expo-camera opens the bare wide-angle
          lens, which on recent iPhones cannot focus closer than ~20 cm (the
          Camera app's macro trick needs a virtual multi-lens device). Zooming
          lets the barcode fill the frame from a distance the lens can
          actually focus at. zoom maps exponentially (factor = max^zoom), so
          0.25 lands near 2x across devices. */}
      <CameraView
        style={styles.camera}
        zoom={Platform.OS === 'ios' ? 0.25 : 0}
        barcodeScannerSettings={{ barcodeTypes: ['aztec', 'qr', 'pdf417', 'datamatrix'] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />
      <ThemedText type="small" style={[styles.hintText, styles.centered]}>
        {unrecognized
          ? "That code isn't a boarding pass — try the one on your pass."
          : // The long PDF417 stripe on printed passes needs to fill most of
            // the frame; the camera is pre-zoomed so that works from a
            // distance the lens can focus at — getting too close blurs it.
            'Fill the frame with the barcode — no need to get close.'}
      </ThemedText>
      <Pressable hitSlop={Spacing.two} onPress={onClose}>
        <ThemedText type="smallBold" style={[styles.link, styles.centered]}>
          Type the flight instead →
        </ThemedText>
      </Pressable>
    </PassCard>
  );
}

const styles = StyleSheet.create({
  camera: {
    height: 300,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  title: {
    color: '#F2F6FB',
  },
  hintText: {
    color: WHITE_DIM,
  },
  link: {
    color: COBALT,
  },
  centered: {
    textAlign: 'center',
  },
});

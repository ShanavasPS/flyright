import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteTripDocument,
  openTripDocument,
  useTripDocuments,
  type TripDocumentRow,
} from '@/services/trip-documents';

/** The booking document this trip was imported from, when the traveller
 * kept it: one row each, a tap opens it in the system viewer, a long press
 * offers to remove it. Nothing when there is none — the import screen is
 * where a document comes from, not here. */
export function TripDocuments({ journeyId }: { journeyId: string }) {
  const documents = useTripDocuments(journeyId);
  if (!documents?.length) return null;
  return (
    <View style={styles.list}>
      {documents.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </View>
  );
}

function DocumentRow({ doc }: { doc: TripDocumentRow }) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      await openTripDocument(doc);
    } catch {
      Alert.alert('Could not open the document', 'Check your connection and try again.');
    } finally {
      setOpening(false);
    }
  };

  const remove = () =>
    Alert.alert('Remove this document?', 'The trip stays. The document is removed from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteTripDocument(doc.id) },
    ]);

  return (
    <Pressable
      testID={`trip-document-${doc.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Booking document, ${doc.name}. Open`}
      accessibilityHint="Long press to remove it"
      disabled={opening}
      onPress={open}
      onLongPress={remove}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.field }, pressed && styles.pressed]}>
      <View style={[styles.disc, { backgroundColor: `${theme.tint}1A` }]}>
        <SymbolView
          name={
            doc.mimeType === 'application/pdf'
              ? { ios: 'doc.text', android: 'description', web: 'description' }
              : { ios: 'photo', android: 'image', web: 'image' }
          }
          size={15}
          weight="semibold"
          tintColor={theme.tint}
        />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1}>
          Booking document
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {doc.name} · {sizeLabel(doc.size)}
        </ThemedText>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={13}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      )}
    </Pressable>
  );
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: 12,
  },
  pressed: { opacity: 0.7 },
  disc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});

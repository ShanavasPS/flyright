import { useAuth } from '@clerk/expo';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { hasAssistantBoardingPass, isAssistantAction, nextAssistantFlight } from '@/services/assistant-actions';
import { useJourneys } from '@/services/journeys';

export default function AssistantActionRoute() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const { isLoaded, userId } = useAuth();
  useMarkInteractive();

  if (Platform.OS === 'web') return <Redirect href="/check" />;
  if (!isAssistantAction(action)) return <Redirect href="/" />;
  if (!isLoaded) return <AssistantMessage title="Opening FlyRight…" loading />;
  if (action === 'add-flight') return <Redirect href="/add" withAnchor />;

  // A fresh component on identity changes cannot navigate using the last
  // account's live-query result while the replacement query is still loading.
  return <OpenFlight key={userId ?? 'anonymous'} action={action} userId={userId} />;
}

function OpenFlight({ action, userId }: { action: 'next-flight' | 'boarding-pass'; userId: string | null | undefined }) {
  const { data, error } = useJourneys(userId);
  const router = useRouter();
  if (error) throw error;
  if (!data) return <AssistantMessage title="Finding your next flight…" loading />;

  const flight = nextAssistantFlight(data, userId);
  if (!flight) return (
    <AssistantMessage title="No upcoming flight saved" detail="Add your next flight and it will be ready here.">
      <PrimaryButton label="Add a flight" onPress={() => router.replace('/add')} />
    </AssistantMessage>
  );

  if (action === 'boarding-pass') {
    if (hasAssistantBoardingPass(flight)) return (
      <Redirect href={{ pathname: '/boarding-pass', params: { journeyId: flight.id } }} />
    );
    return (
      <AssistantMessage title="No boarding pass saved for your next flight" detail="Open the trip to scan or upload your boarding pass.">
        <PrimaryButton label="Open my flight" onPress={() => router.replace({ pathname: '/journey/[id]', params: { id: flight.id } }, { withAnchor: true })} />
      </AssistantMessage>
    );
  }
  return <Redirect withAnchor href={{ pathname: '/journey/[id]', params: { id: flight.id } }} />;
}

function AssistantMessage({ title, detail, loading, children }: {
  title: string; detail?: string; loading?: boolean; children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'FlyRight', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.content}>
        <Card>
          {loading && <ActivityIndicator accessibilityLabel="Loading" />}
          <ThemedText type="subtitle">{title}</ThemedText>
          {detail && <ThemedText themeColor="textSecondary">{detail}</ThemedText>}
          {children}
          <PrimaryButton label="Flights" onPress={() => router.replace('/')} />
        </Card>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.four, width: '100%', maxWidth: 520, alignSelf: 'center' },
});

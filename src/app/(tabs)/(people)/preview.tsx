import { useLocalSearchParams } from 'expo-router';

import { CirclePreview } from '@/screens/circle-preview';

export default function PreviewRoute() {
  const { memberId, close } = useLocalSearchParams<{ memberId?: string; close?: string }>();
  return <CirclePreview memberId={memberId} close={close === '1'} />;
}

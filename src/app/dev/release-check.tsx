import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

export default function ReleaseCheck() {
  if (!__DEV__) return <Redirect href="/" />;
  return <NativeCheck />;
}

function NativeCheck() {
  const [result, setResult] = useState('Running native photo upgrade checks');
  useEffect(() => {
    let active = true;
    void import('@/dev/photo-upgrade-check').then(module => module.checkNativePhotoUpgrade())
      .then(() => { if (active) setResult('Native photo upgrade checks passed'); })
      .catch(error => { if (active) setResult(`Native photo upgrade checks failed: ${String(error)}`); });
    return () => { active = false; };
  }, []);
  return (
    <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: 'white' }}>
      <Text style={{ color: 'black' }}>{result}</Text>
    </View>
  );
}

import { Stack } from 'expo-router';

export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F6FAFD' },
        animation: 'slide_from_right',
      }}
    />
  );
}

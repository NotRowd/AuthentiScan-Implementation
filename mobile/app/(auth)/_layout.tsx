import {useTheme} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import { Stack } from 'expo-router';

export default function AuthLayout() {
 const {colors:Colors}=useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bgPrimary },
        animation: 'slide_from_bottom',
      }}
    />
  );
}

import {useTheme} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import { Redirect } from 'expo-router';
export default function PaymentMethodScreen() {
 const {colors:Colors}=useTheme();

  return <Redirect href="/checkout" />;
}

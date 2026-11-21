import {useTheme} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import { useRef, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../context/AuthContext';
import { signIn, updatePassword } from '../services/api/firebaseAuth';
import { saveToken, sessionRevision } from '../services/api/session';
import { OFFLINE_MODE } from '../services/api/config';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import AccountLayout,{AccountField} from '../components/AccountLayout';

export default function ChangePassword() {
 const {colors:Colors}=useTheme();

  const { user } = useAuthContext();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function submit() {
    if (!user || OFFLINE_MODE || locked.current) return;
    if (!current || next.length < 8 || next !== confirmation || next === current) {
      setMessage('Enter your current password and matching new passwords. Use at least eight characters and choose a different password.');
      return;
    }
    locked.current = true;
    setBusy(true);
    const revision = sessionRevision();
    let changed = false;
    try {
      const account = await signIn(user.email, current);
      if (account.localId !== user.id || revision !== sessionRevision()) throw new Error('Session changed. Sign in again.');
      const credentials = await updatePassword(account.idToken, next);
      changed = true;
      if (!credentials.refreshToken) throw new Error('Could not restore your session.');
      await saveToken(credentials.idToken, revision, credentials.refreshToken, Number(credentials.expiresIn));
      setMessage('Password updated successfully.');
    } catch (error) {
      setMessage(changed ? 'Your password changed. Sign in again with the new password.' :
        error instanceof Error ? error.message : 'Could not change your password.');
    } finally {
      setCurrent(''); setNext(''); setConfirmation(''); locked.current = false; setBusy(false);
    }
  }
  return <AccountLayout backFallback="/(tabs)/settings" title="Change password" subtitle="Use a different password with at least 8 characters.">
    {([
      ['Current password',current,setCurrent,'current-password'],
      ['New password',next,setNext,'new-password'],
      ['Confirm new password',confirmation,setConfirmation,'new-password'],
    ] as const).map(([label,value,setter,autoComplete])=><AccountField key={label} label={label} value={value} onChangeText={setter} autoComplete={autoComplete} password editable={!busy}/>)}
    {!!message&&<CyberText variant="bodySmall">{message}</CyberText>}
    <CyberButton label={busy?'Updating password…':'Update password'} onPress={submit} disabled={busy||OFFLINE_MODE} loading={busy}/>
  </AccountLayout>;
}

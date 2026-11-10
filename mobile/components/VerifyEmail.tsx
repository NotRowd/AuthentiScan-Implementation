import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../services/api/client';
import { useAuthContext } from '../context/AuthContext';
import Colors from '../constants/Colors';
import CyberButton from './ui/CyberButton';
import CyberText from './ui/CyberText';

type Verification = { data: { masked_email?: string; verified: boolean; sent: boolean; resend_after: number } };
const endpoint = '/api/v1/auth/email-verification';

export default function VerifyEmail() {
  const { refreshAccount, logout } = useAuthContext();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [resendAfter, setResendAfter] = useState(0);
  const active = useRef<AbortController | null>(null);

  async function apply(data: Verification['data'], signal: AbortSignal) {
    if (signal.aborted) return;
    setEmail(data.masked_email || '');
    setResendAfter(Math.max(0, data.resend_after || 0));
    if (data.verified) await refreshAccount();
  }

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    (async () => {
      const { data } = await apiRequest<Verification>(endpoint, { signal: controller.signal });
      await apply(data, controller.signal);
      if (!controller.signal.aborted && !data.verified && !data.sent && !data.resend_after) {
        const sent = await apiRequest<Verification>(endpoint + '/send', {
          method: 'POST', json: {}, signal: controller.signal, timeoutMs: 45000,
        });
        await apply(sent.data, controller.signal);
        if (!controller.signal.aborted) setMessage('Check your inbox and spam folder for the six-digit code.');
      }
    })().catch(error => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not check your email verification.');
    }).finally(() => {
      if (active.current === controller) { active.current = null; setBusy(false); }
    });
    return () => { active.current?.abort(); active.current = null; };
  }, [refreshAccount]);

  useEffect(() => {
    if (!resendAfter) return;
    const timer = setTimeout(() => setResendAfter(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendAfter]);

  async function run(confirm: boolean) {
    if (active.current || (!confirm && resendAfter > 0)) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const { data } = await apiRequest<Verification>(endpoint + (confirm ? '/confirm' : '/send'), {
        method: 'POST', json: confirm ? { code } : {}, signal: controller.signal, timeoutMs: 45000,
      });
      await apply(data, controller.signal);
      if (!controller.signal.aborted && !data.verified && !confirm) {
        setCode('');
        setMessage('Check your inbox and spam folder for the six-digit code.');
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not verify your email.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgPrimary }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <CyberText variant="h3">Verify your email</CyberText>
      <CyberText variant="bodySmall">Request a code, then enter the six digits sent to {email || 'your account email'}.</CyberText>
      <CyberButton label={resendAfter ? `Resend in ${resendAfter}s` : 'Send verification code'}
        disabled={busy || resendAfter > 0} onPress={() => run(false)} />
      <TextInput accessibilityLabel="Verification code" value={code} onChangeText={value => setCode(value.replace(/\D/g, ''))}
        keyboardType="number-pad" autoComplete="one-time-code" maxLength={6}
        style={{ color: Colors.textPrimary, backgroundColor: Colors.bgSecondary, padding: 14, borderRadius: 8 }} />
      <CyberButton label="Confirm email" disabled={busy || code.length !== 6} onPress={() => run(true)} />
      {!!message && <CyberText variant="bodySmall">{message}</CyberText>}
      <CyberButton label="Log out" variant="secondary" disabled={busy} onPress={() => { void logout().catch(() => {}); }} />
    </ScrollView>
  </SafeAreaView>;
}

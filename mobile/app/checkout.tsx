import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../context/AuthContext';
import { apiRequest } from '../services/api/client';
import { confirmCheckout } from '../services/payment/confirmCheckout';
import { OFFLINE_MODE } from '../services/api/config';
import type { ApiPlan } from '../services/api/contracts';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import GlassCard from '../components/ui/GlassCard';
import Colors from '../constants/Colors';

type Order = {
  id: string; status: string; amount: number; checkout_url?: string;
  created_at?: string; paid_at?: string; expires_at?: string;
};
type Billing = { enabled: boolean; plan: ApiPlan; offer: { amount: number | null }; orders: Order[]; message: string };
const endpoint = '/api/v1/billing';
const peso = (amount: number | null) => amount !== null && Number.isSafeInteger(amount)
  ? 'PHP ' + (amount / 100).toFixed(2) : 'Price to be confirmed';
const paymentDate = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '';
const orderLabel: Record<string, string> = {
  paid: 'Payment confirmed', pending: 'Awaiting payment', creating: 'Preparing checkout', expired: 'Checkout expired',
};

export default function CheckoutScreen() {
  const { refreshAccount } = useAuthContext();
  const [billing, setBilling] = useState<Billing>();
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [resumedOrder, setResumedOrder] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  const returnOrder = useRef<string | null>(null);

  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(controller.signal); }
    catch (failure) {
      if (active.current === controller) setError(failure instanceof Error ? failure.message : 'Subscription could not be loaded.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    const { data } = await apiRequest<{ data: Billing }>(endpoint, { signal });
    if (!signal.aborted) {
      setBilling(data);
      await refreshAccount();
    }
    return data;
  }, [refreshAccount]);

  const confirm = useCallback(async (id: string, signal: AbortSignal, retry = false) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid payment reference.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, 60000);
    let pending = false;
    try {
      if (signal.aborted) return;
      pending = await confirmCheckout(id, controller.signal, retry ? 5 : 1, () => load(controller.signal),
        () => apiRequest(endpoint + '/orders/' + id + '/refresh', { method: 'POST', signal: controller.signal, timeoutMs: 8500 }));
    } catch (failure) {
      if (!controller.signal.aborted) throw failure;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
    }
    if (!signal.aborted && (pending || controller.signal.aborted)) {
      setNotice('Payment is not confirmed yet. If you already paid, use Check payment before trying to pay again.');
    }
  }, [load]);

  useEffect(() => {
    if (!OFFLINE_MODE) void run(async signal => { await load(signal); });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || !returnOrder.current) return;
      setResumedOrder(returnOrder.current);
      returnOrder.current = null;
    });
    return () => {
      active.current?.abort();
      active.current = null;
      subscription.remove();
    };
  }, [load, run]);

  useEffect(() => {
    if (busy || !resumedOrder) return;
    setResumedOrder(null);
    void run(signal => confirm(resumedOrder, signal, true));
  }, [busy, confirm, resumedOrder, run]);

  const checkout = () => run(async signal => {
    const { data } = await apiRequest<{ data: Order }>(endpoint + '/checkout', {
      method: 'POST', json: { accept_test_purchase: true }, signal, timeoutMs: 30000,
    });
    if (signal.aborted) return;
    const url = new URL(data.checkout_url || '');
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paymongo.com' || url.port || url.username || url.password) {
      throw new Error('Unexpected checkout destination.');
    }
    returnOrder.current = data.id;
    try { await Linking.openURL(url.href); }
    catch (failure) { returnOrder.current = null; throw failure; }
  });

  const pending = billing?.orders.find(order => order.status === 'pending');
  const pro = billing?.plan?.scan_limit === null;
  const expiry = paymentDate(billing?.plan?.expires_at);
  return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgPrimary }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <CyberText variant="h3">Subscription</CyberText>
      {OFFLINE_MODE ? <CyberText variant="bodySmall">Checkout is available in connected mode.</CyberText> : <>
        {billing && <>
          <GlassCard>
            <CyberText variant="h4">Current plan: {pro ? 'Pro' : 'Free'}</CyberText>
            {pro && expiry ? <CyberText variant="bodySmall">Active until {expiry} (Philippine time).</CyberText> : null}
          </GlassCard>
          <GlassCard><CyberText variant="h4">Free</CyberText><CyberText variant="bodySmall">PHP 0 · 5 scans per day</CyberText></GlassCard>
          <GlassCard><CyberText variant="h4">Pro</CyberText><CyberText variant="bodySmall">{peso(billing.offer.amount)} · One calendar month · Unlimited scans</CyberText></GlassCard>
          <CyberText variant="caption">Capstone checkout is simulated. No real money is charged. Pro does not renew automatically.</CyberText>
          {!billing.enabled && !pro && <CyberText variant="caption">{billing.message}</CyberText>}
          {billing.enabled && !pro && <>
            <CyberButton label={acknowledged ? '✓ I understand this is a capstone payment' : 'I understand no real money is charged'} variant="secondary" disabled={busy} onPress={() => setAcknowledged(value => !value)} />
            <CyberButton label={pending ? 'Resume checkout' : 'Continue to checkout'} disabled={busy || !acknowledged} onPress={checkout} />
          </>}
          <CyberText variant="h4">Payment history</CyberText>
          {billing.orders.length ? billing.orders.map(order => <GlassCard key={order.id}>
            <CyberText variant="bodySmall">{peso(order.amount)} · {orderLabel[order.status] || order.status}</CyberText>
            {!!paymentDate(order.paid_at || order.created_at) &&
              <CyberText variant="caption">{paymentDate(order.paid_at || order.created_at)} (Philippine time)</CyberText>}
          </GlassCard>) :
            <CyberText variant="bodySmall">No payments yet.</CyberText>}
        </>}
        {!!notice && <CyberText variant="bodySmall">{notice}</CyberText>}
        {!!error && <CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText>}
        <CyberButton label={pending ? 'Check payment' : 'Refresh subscription'} disabled={busy} loading={busy}
          onPress={() => run(async signal => {
            if (pending) await confirm(pending.id, signal);
            else await load(signal);
          })} variant="secondary" />
      </>}
      <CyberButton label="Back" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  </SafeAreaView>;
}

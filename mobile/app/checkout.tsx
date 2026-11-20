import {useTheme,useThemedStyles} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import {createStyles} from '../constants/createStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../context/AuthContext';
import { apiRequest } from '../services/api/client';
import { confirmCheckout } from '../services/payment/confirmCheckout';
import { OFFLINE_MODE } from '../services/api/config';
import type { ApiPlan } from '../services/api/contracts';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import GlassCard from '../components/ui/GlassCard';

type Order = {
  id: string; status: string; amount: number; checkout_url?: string;
  created_at?: string; paid_at?: string; expires_at?: string;
};
type Billing = { enabled: boolean; plan: ApiPlan; offer: { amount: number | null; purchase_type?: string }; orders: Order[]; message: string };
const endpoint = '/api/v1/billing';
const peso = (amount: number | null) => amount !== null && Number.isSafeInteger(amount)
  ? new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(amount / 100) : 'Price to be confirmed';
const paymentDate = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '';
const orderLabel: Record<string, string> = {
  paid: 'Payment confirmed', pending: 'Awaiting payment', creating: 'Preparing checkout', expired: 'Checkout expired',
};

export default function CheckoutScreen() {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

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

  useFocusEffect(useCallback(() => {
    if (!OFFLINE_MODE) void run(async signal => { await load(signal); });
  }, [load, run]));

  useEffect(() => {
    if (busy || !resumedOrder) return;
    setResumedOrder(null);
    void run(signal => confirm(resumedOrder, signal, true));
  }, [busy, confirm, resumedOrder, run]);

  const checkout = () => run(async signal => {
    if(!acknowledged || !billing?.enabled || billing.plan.scan_limit===null) throw new Error('Acknowledge the capstone payment notice before continuing.');
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

  const pending = billing?.orders.find(order => ['pending','creating'].includes(order.status));
  const pro = billing?.plan?.scan_limit === null;
  const expiry = paymentDate(billing?.plan?.expires_at);
  const help = !billing?.enabled ? billing?.message || 'Checkout is unavailable.' : busy ? 'A payment request is in progress. Please wait.' : !acknowledged ? 'Tick the acknowledgement above to enable checkout.' : pending ? 'Resume the existing purchase. If you already paid, do not make another payment.' : 'Acknowledgement received. You can continue to simulated checkout.';
  const benefits=['Saved scan history','PDF reports at no extra cost','Failed scans do not use a credit'];
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <CyberText variant="label" color={Colors.cyan}>YOUR SUBSCRIPTION</CyberText>
      <CyberText variant="h3">Plans &amp; payments</CyberText>
      <CyberText variant="bodySmall">Your plan, your scan allowance, and your payment history in one place.</CyberText>
      <View style={styles.notice}><CyberText variant="bodySmall">Capstone demonstration · Payments are simulated. No real money is charged.</CyberText></View>
      {OFFLINE_MODE?<CyberText variant="bodySmall">Checkout is available in connected mode.</CyberText>:<>
        {!billing&&!error&&<CyberText variant="bodySmall">Loading your subscription…</CyberText>}
        {!!error&&<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}><CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText><CyberButton label="Retry loading" variant="secondary" disabled={busy} onPress={()=>run(async signal=>{await load(signal);})}/></View>}
        {!!notice&&<View accessibilityLiveRegion="polite"><CyberText variant="bodySmall">{notice}</CyberText></View>}
        {billing&&<>
          <GlassCard style={styles.banner}><CyberText variant="caption">YOUR CURRENT PLAN</CyberText><CyberText variant="h4">{pro?'Pro':'Free'}</CyberText><CyberText variant="bodySmall">{pro?'Unlimited scans during your active month.':'5 free scans every day. Resets at midnight Philippine time.'}</CyberText>
            {pro&&<><CyberText variant="bodySmall">Pro is active until {expiry||'the saved expiry date'} (Philippine time).</CyberText><CyberText variant="caption">No automatic renewal. After your pass expires, you return to Free and can buy another month. Your saved scans remain available.</CyberText></>}
            <CyberButton label={pro?'Scan an image':'View remaining scans'} variant="secondary" onPress={()=>router.push(pro?'/(tabs)/scan':'/(tabs)/dashboard')}/>
          </GlassCard>
          {[false,true].map(isPro=><GlassCard key={isPro?'pro':'free'} style={isPro?styles.pro:styles.plan}>
            <View style={styles.heading}><CyberText variant="h4">{isPro?'Pro':'Free'}</CyberText>{isPro||!pro?<CyberText variant="caption" color={Colors.cyanAlt}>{isPro?(pro?'Current plan':'Monthly pass'):'Current plan'}</CyberText>:null}</View>
            <CyberText variant="h3">{isPro?peso(billing.offer.amount):'₱0'}</CyberText><CyberText variant="caption">{isPro?'For one calendar month':'No payment needed'}</CyberText>
            <CyberText variant="body" style={{fontWeight:'600'}}>{isPro?'Unlimited scans':'5 scans per day'}</CyberText>
            {benefits.map(item=><CyberText key={item} variant="bodySmall">✓ {item}</CyberText>)}
            <View style={styles.rule}/><CyberText variant="bodySmall">{isPro?(billing.offer.purchase_type==='one_time'?'Pay once for a month. No automatic renewal.':'Purchase details are currently unavailable.'):'For occasional image checks. Your daily allowance resets at midnight Philippine time.'}</CyberText>
            {isPro&&(pro?<View style={styles.notice}><CyberText variant="bodySmall">Your Pro pass is active. You can buy another month after this pass expires.</CyberText></View>:<>
              {!billing.enabled&&<CyberText variant="bodySmall">{billing.message}</CyberText>}
              <Pressable accessibilityRole="checkbox" accessibilityLabel="I understand this capstone checkout simulates payment. No real money will be charged." accessibilityState={{checked:acknowledged,disabled:busy||!billing.enabled}} disabled={busy||!billing.enabled} onPress={()=>setAcknowledged(v=>!v)} style={styles.ack}>
                <View style={[styles.checkbox,acknowledged&&styles.checked]}><CyberText variant="bodySmall" color={acknowledged?Colors.bgSecondary:Colors.cyan}>{acknowledged?'✓':''}</CyberText></View><View style={{flex:1}}><CyberText variant="bodySmall">I understand this capstone checkout simulates payment. No real money will be charged.</CyberText></View>
              </Pressable>
              <CyberButton label={busy?'Please wait…':!billing.enabled?'Checkout unavailable':pending?'Resume checkout':'Continue to checkout'} disabled={busy||!acknowledged||!billing.enabled} loading={busy} onPress={checkout}/>
              <View accessibilityLiveRegion="polite"><CyberText variant="caption">{help}</CyberText></View>
              <CyberText variant="caption">Checkout with PayMongo{ '\n' }GCash · Maya · Cards, when available</CyberText>
            </>)}
          </GlassCard>)}
          <CyberText variant="bodySmall">Both plans use the same AI analysis. Pro increases your scan allowance, not prediction accuracy.</CyberText>
          <GlassCard style={styles.plan}><CyberText variant="h4">Payment history</CyberText><CyberText variant="caption">Your latest 20 orders. All times are Philippine time.</CyberText>
            <CyberButton label="Refresh history" variant="secondary" disabled={busy} onPress={()=>run(async signal=>{await load(signal);})}/>
            {billing.orders.length?billing.orders.map(order=><View key={order.id} style={styles.order}>
              <CyberText variant="body" style={{fontWeight:'600'}}>Pro monthly pass · {peso(order.amount)}</CyberText><CyberText variant="bodySmall">{orderLabel[order.status]||'Checkout preparation incomplete'}</CyberText><CyberText variant="caption">Started {paymentDate(order.created_at)||'Date unavailable'}</CyberText>
              {order.status==='pending'&&<CyberButton label={busy?'Checking…':'Check payment'} variant="secondary" disabled={busy} onPress={()=>run(signal=>confirm(order.id,signal))}/>}
              {['pending','creating'].includes(order.status)&&!pro&&<CyberButton label="Resume checkout" variant="secondary" disabled={busy||!acknowledged||!billing.enabled} onPress={checkout}/>}
            </View>):<View style={styles.notice}><CyberText variant="bodySmall">No payments yet.</CyberText><CyberText variant="caption">Your orders will appear here when you start checkout.</CyberText></View>}
          </GlassCard>
        </>}
      </>}
      <CyberButton label="Back" variant="ghost" onPress={()=>router.back()}/>
    </ScrollView>
  </SafeAreaView>;
}
const makeStyles = (Colors: ColorPalette) => createStyles({screen:{flex:1,backgroundColor:Colors.bgPrimary},content:{width:'100%',maxWidth:680,alignSelf:'center',padding:20,paddingBottom:48,gap:14},plan:{gap:10,borderRadius:22},pro:{gap:10,borderRadius:22,borderColor:Colors.glassBorderCyan,backgroundColor:Colors.bgSecondary},banner:{gap:7,borderRadius:22,backgroundColor:Colors.cyanDim,borderColor:Colors.border},notice:{padding:12,borderRadius:14,backgroundColor:Colors.cyanDim,gap:5},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},rule:{height:1,backgroundColor:Colors.border,marginVertical:4},ack:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:6,minHeight:44},checkbox:{width:22,height:22,borderRadius:5,borderWidth:1,borderColor:Colors.textMuted,alignItems:'center',justifyContent:'center'},checked:{backgroundColor:Colors.cyan,borderColor:Colors.cyan},error:{padding:14,borderRadius:14,backgroundColor:Colors.fakeDim,gap:10},order:{borderTopWidth:1,borderColor:Colors.border,paddingTop:12,gap:7}});

type PaymentState = { enabled: boolean; plan: { scan_limit: number | null } | null; orders: { id: string; status: string }[] };

function pause(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 3000);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

// A browser return is a prompt to check. Only the server's plan can confirm payment.
export async function confirmCheckout(
  id: string, signal: AbortSignal, attempts: number,
  read: () => Promise<PaymentState>, refresh: () => Promise<unknown>, wait = pause,
) {
  let state = await read();
  const pending = () => state.enabled && state.orders.some(order => order.id === id && order.status === 'pending');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal.aborted || state.plan?.scan_limit === null || !pending()) break;
    if (attempt) await wait(signal);
    if (signal.aborted) break;
    try { await refresh(); }
    catch (failure) { if (signal.aborted || attempt === attempts - 1) throw failure; }
    if (!signal.aborted) state = await read();
  }
  return !signal.aborted && state.plan?.scan_limit !== null && pending();
}

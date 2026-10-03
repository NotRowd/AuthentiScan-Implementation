export default function ScanCreditNotice({ scan }) {
  const message = {
    not_charged: 'No scan credit used. This failed scan stays in your history.',
    reserved: 'One scan credit is reserved while analysis is pending.',
    used: 'One scan credit used for this completed analysis.',
  }[scan?.credit_status];
  return message ? <p role="status" className="mt-3 text-xs leading-relaxed text-slate-300">{message}</p> : null;
}


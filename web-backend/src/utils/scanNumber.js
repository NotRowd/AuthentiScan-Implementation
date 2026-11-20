export function scanNumber(scan) {
  return Number.isSafeInteger(scan?.scan_number) && scan.scan_number > 0 ? String(scan.scan_number) : '—';
}

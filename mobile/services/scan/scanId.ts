export const savedScanIdPattern = '(?:[1-9]\\d*|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})';
export const isSavedScanId = (id: string) => new RegExp('^' + savedScanIdPattern + '$', 'i').test(id) && (!/^\d+$/.test(id) || Number.isSafeInteger(Number(id)));

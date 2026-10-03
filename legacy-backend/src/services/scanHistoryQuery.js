const statuses = new Set(['all', 'queued', 'processing', 'completed', 'failed', 'authentic', 'ai_generated', 'uncertain']);
const verdicts = new Set(['authentic', 'ai_generated', 'uncertain']);

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function integer(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalid('Invalid history pagination.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid('Invalid history pagination.');
  return number;
}

function buildHistoryQuery(query, userId) {
  const limit = integer(query.limit, 20, 1, 100);
  const offset = integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 120)) {
    invalid('Search must be a string of at most 120 characters.');
  }
  const q = (query.q || '').trim();
  const status = query.status === undefined ? 'all' : query.status;
  if (typeof status !== 'string' || !statuses.has(status)) invalid('Invalid scan history status filter.');
  const clauses = ['s.user_id = ?', 's.is_deleted = FALSE'];
  const params = [userId];
  if (q) {
    // Literal substring search: %, _ and SQL syntax are never wildcards/code.
    const idSearch = /^#\d+$/.test(q) ? q.slice(1) : q;
    clauses.push('(LOCATE(LOWER(?), LOWER(s.original_file_name)) > 0 OR LOCATE(?, CAST(s.scan_id AS CHAR)) > 0)');
    params.push(q, idSearch);
  }
  if (verdicts.has(status)) {
    clauses.push("s.status = 'completed'", 'ar.verdict = ?');
    params.push(status);
  } else if (status !== 'all') {
    clauses.push('s.status = ?');
    params.push(status);
  }
  return { where: clauses.join(' AND '), params, limit, offset };
}

module.exports = { buildHistoryQuery };

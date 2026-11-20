// Local-only preservation before Firebase migration. Never deletes source data.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const base = 'D:/AuthentiScan-Implementation/backend';
const mysql = require(base + '/node_modules/mysql2/promise');
const env = require(base + '/node_modules/dotenv').parse(fs.readFileSync(base + '/.env'));
const backupRoot = 'D:/AuthentiScan - backend/backups';
const skip = new Set(['node_modules', '.venv', 'venv', '.git', '.expo', '__pycache__', '.pytest_cache', 'dist', '.cache']);
const sources = [
  ['D:/AuthentiScan-Implementation', 'projects/web-backend'],
  ['D:/AuthentiScan-AI-Foundation', 'projects/ai-foundation'],
  ['D:/AuthentiScan-Mobile', 'projects/mobile'],
  ['D:/AuthentiScan - backend/ai-models', 'models'],
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = value => '`' + String(value).replaceAll('`', '``') + '`';

async function run(exe, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', b => { output += b; });
    child.stderr.on('data', b => { error += b; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(Object.assign(new Error(path.basename(exe) + ' failed with exit ' + code), { privateDetail: error })));
    child.stdin.on('error', () => {});
    if (input) fs.createReadStream(input).on('error', reject).pipe(child.stdin);
    else child.stdin.end();
  });
}

async function connect(database) {
  const c = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, jsonStrings: true });
  await c.query("SET SESSION time_zone = '+00:00'");
  return c;
}

async function fingerprint(c, db) {
  const [tables] = await c.execute('SELECT TABLE_NAME, TABLE_TYPE, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [db]);
  assert.ok(tables.length > 0, 'No tables found');
  assert.ok(tables.every(t => t.TABLE_TYPE === 'BASE TABLE' && t.ENGINE === 'InnoDB'), 'Review views/non-InnoDB tables before continuing');
  const summary = {};
  await c.query('START TRANSACTION READ ONLY');
  try {
    for (const t of tables) {
      const [rows] = await c.query('SELECT * FROM ' + quote(db) + '.' + quote(t.TABLE_NAME));
      const [ddl] = await c.query('SHOW CREATE TABLE ' + quote(db) + '.' + quote(t.TABLE_NAME));
      // MySQL can print an inherited column charset explicitly after a dump/restore.
      // Normalize only redundant declarations matching this table's default;
      // keep all collations and differing charsets in the comparison.
      const definition = ddl[0]['Create Table'];
      const charset = definition.match(/DEFAULT CHARSET=([a-z0-9_]+)/i)?.[1];
      const normalized = charset ? definition.replace(new RegExp(' CHARACTER SET ' + charset + '(?= COLLATE )', 'g'), '') : definition;
      const [columns] = await c.execute('SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME, COLUMN_KEY, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [db, t.TABLE_NAME]);
      const encoded = rows.map(row => JSON.stringify(row)).sort();
      summary[t.TABLE_NAME] = { rows: rows.length, data_sha256: hash(encoded.join('\n')), schema_sha256: hash(normalized), columns_sha256: hash(JSON.stringify(columns)) };
    }
  } finally { await c.rollback(); }
  return summary;
}

async function main() {
  assert.equal(env.DB_NAME, 'authentiscan_db', 'Unexpected source database; refusing to continue');
  const time = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(/[^0-9]/g, '');
  const id = time + '_' + crypto.randomBytes(3).toString('hex');
  const dest = path.resolve(backupRoot, 'pre-firebase-' + id);
  assert.ok(dest.startsWith(path.resolve(backupRoot) + path.sep));
  const restoreDb = 'authentiscan_restore_check_' + id;
  assert.match(restoreDb, /^authentiscan_restore_check_[0-9]{14}_[a-f0-9]{6}$/);
  assert.notEqual(restoreDb, env.DB_NAME);
  await fsp.mkdir(backupRoot, { recursive: true });
  await fsp.mkdir(dest); // No overwrite of a prior backup.
  const sid = (await run('whoami.exe', ['/user', '/fo', 'csv', '/nh'])).match(/S-1-5-[0-9-]+/)?.[0];
  assert.ok(sid, 'Could not identify backup owner');
  await run('icacls.exe', [dest, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F']);
  const options = path.join(dest, '.temporary-mysql-options.cnf');
  const optionValue = value => '"' + String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
  const write = (name, value) => fsp.writeFile(path.join(dest, name), value, { flag: 'wx' });
  const report = { status: 'IN_PROGRESS', created_at: new Date().toISOString(), timezone: 'Asia/Manila', source_database: env.DB_NAME, restore_database: restoreDb, excluded_directory_names: [...skip], files: [], skipped_links: [] };
  let source, restored;
  try {
    source = await connect(env.DB_NAME);
    for (const [view, field] of [['ROUTINES', 'ROUTINE_SCHEMA'], ['TRIGGERS', 'TRIGGER_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
      const [objects] = await source.execute('SELECT COUNT(*) AS total FROM information_schema.' + view + ' WHERE ' + field + ' = ?', [env.DB_NAME]);
      assert.equal(Number(objects[0].total), 0, 'Review stored routines/triggers/events before cross-database restore');
    }
    const before = await fingerprint(source, env.DB_NAME);
    console.log('Database snapshot: ' + Object.keys(before).length + ' tables.');
    await fsp.writeFile(options, '[client]\nprotocol=tcp\nhost=' + optionValue(env.DB_HOST) + '\nport=' + Number(env.DB_PORT || 3306) + '\nuser=' + optionValue(env.DB_USER) + '\npassword=' + optionValue(env.DB_PASSWORD) + '\ndefault-character-set=utf8mb4\n', { flag: 'wx', mode: 0o600 });
    const dump = path.join(dest, 'authentiscan_db.sql');
    await run('D:/MySQL/Server/bin/mysqldump.exe', ['--defaults-file=' + options, '--single-transaction', '--quick', '--hex-blob', '--routines', '--events', '--triggers', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--skip-add-drop-table', '--skip-add-locks', '--result-file=' + dump, env.DB_NAME]);
    const sql = await fsp.readFile(dump, 'utf8');
    assert.ok(sql.length > 1000 && sql.includes('Dump completed'), 'Incomplete SQL dump');
    assert.ok(!/^\s*(?:USE\s|(?:CREATE|DROP|ALTER)\s+DATABASE\b)/im.test(sql), 'SQL dump selects or changes a database');
    assert.ok(!sql.includes(quote(env.DB_NAME) + '.'), 'SQL dump contains source-qualified table references');
    report.dump_sha256 = hash(Buffer.from(sql));
    console.log('SQL export complete. Copying code, media, configuration and models.');
    async function copyTree(sourceDir, relative) {
      const target = path.join(dest, relative);
      await fsp.mkdir(target, { recursive: true });
      for (const d of await fsp.readdir(sourceDir, { withFileTypes: true })) {
        if (skip.has(d.name)) continue;
        const from = path.join(sourceDir, d.name), rel = path.join(relative, d.name), to = path.join(dest, rel);
        if (d.isSymbolicLink()) { report.skipped_links.push(from); continue; }
        if (d.isDirectory()) { await copyTree(from, rel); continue; }
        if (!d.isFile()) continue;
        const first = await fsp.readFile(from);
        await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
        const copied = await fsp.readFile(to), after = await fsp.readFile(from);
        assert.equal(hash(first), hash(copied), 'Copied file differs: ' + rel);
        assert.equal(hash(after), hash(copied), 'Source file changed during backup: ' + rel);
        report.files.push({ path: rel.replaceAll('\\', '/'), bytes: copied.length, sha256: hash(copied) });
      }
    }
    for (const [from, relative] of sources) await copyTree(from, relative);
    assert.equal(report.skipped_links.length, 0, 'Review skipped filesystem links before claiming complete backup');
    assert.deepEqual(await fingerprint(source, env.DB_NAME), before, 'Source database changed during copying; make a new backup');
    const [schema] = await source.execute('SELECT DEFAULT_CHARACTER_SET_NAME AS charset_name, DEFAULT_COLLATION_NAME AS collation_name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [env.DB_NAME]);
    assert.match(schema[0].charset_name, /^[a-z0-9_]+$/i);
    assert.match(schema[0].collation_name, /^[a-z0-9_]+$/i);
    const [existing] = await source.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [restoreDb]);
    assert.equal(existing.length, 0, 'Restore database already exists');
    // Only creates a new, uniquely named database. Never drops or replaces one.
    await source.query('CREATE DATABASE ' + quote(restoreDb) + ' CHARACTER SET ' + schema[0].charset_name + ' COLLATE ' + schema[0].collation_name);
    console.log('Restoring into isolated database: ' + restoreDb);
    await run('D:/MySQL/Server/bin/mysql.exe', ['--defaults-file=' + options, '--binary-mode', '--database=' + restoreDb], dump);
    restored = await connect(restoreDb);
    report.tables = await fingerprint(restored, restoreDb);
    assert.deepEqual(report.tables, before, 'Restored database differs from source');
    assert.deepEqual(await fingerprint(source, env.DB_NAME), before, 'Source changed during restore verification');
    const [scans] = await restored.query('SELECT scan_id, file_path FROM scans');
    const [results] = await restored.query('SELECT scan_id, heatmap_path FROM analysis_results WHERE heatmap_path IS NOT NULL');
    function copiedPath(original) {
      for (const [root, relative] of sources) {
        const r = path.resolve(root), f = path.resolve(original);
        if (f.startsWith(r + path.sep)) return path.join(dest, relative, path.relative(r, f));
      }
      return null;
    }
    report.media = { originals: scans.length, heatmap_references: results.length, missing_original_scan_ids: [], missing_heatmap_scan_ids: [] };
    for (const scan of scans) {
      const file = copiedPath(scan.file_path);
      if (!file || !fs.existsSync(file)) report.media.missing_original_scan_ids.push(scan.scan_id);
    }
    for (const row of results) {
      const name = path.basename(row.heatmap_path);
      const candidates = [path.join(dest, 'projects/ai-foundation/ai-service/service/generated-heatmaps', name), path.join(dest, 'projects/web-backend/ai-service/generated-heatmaps', name)];
      if (!candidates.some(f => fs.existsSync(f))) report.media.missing_heatmap_scan_ids.push(row.scan_id);
    }
    // Re-read all backed-up file bytes before marking verification successful.
    for (const file of report.files) assert.equal(hash(await fsp.readFile(path.join(dest, file.path))), file.sha256, 'Backup integrity mismatch: ' + file.path);
    assert.equal(hash(await fsp.readFile(dump)), report.dump_sha256, 'SQL backup changed after verification');
    report.status = report.media.missing_original_scan_ids.length || report.media.missing_heatmap_scan_ids.length ? 'DATABASE_VERIFIED_MEDIA_WARNINGS' : 'VERIFIED';
    report.completed_at = new Date().toISOString();
    report.total_file_bytes = report.files.reduce((sum, f) => sum + f.bytes, 0) + (await fsp.stat(dump)).size;
    await write('verification.json', JSON.stringify(report, null, 2));
    const tableLines = Object.entries(report.tables).map(([name, info]) => '| ' + name + ' | ' + info.rows + ' | SHA-256 schema and data match |').join('\n');
    await write('README-RESTORE.md', '# AuthentiScan pre-Firebase backup\n\nStatus: **' + report.status + '**\n\nCreated: ' + report.created_at + '\n\nOriginal database: `' + env.DB_NAME + '` (unchanged).\n\nVerified restore database: `' + restoreDb + '` (retained; no application points to it).\n\n## Included\n\n- `authentiscan_db.sql`: schema and all rows.\n- `projects/web-backend`: current web/backend, uploads, old AI service, configuration and lockfiles.\n- `projects/ai-foundation`: current AI source, heatmaps and model-related files.\n- `projects/mobile`: mobile source/configuration safety copy; no mobile code changed.\n- `models`: curated deployed model, policy and evaluation metadata.\n- `verification.json`: table counts and file SHA-256 checksums.\n\n## Verification\n\nSQL was imported into a newly created database. All table schemas and every row matched. The original database matched before and after the backup. Copied files were byte-hash verified.\n\n| Table | Rows | Verification |\n|---|---:|---|\n' + tableLines + '\n\nMedia checks: ' + JSON.stringify(report.media) + '\n\n## Important security and limitations\n\nThis folder contains private images, account/password hashes and `.env` secrets. It is NOT encrypted; Windows access is restricted to the creating user and SYSTEM. Do not commit, share publicly, or upload to Firebase. Backup SQL excludes MySQL server user accounts/grants; application credentials are in the private configuration copy. Source code includes uncommitted edits but excludes Git history and worktree metadata. Dependencies, Python virtual environments, generated web builds, caches and external training datasets are excluded. Reinstall using saved lockfiles/requirements. This is a point-in-time snapshot; later changes are not automatically backed up.\n\n## Safe recovery\n\n1. Keep the live system untouched until recovery is approved.\n2. Use the already verified restore database above for a test, or create a NEW empty database.\n3. Import `authentiscan_db.sql` into that new database using MySQL Workbench or the MySQL client. This dump has no CREATE DATABASE, USE or DROP TABLE statements. Never select the live database for a test import.\n4. Restore project folders into separate recovery locations. Install dependencies, configure the recovered backend to use the test database and copied images, and start AI with the copied curated model and policy.\n5. Stored original-image file paths reflect the old machine paths; if restoring elsewhere, adjust only the recovered database/backend configuration. Heatmap/model locations must also reference recovered files.\n6. Check login, history, originals, AI readiness, scans and PDF export before considering a cutover.\n\nKeep an additional encrypted/offline copy on another physical drive: this Drive D backup does not protect against failure of Drive D.\n');
    console.log(JSON.stringify({ backup: dest, status: report.status, restore_database: restoreDb, tables: Object.fromEntries(Object.entries(report.tables).map(([t, v]) => [t, v.rows])), copied_files: report.files.length, bytes: report.total_file_bytes, media: report.media }));
  } catch (error) {
    await fsp.writeFile(path.join(dest, 'INCOMPLETE-BACKUP.txt'), 'Backup did not complete verification. Do not treat it as a verified recovery point.\n' + (error.message || 'Unknown error') + '\n', { flag: 'wx' }).catch(() => {});
    if (error.privateDetail) await fsp.writeFile(path.join(dest, 'private-command-error.txt'), error.privateDetail).catch(() => {});
    console.error('Backup incomplete: ' + error.message + '. Inspect private backup folder: ' + dest);
    process.exitCode = 1;
  } finally {
    // Only remove the exact temporary credential file we just created.
    await fsp.unlink(options).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (restored) await restored.end();
    if (source) await source.end();
  }
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });

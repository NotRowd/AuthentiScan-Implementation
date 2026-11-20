import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {resolve, basename, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {createTruthScanClient} from '../server/truthscan.mjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(root, '.secrets/truthscan.env'));
const client = createTruthScanClient({apiKey: process.env.TRUTHSCAN_API_KEY});
const [mode, argument] = process.argv.slice(2);

if (mode === '--credits') {
  const balance = await client.credits();
  console.log('TruthScan available credits:', balance.credits);
} else if (mode === '--image' || mode === '--resume') {
  const directory = resolve(root, '.runtime/truthscan');
  await mkdir(directory, {recursive: true});
  let path, job;
  if (mode === '--image') {
    if (!argument) throw new Error('Provide an image path. Each successful analysis consumes provider credits.');
    const bytes = await readFile(resolve(argument));
    const hash = createHash('sha256').update(bytes).digest('hex');
    path = resolve(directory, hash + '.json');
    let retryId;
    try {
      await access(path);
      const previous = JSON.parse(await readFile(path, 'utf8'));
      if (previous.status !== 'uploading') throw new Error('A job record already exists for this image. Use --resume with that record instead of paying for another submission.');
      retryId = previous.job_id;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    job = {provider: 'truthscan', file_name: basename(argument), input_sha256: hash, created_at: new Date().toISOString()};
    const saveJob = async update => {
      job = {...job, ...update};
      await writeFile(path, JSON.stringify(job, null, 2), {mode: 0o600});
    };
    console.log('Submitting one image for a provider analysis.');
    await client.submit(bytes, {id: retryId || randomUUID(), saveJob});
  } else {
    if (!argument) throw new Error('Provide the saved job JSON path.');
    path = resolve(argument);
    if (dirname(path) !== directory) throw new Error('Resume a job from .runtime/truthscan only.');
    job = JSON.parse(await readFile(path, 'utf8'));
    if (job.provider !== 'truthscan' || !job.job_id) throw new Error('Invalid saved job.');
  }
  const result = await client.poll(job.job_id);
  const analysis = mapTruthScanClassification(result.result_details);
  await writeFile(path, JSON.stringify({...job, status: result.status, result, analysis}, null, 2), {mode: 0o600});
  if (result.result_details.heatmap_status === 'ready') {
    const image = await client.heatmap(job.job_id);
    if (image) await writeFile(path.replace(/\.json$/, '.png'), image, {mode: 0o600});
  }
  console.log('Saved provider results in .runtime/truthscan. Review these before selecting the application score mapping.');
} else {
  throw new Error('Use --credits, --image <path>, or --resume <saved-job.json>.');
}

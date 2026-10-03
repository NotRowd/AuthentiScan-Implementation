import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { auth, db, bucket, emulatorHealth,publicConfig,mediaProvider,mediaForRecord } from './firebase.mjs';
import { readAllowance } from './allowance.mjs';
import {webRoutes} from './web-routes.mjs';

const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const error = (status, message) => Object.assign(new Error(message), {status});
const MAX_BYTES = 10 * 1024 * 1024;
function imageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // API is not a LAN/cloud service. Browser calls use the localhost Vite proxy.
    if (req.headers.origin && !['http://127.0.0.1:5174', 'http://localhost:5174'].includes(req.headers.origin))
      return res.status(403).json({message:'Only the local test page may access this API.'});
    next();
  });
  app.use(express.json({limit:'16kb'}));
  app.get('/api/config',(_req,res)=>res.json(publicConfig));
  app.get('/api/health', route(async (_req, res) => {
    const services = await emulatorHealth();
    res.status(Object.values(services).every(Boolean) ? 200 : 503).json({mode:publicConfig.mode, project:publicConfig.firebase.projectId, media:mediaProvider,services});
  }));
  app.use('/api', route(async (req, _res, next) => {
    const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!bearer) throw error(401, 'Please sign in.');
    try { req.account = await auth.verifyIdToken(bearer, true); }
    catch { throw error(401, 'Session expired or invalid. Please sign in again.'); }
    if (!req.account.email) throw error(403, 'An email account is required.');
    req.userRef = db.collection('users').doc(req.account.uid);
    next();
  }));
  app.use('/api/v1', webRoutes(options));
  app.get('/api/me', route(async (req, res) => {
    const record = await req.userRef.get();
    if (!record.exists) throw error(404, 'Complete your local test profile.');
    if (record.data().status !== 'active') throw error(403, 'Account unavailable.');
    res.json({profile:record.data(), allowance:await readAllowance(db, req.account.uid)});
  }));
  app.post('/api/me', route(async (req, res) => {
    const {firstName, lastName} = req.body;
    if (!validName(firstName) || !validName(lastName)) throw error(400, 'Enter first and last names (1–100 characters each).');
    if (Object.keys(req.body).some(k => !['firstName','lastName'].includes(k))) throw error(400, 'Unexpected profile fields.');
    await db.runTransaction(async tx => {
      const prior = await tx.get(req.userRef);
      if (prior.exists) return; // Retrying must not reset plan, credits, or status.
      tx.create(req.userRef, {uid:req.account.uid, email:req.account.email, first_name:firstName.trim(), last_name:lastName.trim(), plan:'Free', status:'active', created_at:new Date().toISOString()});
    });
    res.status(200).json({message:'Local profile saved.'});
  }));
  app.use('/api/files', route(async (req, _res, next) => {
    const user = await req.userRef.get();
    if (!user.exists || user.data().status !== 'active') throw error(403, 'An active profile is required.');
    next();
  }));
  const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:MAX_BYTES, files:1, fields:0}}).single('image');
  app.post('/api/files', upload, route(async (req, res) => {
    if (!req.file) throw error(400, 'Choose a JPEG, PNG, or WebP image.');
    const type = imageType(req.file.buffer);
    if (!type || type !== req.file.mimetype) throw error(400, 'The file content must match JPEG, PNG, or WebP.');
    // Bound this test bench separately from the real five-scan allowance.
    const counter = req.userRef.collection('test_metadata').doc('files');
    await db.runTransaction(async tx => {
      const prior = await tx.get(counter);
      const used = prior.data()?.used || 0;
      if (used >= 20) throw error(429, 'This local account has reached its 20-image storage-test limit.');
      tx.set(counter, {used:used + 1});
    });
    const id = randomUUID();
    const object = bucket.file(`users/${req.account.uid}/storage-tests/${id}`);
    try {
      await object.save(req.file.buffer, {resumable:false, metadata:{contentType:type, cacheControl:'private, no-store'}});
      const record = {id,media_provider:mediaProvider, filename:req.file.originalname.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200), bytes:req.file.size, content_type:type, created_at:new Date().toISOString(), purpose:'storage_test_only'};
      await req.userRef.collection('files').doc(id).create(record);
      res.status(201).json({file:record, message:'Protected image saved. No AI analysis or scan credit used.'});
    } catch (e) {
      // Delete only this new temporary test object, never any existing file.
      await object.delete({ignoreNotFound:true}).catch(() => {});
      await db.runTransaction(async tx => {const prior=await tx.get(counter);tx.update(counter,{used:Math.max(0,(prior.data()?.used || 1)-1)});}).catch(() => {});
      throw e;
    }
  }));
  app.get('/api/files', route(async (req, res) => {
    const files = await req.userRef.collection('files').orderBy('created_at','desc').limit(20).get();
    res.json({files:files.docs.map(d => d.data())});
  }));
  app.get('/api/files/:id', route(async (req, res) => {
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) throw error(400,'Invalid image ID.');
    // Both the metadata path and blob path derive from verified token ownership.
    const record = await req.userRef.collection('files').doc(req.params.id).get();
    if (!record.exists) throw error(404,'Image not found.');
    const [bytes] = await mediaForRecord(record.data()).file(`users/${req.account.uid}/storage-tests/${req.params.id}`).download();
    res.type(record.data().content_type).set('Content-Disposition','attachment; filename="local-test-image"').send(bytes);
  }));
  app.use((_req, res) => res.status(404).json({message:'Endpoint not available in this local migration stage.'}));
  app.use((err, _req, res, _next) => {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err instanceof multer.MulterError ? 400 : err.status || 503;
    const message = status === 413 ? 'Maximum image size is 10 MB.' : status < 500 ? err.message : 'Service unavailable. Check the backend connection and retry.';
    res.status(status).json({message});
  });
  return app;
}

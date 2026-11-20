const { inflateSync } = require('zlib');
const DISCLAIMER = 'Class scores are model estimates, not calibrated probabilities, proof, or overall model accuracy. The decision policy may use a threshold other than 50%. Grad-CAM explains a specified class, not proven edited areas. Object detections describe objects, not manipulation. Any separately recorded localization is an estimate that may miss edits or highlight original content; it is not proof of AI generation.';

function scoreForReport(scan) {
  if(scan?.provider==='truthscan')return ['Provider label confidence',scan.provider_label_confidence];
  if(scan?.verdict==='authentic')return ['Authentic class score',scan.authentic_score];
  if(scan?.verdict==='ai_generated')return ['AI-generated class score',scan.ai_generated_score];
  return ['Highest class score (uncertain)',scan&&Number.isFinite(scan.authentic_score)&&Number.isFinite(scan.ai_generated_score)?Math.max(scan.authentic_score,scan.ai_generated_score):null];
}
function heatmapTarget(scan) {
  if(!scan?.gradcam)return 'Not recorded in this older result';
  if(scan.gradcam.target===null)return 'None (uncertain prediction)';
  return scan.gradcam.target==='authentic'?'Authentic':'AI-generated';
}

function percent(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? `${(number * 100).toFixed(2)}%` : 'Not available';
}
function date(value) {
  if (!value) return 'Not available';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Not available' : d.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
}
function safePng(bytes) {
  try {
    if(bytes.length < 33 || bytes.length > 8*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16)!=='IHDR') return false;
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20),channels={0:1,2:3,4:2,6:4}[bytes[25]];
    // Current AI heatmaps are ordinary 8-bit, noninterlaced PNGs. Reject other
    // encodings safely, and validate compressed rows before PDFKit's async decoder.
    if(!w || !h || w*h>16000000 || !channels || bytes[24]!==8 || bytes[26]!==0 || bytes[27]!==0 || bytes[28]!==0) return false;
    const idat=[];let ended=false;
    for(let pos=8;pos+12<=bytes.length;) {
      const len=bytes.readUInt32BE(pos),type=bytes.toString('ascii',pos+4,pos+8);
      if(pos+12+len>bytes.length) return false;
      if(type==='IDAT') idat.push(bytes.subarray(pos+8,pos+8+len));
      if(type==='IEND') { ended=true;break; }
      pos+=12+len;
    }
    if(!ended || !idat.length) return false;
    const stride=w*channels+1,raw=inflateSync(Buffer.concat(idat),{maxOutputLength:stride*h});
    if(raw.length!==stride*h) return false;
    for(let row=0;row<h;row++) if(raw[row*stride]>4) return false;
    return true;
  } catch { return false; }
}
async function loadReportHeatmap(heatmapPath, { fetchImpl = fetch, baseUrl = process.env.AI_SERVICE_URL, timeoutMs = 3000 } = {}) {
  // Only an image path from the owned database record is accepted. No client URLs.
  if (!baseUrl?.trim() || !/^\/heatmaps\/[a-zA-Z0-9_-]{1,128}\.png$/.test(heatmapPath || '')) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.pathname = heatmapPath; url.search = ''; url.hash = '';
    const response = await fetchImpl(url.href, { signal: controller.signal, redirect: 'error', headers: { Accept: 'image/png' } });
    const limit = 8 * 1024 * 1024;
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'image/png' ||
        Number(response.headers.get('content-length')) > limit || !response.body) { controller.abort(); return null; }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) { controller.abort(); return null; }
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    return safePng(bytes) ? bytes : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

async function buildScanReport(scan, heatmap = null, exportedAt = new Date(), localizationImage = null, images = {}) {
  const {renderReport}=require('./report-layout.cjs');
  return renderReport(scan,{...images,heatmap,exportedAt,localizationImage},{safePng,percent,heatmapTarget});
}
module.exports={buildScanReport,loadReportHeatmap,percent,DISCLAIMER,scoreForReport,heatmapTarget};

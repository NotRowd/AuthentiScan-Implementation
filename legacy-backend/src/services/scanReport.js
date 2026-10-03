const path = require('path');
const { inflateSync } = require('zlib');
const PDFDocument = require('pdfkit');
const FONT = path.join(path.dirname(require.resolve('@fontsource/noto-sans/package.json')), 'files/noto-sans-latin-400-normal.woff');
const DISCLAIMER = 'Predictions and confidence scores are model estimates, not proof of authenticity or manipulation. Confidence is not a measure of overall model accuracy. A Grad-CAM heatmap shows regions that contributed to the displayed class score; it does not identify proven manipulated areas. Object detection is not included in this report.';

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

function buildScanReport(scan, heatmap = null, exportedAt = new Date()) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size:'A4', margin:48, font:FONT, bufferPages:true,
      info:{Title:`AuthentiScan Report ${scan.scan_id}`, Author:'AuthentiScan', Subject:'Saved image analysis report'}});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk)); doc.on('error',reject);
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    let escaped = false;
    // Preserve unsupported filename characters visibly instead of silently losing them.
    // eslint-disable-next-line no-control-regex -- Strip non-printing control characters from stored filenames.
    const text = value => Array.from(String(value ?? 'Not available').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')).map(c=>{
      if (c==='\n' || c==='\t' || doc._font.font.hasGlyphForCodePoint(c.codePointAt(0))) return c;
      escaped=true; return `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`;
    }).join('');
    const width = doc.page.width - 96;
    const heading = label => { doc.moveDown(0.7).fillColor('#172554').fontSize(13).text(label); doc.moveDown(0.3); };
    const row = (label,value) => { doc.fillColor('#334155').fontSize(10).text(`${label}: ${text(value)}`, {width, lineGap:3}); doc.moveDown(0.35); };
    try {
      let decoded=null;
      if(heatmap && safePng(heatmap)) { try { decoded=doc.openImage(heatmap); } catch { /* An invalid image must not prevent exporting scores. */ } }
      const analysis = scan.status === 'completed' && scan.result_id ? scan : null;
      doc.fillColor('#111827').fontSize(24).text('AuthentiScan Analysis Report');
      doc.moveDown(0.3).fontSize(10).fillColor('#475569').text('A snapshot of an existing saved scan. No new analysis was performed.');
      heading('Scan details');
      row('Scan ID',scan.scan_id); row('Original filename',scan.original_file_name);
      row('Uploaded at',date(scan.created_at)); row('Analyzed at',analysis ? date(scan.analyzed_at) : 'Not available');
      row('Exported at',date(exportedAt)); row('Scan status',scan.status);
      row('Model version',analysis?.model_version);
      heading('Saved AI result');
      const verdicts={authentic:'Authentic',ai_generated:'AI-generated',uncertain:'Uncertain'};
      row('Verdict',analysis ? verdicts[scan.verdict] || 'Not available' : 'No completed analysis');
      row('Confidence',percent(analysis?.confidence_score));
      row('Authenticity score',percent(analysis?.authentic_score));
      row('AI-generated score',percent(analysis?.ai_generated_score));
      row('Grad-CAM',decoded ? 'Included on the visualization page' : 'Unavailable at export time; no image is included');
      heading('Limitations');
      doc.fontSize(10).fillColor('#334155').text(DISCLAIMER,{width,lineGap:3});
      if(escaped) { doc.moveDown().fontSize(9).text('Some characters are written as [U+XXXX] Unicode code points because the embedded font does not contain them.'); }
      if(decoded) {
        doc.addPage(); doc.fillColor('#111827').fontSize(20).text('Grad-CAM Visualization');
        doc.moveDown().fontSize(10).fillColor('#334155').text(`Saved scan #${scan.scan_id}. Regions contributing to the displayed class score.`,{width});
        doc.image(decoded,48,130,{fit:[width,480],align:'center',valign:'center'});
        doc.fontSize(10).text('This visualization is not proof of manipulation. The saved prediction has not been recalculated.',48,640,{width,lineGap:3});
      }
      const pages=doc.bufferedPageRange();
      for(let i=0;i<pages.count;i++) {
        doc.switchToPage(i); const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
        doc.fillColor('#64748b').fontSize(8).text(`AuthentiScan | Scan ${scan.scan_id} | Page ${i+1} of ${pages.count}`,48,doc.page.height-30,{width,align:'center',lineBreak:false});
        doc.page.margins.bottom=bottom;
      }
      doc.end();
    } catch(error) { doc.destroy(); reject(error); }
  });
}
module.exports={buildScanReport,loadReportHeatmap,percent,DISCLAIMER};

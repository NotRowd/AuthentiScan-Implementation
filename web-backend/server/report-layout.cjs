const path=require('node:path');
const fs=require('node:fs');
const PDFDocument=require('pdfkit');
const fontRoot=path.join(path.dirname(require.resolve('@fontsource/noto-sans/package.json')),'files');
const regular=path.join(fontRoot,'noto-sans-latin-400-normal.woff');
const boldFile=path.join(fontRoot,'noto-sans-latin-700-normal.woff');
const logo=path.join(__dirname,'../src/assets/logo.png');
const C={ink:'#102b48',muted:'#52677d',blue:'#007eaf',line:'#dce7ee',pale:'#f3f8fc',white:'#ffffff',green:'#147958',amber:'#875700',amberBg:'#fff5d9',pink:'#be0065',orange:'#f97316'};

function localDate(value){
  if(!value||!Number.isFinite(new Date(value).getTime()))return 'Not recorded';
  return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
}

async function renderReport(scan,assets,{safePng,percent,heatmapTarget}){
  const {normalizeLocalization,MESORCH_LOCALIZER_MODEL}=await import('../shared/localization-contract.mjs');
  const {normalizeScene}=await import('../shared/scene-provider-contract.mjs');
  const {normalizeFeatureReview,FEATURE_LABELS,FEATURE_NOTE}=await import('../shared/feature-review-contract.mjs');
  const {normalizeObjects}=await import('./object-detection.mjs');
  const {verdictExplanation,heatmapExplanation}=await import('../src/utils/analysisPresentation.js');
  const {originalImageOnly}=await import('../shared/digital-editing-display.mjs');
  const originalOnly=originalImageOnly(scan);
  const complete=scan.status==='completed'&&Boolean(scan.result_id);
  let localization=null,scene=null,detection=null,features=null;
  if(complete){
    try{if(scan.localization)localization=normalizeLocalization(scan.localization,scan.file_sha256);}catch{}
    try{if(scan.scene_analysis)scene=normalizeScene(scan.scene_analysis,scan.file_sha256);}catch{}
    try{if(scan.feature_review)features=normalizeFeatureReview(scan.feature_review,scan.file_sha256);}catch{}
    try{if(scan.object_detection?.status==='available')detection=normalizeObjects(scan.object_detection);}catch{}
  }
  const explanation=verdictExplanation({status:scan.status,analysis:complete?scan:null});
  const id=Number.isSafeInteger(scan.scan_number)&&scan.scan_number>0?scan.scan_number:scan.scan_id;
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:44,font:regular,bufferPages:true,info:{Title:`AuthentiScan - Scan ${id}`,Author:'AuthentiScan',Subject:'Saved image analysis; estimates, not proof'}});
    doc.registerFont('regular',regular);doc.registerFont('bold',fs.existsSync(boldFile)?boldFile:regular);
    const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    const W=doc.page.width-88,M=44,BOTTOM=doc.page.height-64;
    let y=0,escaped=false;
    function clean(value){
      return Array.from(String(value??'Not recorded').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g,' ').replace(/[\u2010-\u2015]/g,'-')).map(c=>{
        if(c==='\n'||c==='\t'||doc._font.font.hasGlyphForCodePoint(c.codePointAt(0)))return c;
        escaped=true;return `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`;
      }).join('');
    }
    function font(size=10,strong=false,color=C.ink){doc.font(strong?'bold':'regular').fontSize(size).fillColor(color);}
    function height(value,width=W,size=10,strong=false){font(size,strong);return doc.heightOfString(clean(value),{width,lineGap:3});}
    function write(value,x,top,width=W,size=10,strong=false,color=C.ink){font(size,strong,color);doc.text(clean(value),x,top,{width,lineGap:3});return doc.y;}
    function box(x,top,width,h,fill=C.pale){doc.save().roundedRect(x,top,width,h,10).fillAndStroke(fill,C.line).restore();}
    function page(title,subtitle,add=true){
      if(add)doc.addPage();
      if(fs.existsSync(logo))doc.image(logo,M,37,{fit:[35,35]});
      write('AuthentiScan',M+44,40,210,17,true);write('IMAGE ANALYSIS REPORT',M+44,64,220,8,false,C.muted);
      write('SAVED RESULTS',doc.page.width-175,45,131,8,true,C.blue);
      doc.moveTo(M,91).lineTo(M+W,91).strokeColor(C.line).lineWidth(1).stroke();
      write(title,M,107,W,23,true);
      y=write(subtitle,M,143,W,9,false,C.muted)+19;
    }
    function ensure(h){if(y+h>BOTTOM)page('Report continued','Saved scan '+id+' | No new analysis was performed.');}
    function paragraph(title,body,{note=null,fill=C.pale,compact=false}={}){
      const size=compact?9:10,bodyOffset=compact?29:36;
      const h=(compact?36:43)+height(body,W-28,size)+(note?height(note,W-28,8.5)+12:0);
      ensure(h+14);box(M,y,W,h,fill);write(title,M+14,y+12,W-28,11,true);
      let end=write(body,M+14,y+bodyOffset,W-28,size);
      if(note)write(note,M+14,end+10,W-28,8.5,false,C.muted);
      y+=h+14;
    }
    function decode(bytes){if(!bytes||!safePng(bytes))return null;try{return doc.openImage(bytes);}catch{return null;}}
    function picture(image,x,top,width,h,label='Image unavailable at export time'){
      box(x,top,width,h,C.white);
      if(!image){write(label,x+14,top+h/2-18,width-28,10,false,C.muted);return null;}
      const scale=Math.min((width-16)/image.width,(h-16)/image.height),iw=image.width*scale,ih=image.height*scale;
      const bounds={x:x+(width-iw)/2,y:top+(h-ih)/2,w:iw,h:ih};
      doc.image(image,bounds.x,bounds.y,{width:iw,height:ih});return bounds;
    }
    function sameAspect(image,width,h){return image&&Math.abs(image.width/image.height-width/h)<.01;}
    try{
      const original=decode(assets.originalImage);
      // An uncertain or mismatched Grad-CAM must not appear to explain a chosen class.
      const heatmap=!originalOnly&&complete&&scan.verdict!=='uncertain'&&(!scan.gradcam||(scan.gradcam.status==='available'&&scan.gradcam.target===scan.verdict))?decode(assets.heatmap):null;
      let localImage=localization?.status==='available'?decode(assets.localizationImage):null;
      if(scan.provider==='truthscan')localImage=decode(assets.localizationImage);
      if(localImage&&scan.provider!=='truthscan'&&!sameAspect(localImage,localization.image_width,localization.image_height))localImage=null;
      if(originalOnly)localImage=null;
      const pixelLocalization=localization?.model_version===MESORCH_LOCALIZER_MODEL;
      let objectImage=detection?decode(assets.objectImage):null;
      if(objectImage&&!sameAspect(objectImage,detection.image_width,detection.image_height))objectImage=null;

      page('Your image analysis','A clear summary of the results saved for this image.',false);
      const name=clean(scan.original_file_name);const nameH=height(name,W,11,true);
      ensure(nameH+40);y=write(name,M,y,W,11,true)+6;
      y=write(`Scan ${id}  |  Uploaded ${localDate(scan.created_at)} (Philippine time)`,M,y,W,8.5,false,C.muted)+17;
      ensure(235);
      const verdict=complete?({authentic:'Authentic',ai_generated:'AI-generated',uncertain:'Uncertain'}[scan.verdict]||'Not available'):'No AI result';
      const color=scan.verdict==='authentic'&&complete?C.green:scan.verdict==='ai_generated'&&complete?C.blue:C.amber;
      const left=244,right=W-left-14,start=y;
      box(M,start,left,218);write('OVERALL RESULT',M+16,start+16,left-32,8.5,true,C.muted);
      write(verdict,M+16,start+38,left-32,24,true,color);
      const validScore=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
      if(complete&&scan.provider==='truthscan'){
        const value=scan.provider_label_confidence;
        const editing=scan.provider_label==='Digitally Edited';
        const label=editing?'Reported confidence':scan.provider_label==='AI Edited'?'Confidence in detected AI editing':scan.verdict==='uncertain'?'Returned label confidence':'Confidence in this classification';
        write(label,M+16,start+90,left-32,9,true);
        write(validScore(value)?percent(value):'Not supplied',M+16,start+111,left-32,26,true,color);
        doc.roundedRect(M+16,start+157,left-32,6,3).fill(C.line);
        if(validScore(value)&&value>0)doc.roundedRect(M+16,start+157,(left-32)*value,6,Math.min(3,(left-32)*value/2)).fill(color);
        write(editing?'Editing confidence, not confidence in authenticity.':scan.provider_label==='AI Edited'?'AI-editing confidence; the entire image may not be generated.':'Confidence in the returned label, not a verified probability.',M+16,start+178,left-32,8,false,C.muted);
      }else{
        const rows=[['Authentic',complete?scan.authentic_score:null],['AI-generated',complete?scan.ai_generated_score:null]];
        for(const [index,[label,value]] of rows.entries()){
          const top=start+91+index*51;
          write(label,M+16,top,140,10,true);write(validScore(value)?percent(value):'Not supplied',M+left-79,top,63,10,true,color);
          doc.roundedRect(M+16,top+24,left-32,6,3).fill(C.line);
          if(validScore(value)&&value>0)doc.roundedRect(M+16,top+24,(left-32)*value,6,Math.min(3,(left-32)*value/2)).fill(index?C.blue:C.green);
        }
        write('Model scores, not verified probabilities.',M+16,start+194,left-32,8,false,C.muted);
      }
      write('ORIGINAL IMAGE',M+left+14,start+1,right,8.5,true,C.muted);
      picture(original,M+left+14,start+22,right,196,'Original image unavailable');
      y=start+233;
      paragraph('What this result means',explanation.summary,{note:explanation.policy||(complete?'The original saved decision is shown unchanged.':'No scores are available for this scan.')});
      if(complete&&scan.provider!=='truthscan')paragraph('Image description',scene?.observation||'No image description was saved when this report was exported.',{note:scene
        ?'Automatic observation from the local vision model. It may miss or invent details and is not the classifier\'s reason for its verdict.'
        :'Open this scan in the app, wait for the automatic description to finish, then export again. Exporting does not run the description model.'});
      else if(!complete)paragraph('Analysis status',scan.analysis_error?.message||'This scan has no completed AI analysis. No classification, heatmap or edited-region finding is reported.');
      // The footer already carries this caveat; do not orphan it on a new page.
      const reviewNote='Use this report as a review aid, not proof of authenticity or manipulation. Filters, conventional editing and AI generation are different possibilities.';
      if(y+height(reviewNote,W,9)+16<=BOTTOM)y=write(reviewNote,M,y,W,9,false,C.muted)+16;

      if(complete){
        page('What looks unusual?','Saved visual observations - separate from the classification, not confirmed edits.');
        if(scan.provider==='truthscan'){
          paragraph('Visual review summary',scan.provider_review?.text||'No written analysis was saved.',{note:'Automated visual analysis. Observations may be incorrect.'});
        }else if(features){
          const concerns=features.findings.filter(item=>item.status==='possible_concern');
          paragraph('Visual review summary',concerns.length?`${concerns.length} possible visual concern${concerns.length===1?'':'s'} reported. Read the observations below and compare with the original image.`:features.findings.every(item=>item.status==='unable_to_assess')?'The model could not reliably assess these features. This does not establish authenticity.':'No clear visual concern was reported. Some checks may be inconclusive; this does not establish authenticity.',{note:FEATURE_NOTE});
          for(const item of features.findings){
            const status={possible_concern:'Possible visual concern',no_clear_concern:'No clear concern reported',unable_to_assess:'Unable to assess'}[item.status];
            paragraph(`${FEATURE_LABELS[item.category]} - ${status}`,item.observation,{compact:true,fill:item.status==='possible_concern'?C.amberBg:C.pale});
          }
        }else paragraph('Visual review not available','No valid visual-feature review was saved at export time. Open the saved scan and retry the review if needed, then export again. Exporting does not run AI or use a scan credit.');
        paragraph('What to do next','Check the image source and compare it with the original, if available. Unusual content alone does not tell you whether an image was AI-generated, manually edited, staged, or an optical illusion.');
        if(originalOnly){
          page('Original image','The uploaded image is shown without a heatmap.');
          picture(original,M,y,W,440,'Original image unavailable');
          y+=456;
        }else{
        page('Suspected edit regions','Compare the original image with the model highlights.');
        const top=y, gap=16,col=(W-gap)/2, x2=M+col+gap;
        box(M,top,col,424);box(x2,top,col,424);
        write('Original image',M+14,top+14,col-28,13,true);
        picture(original,M+12,top+86,col-24,222,'Original image unavailable');

        write(pixelLocalization?'Suspected edit regions':'Edited-area check',x2+14,top+14,col-28,13,true);
        const localLabel=scan.provider==='truthscan'?(localImage?'Heatmap available':'Heatmap unavailable'):localization?.status==='uncertain'?'No reliable region':localization?.status==='available'?(pixelLocalization?'Suggestions available':'Unverified candidate areas'):'Not assessed / unavailable';
        write(localLabel,x2+14,top+42,col-28,10,true,C.amber);
        const bounds=picture(localImage||original,x2+12,top+86,col-24,222,'Original image unavailable');
        if(localImage&&bounds&&!pixelLocalization&&scan.provider!=='truthscan'){
          doc.save().fillColor(C.pink).fillOpacity(.4);
          for(let i=0;i<1024;i++)if(localization.mask[i])doc.rect(bounds.x+(i%32)*bounds.w/32,bounds.y+Math.floor(i/32)*bounds.h/32,bounds.w/32,bounds.h/32).fill();
          doc.restore();
        }
        write(scan.provider==='truthscan'?(localImage?'Analysis heatmap. Highlights are areas for review, not confirmed edited boundaries.':'Original image only. No heatmap was supplied for this saved result.'):localImage?(pixelLocalization?'Orange = areas suggested for review, not confirmed edits.':'Pink = saved candidate areas, not confirmed edits.'):localization?.status==='available'?'Candidate map recorded; aligned preview unavailable. No highlights are shown.':original?'Original image only. No reliable edited area is identified.':'No preview is available. No reliable edited area is identified.',x2+14,top+320,col-28,9,true);
        write(pixelLocalization?'The model may miss edits or highlight original content. These results do not change the classifier.':'Unmarked areas are not verified authentic. An uncertain region does not prove that the image is unedited.',x2+14,top+372,col-28,9,false,C.muted);
        y=top+440;
        if(localization?.usage_mode==='experimental')paragraph('Localization limitation','This model failed validation. Its suggested regions may be wrong; do not use them as reliable manipulation evidence.',{fill:C.amberBg,note:'Evaluated on FLUX.1-dev partial edits only. Other generators, fully generated images and scene anomalies are not validated. The optional unverified score preview is not exported.'});
        else if(pixelLocalization)paragraph('Known localization limits','In the current development holdout, the model missed edited areas in 13 of 24 edited images and highlighted areas in 7 of 12 authentic images. Use orange regions only as review suggestions.',{fill:C.amberBg,note:'This pixel-level model is separate from the classifier and Grad-CAM. Its output is not proof and does not change the saved class result.'});
        else paragraph('How to read the highlights',scan.provider==='truthscan'?'The heatmap is saved as supplied by the analysis service. No binary manipulation mask or edited-pixel count was supplied.':'Localization estimates possible edited areas. Missing results do not prove authenticity.');
        }
        if(!detection&&scan.provider!=='truthscan')paragraph('Object context','No valid object detections were saved for this scan. This does not mean the image is empty.');
      }

      if(detection){
        page('Objects in the image','Objects only - not edited regions, authenticity, or impossible scenes. Labels may be wrong.');
        const top=y;
        const bounds=picture(objectImage,M,top,W,242,'Object preview unavailable. Saved detections are listed below.');
        if(bounds){
          for(const [i,object] of detection.objects.entries()){
            const [x1,y1,x2,y2]=object.box,x=bounds.x+x1*bounds.w,ty=bounds.y+y1*bounds.h;
            doc.save().strokeColor(C.blue).lineWidth(1.3).rect(x,ty,(x2-x1)*bounds.w,(y2-y1)*bounds.h).stroke();
            const lx=Math.min(x,bounds.x+bounds.w-19),ly=Math.min(ty,bounds.y+bounds.h-17);
            doc.rect(lx,ly,19,17).fill(C.blue);write(i+1,lx+4,ly+2,16,8,true,C.white);doc.restore();
          }
        }
        y=top+253;
        y=write('Boxes use the detector\'s image orientation; EXIF rotation is not applied. Detection scores do not measure authenticity. Object detections do not change the saved classification.',M,y,W,9,false,C.muted)+16;
        y=write(`Detected objects (${detection.objects.length})`,M,y,W,12,true)+12;
        if(!detection.objects.length)y=write('No supported objects reached the 50% detection threshold.',M,y,W,10)+16;
        for(let i=0;i<detection.objects.length;i+=2){
          const col=(W-16)/2,pair=detection.objects.slice(i,i+2);
          const labels=pair.map((o,j)=>`${i+j+1}. ${o.label}  |  Detection score: ${percent(o.score)}`);
          const rh=Math.max(...labels.map(label=>height(label,col-20,9)))+16;ensure(rh+8);
          labels.forEach((label,j)=>{box(M+j*(col+16),y,col,rh);write(label,M+j*(col+16)+10,y+8,col-20,9);});y+=rh+8;
        }
        if(detection.truncated){ensure(28);y=write('Only the 20 highest-scoring detections are listed.',M,y,W,9,false,C.muted)+12;}
      }

      const pages=doc.bufferedPageRange();
      for(let i=0;i<pages.count;i++){
        doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
        doc.moveTo(M,doc.page.height-54).lineTo(M+W,doc.page.height-54).strokeColor(C.line).stroke();
        write(`Saved scan ${id} | Estimates, not proof`,M,doc.page.height-44,W-95,7.5,false,C.muted);
        write(`Page ${i+1} of ${pages.count}`,M+W-86,doc.page.height-44,86,7.5,false,C.muted);
        if(escaped)write('Unsupported characters are preserved as [U+XXXX] Unicode code points.',M,doc.page.height-28,W,7,false,C.muted);
        doc.page.margins.bottom=bottom;
      }
      doc.end();
    }catch(error){doc.destroy();reject(error);}
  });
}
module.exports={renderReport};

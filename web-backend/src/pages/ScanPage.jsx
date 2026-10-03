import React, { useRef, useState } from 'react';
import {scorePresentation} from '../utils/analysisPresentation';
import AnalysisExplanation from '../components/common/AnalysisExplanation';
import { Link } from 'react-router-dom';
import { 
  UploadCloud, 
  Sparkles, 
  Layers, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import ScanCreditNotice from '../components/common/ScanCreditNotice';
import ProtectedHeatmap from '../components/common/ProtectedHeatmap';
import { uploadScanImage } from '../services/api';

export default function ScanPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedScan, setUploadedScan] = useState(null);
  const uploadBusy = useRef(false);

  const handleFileChange = (e) => {
    if (uploadBusy.current) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setError('');
      setUploadedScan(null);
      e.target.value = '';

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0) {
        setSelectedFile(null);
        setError('Choose a non-empty JPG, PNG, or WebP image. HEIC and other formats are not supported.');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setSelectedFile(null);
        setError('This image is too large. The upload limit is 10 MB.');
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (uploadBusy.current) return;
    setError('');
    setUploadedScan(null);

    if (!selectedFile) {
      setError('Choose a JPG, PNG, or WebP image before uploading.');
      return;
    }

    setIsUploading(true);
    uploadBusy.current = true;

    try {
      const response = await uploadScanImage(selectedFile);
      setUploadedScan(response.data);
    } catch (requestError) {
      setError(requestError.message || 'The request failed. Check History before uploading again; the server may already have saved the image.');
    } finally {
      setIsUploading(false);
      uploadBusy.current = false;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan Image</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload an image for AI classification and a Grad-CAM heatmap.
          </p>
        </div>

        {/* Notice Info Pill */}
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-brand-200 leading-relaxed">
            <span className="font-semibold text-white">What to expect:</span> Your image is saved to your account and sent for EfficientNet-B0 classification and a Grad-CAM heatmap when the AI service is available. Results are estimates, not proof.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Upload Zone & Options */}
          <div className="lg:col-span-2 space-y-6">
            <Card title="1. Choose your image" subtitle="JPEG, PNG, or WebP · Up to 10 MB">
              <div className="mt-4 border-2 border-dashed border-slate-700 hover:border-brand-500/60 focus-within:border-brand-400 rounded-xl p-6 text-center transition-colors bg-slate-900/40 relative">
                <input
                  type="file"
                  aria-label="Choose image for analysis"
                  disabled={isUploading}
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center">
                  <div className="p-4 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-3">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white break-all">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <span className="inline-block mt-2 text-xs text-brand-400 hover:underline cursor-pointer">
                        {isUploading ? 'Please wait until this scan finishes' : 'Click to change image'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        <span className="text-brand-300">Browse for an image</span> to get started
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        JPEG, PNG, or WebP up to 10 MB. Scores are estimates, not proof.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="2. Start your analysis" subtitle="Classification and a visual explanation">
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-brand-300 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold">Included in your analysis</h3>
                    <p className="text-sm text-slate-400 leading-relaxed mt-2">An authenticity classification, class scores, and a Grad-CAM heatmap when available. The result is saved to your history.</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4 border-t border-slate-800 pt-3">Regular (Free) accounts get 5 scans per day, resetting at 12:00 AM Philippine time (Asia/Manila). Unused scans do not carry over. Completed scans use one credit on the day they were started; queued or processing scans reserve one. Failed scans do not count. Viewing history and exporting PDFs are free. Object detection is not currently available.</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile}
                  className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 text-white shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  {isUploading ? 'Uploading and analysing…' : 'Upload Image for Analysis'}
                </button>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {error}
                </p>
              )}
            </Card>
          </div>

          {/* Results Workspace Placeholder Sidebar */}
          <div className="space-y-6">
            <Card title="Your result" subtitle="EfficientNet-B0 prediction">
              {uploadedScan?.scan_id && <Link to={`/scans/${uploadedScan.scan_id}`} className="button-secondary w-full mb-3">View full saved result →</Link>}
              {uploadedScan?.scan_id && <ExportReportButton key={uploadedScan.scan_id} scanId={uploadedScan.scan_id} />}
              <div aria-live="polite" className="mt-4 flex flex-col items-center justify-center p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center min-h-[300px]">
                {uploadedScan?.analysis ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                    <p className="text-sm font-semibold text-emerald-300">Analysis completed</p>
                    <div className="mt-3"><StatusBadge status={uploadedScan.analysis.verdict} /></div>
                    <p className="text-xs text-slate-400 mt-3 max-w-xs">Class scores are estimates, not proof or overall model accuracy.</p>
                    <AnalysisExplanation result={uploadedScan.analysis}/>
                    <ProtectedHeatmap key={uploadedScan.scan_id} scanId={uploadedScan.scan_id} available={Boolean(uploadedScan.analysis.heatmap_url)} className="mt-4 max-h-44 rounded-lg border border-slate-700 object-contain" />
                  </>
                ) : uploadedScan ? (
                  <>
                    <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
                    <p className="text-sm font-semibold text-amber-300">{uploadedScan.status === 'failed' ? 'Analysis failed' : 'Image saved; analysis is pending'}</p>
                    <p className="text-xs text-slate-400 mt-2 max-w-xs">Scan #{uploadedScan.scan_id} remains in your history. {uploadedScan.analysis_error?.message || 'Check the AI service and your saved scan status before submitting another image.'}</p>
                  </>
                ) : (
                  <>
                    <Layers className="w-10 h-10 text-slate-600 mb-3" />
                    <p className="text-sm font-semibold text-slate-400">{isUploading ? 'Analysis request in progress' : 'No active analysis yet'}</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      {isUploading ? 'Please wait. Avoid submitting the image again while this request is running.' : 'Choose an image and start analysis. Results will also be saved in History.'}
                    </p>
                  </>
                )}
              </div>

              <ScanCreditNotice scan={uploadedScan} />
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400">
                <div className="flex items-center justify-between py-1">
                  <span>Classification Result:</span>
                  <span className="font-mono text-slate-500 break-all">{uploadedScan?.analysis?.verdict || (uploadedScan ? uploadedScan.status : 'Awaiting upload')}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>{uploadedScan?.analysis?scorePresentation(uploadedScan.analysis).label:'Class score'}:</span>
                  <span className="font-mono text-slate-500">{uploadedScan?.analysis ? `${(scorePresentation(uploadedScan.analysis).value * 100).toFixed(2)}%` : 'Not available yet'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Grad-CAM Status:</span>
                  <span className="font-mono text-slate-500">{uploadedScan?.analysis?.heatmap_url ? 'Image supplied' : uploadedScan ? 'Not supplied' : 'Awaiting analysis'}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

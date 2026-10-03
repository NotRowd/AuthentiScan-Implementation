import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, Sparkles, Layers, AlertCircle, CheckCircle2, Image as ImageIcon, ArrowRight, RefreshCw, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import ScanCreditNotice from '../components/common/ScanCreditNotice';
import ProtectedHeatmap from '../components/common/ProtectedHeatmap';
import AnalysisExplanation from '../components/common/AnalysisExplanation';
import { scorePresentation } from '../utils/analysisPresentation';
import { uploadScanImage } from '../services/api';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function ScanPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedScan, setUploadedScan] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const uploadBusy = useRef(false);

  const handleFileChange = (e) => {
    if (uploadBusy.current) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setError('');
      setUploadedScan(null);
      e.target.value = '';

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

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
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadedScan(null);
    setError('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
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

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-8 max-w-6xl mx-auto">
        
        {/* Header Section */}
        <motion.div variants={fadeIn} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-[0.15em] mb-2">Analysis Workspace</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Scan Image</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">
              Upload an image for AI classification and an explainable heatmap.
            </p>
          </div>
        </motion.div>

        {/* Notice Info Pill */}
        <motion.div variants={fadeIn} className="p-5 rounded-2xl bg-sky-50/50 border border-sky-100 flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-sm text-slate-600 font-medium leading-relaxed pt-1.5">
            <strong className="text-slate-900">What to expect:</strong> Your image is saved and analyzed using our EfficientNet-B0 model when available. Results are estimates, not absolute proof.
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Main Upload Zone */}
          <motion.div variants={fadeIn} className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-tr from-sky-100/50 to-transparent rounded-full -ml-20 -mt-20 blur-2xl pointer-events-none"></div>
              
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">1. Upload Image</h2>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">JPEG, PNG, or WebP &bull; Up to 10 MB</p>
                </div>
              </div>

              {!selectedFile ? (
                <div className="relative z-10 bg-slate-50 border-2 border-dashed border-slate-200 hover:border-sky-300 rounded-2xl p-10 text-center transition-all group focus-within:border-sky-400 focus-within:bg-white cursor-pointer">
                  <input
                    type="file"
                    aria-label="Choose image for analysis"
                    disabled={isUploading}
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                  />
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-sky-200 group-hover:shadow-sm transition-all duration-300">
                      <ImageIcon className="w-8 h-8 text-sky-400 group-hover:text-sky-500 transition-colors" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">Select an image to analyze</h3>
                    <p className="text-sm font-medium text-slate-500">Drag and drop, or click to browse</p>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-32 h-32 rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0 shadow-sm relative group">
                      {previewUrl ? (
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-10 h-10 text-slate-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                      {!isUploading && (
                        <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-xs font-bold">
                          Change
                          <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} className="hidden" />
                        </label>
                      )}
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="font-bold text-slate-900 break-all text-lg mb-1">{selectedFile.name}</h3>
                      <p className="text-sm font-medium text-slate-500 mb-4">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      
                      {isUploading ? (
                        <div className="flex items-center justify-center sm:justify-start gap-2 text-sky-600 font-bold text-sm bg-sky-50 px-4 py-2 rounded-lg inline-flex">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Processing Analysis...
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                          <button
                            type="button"
                            onClick={handleUpload}
                            className="px-6 py-2.5 rounded-xl font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 hover:shadow-sky-500/40 transition-all flex items-center gap-2"
                          >
                            <Sparkles className="w-4 h-4" /> Analyze Now
                          </button>
                          <button
                            type="button"
                            onClick={resetUpload}
                            className="px-6 py-2.5 rounded-xl font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-rose-500 hover:border-rose-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 relative z-10">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-rose-800">Unable to analyze image</h4>
                    <p className="text-sm font-medium text-rose-600 mt-1">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Results Sidebar */}
          <motion.div variants={fadeIn} className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">2. Scan Result</h2>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Live AI Analysis</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                {uploadedScan?.analysis ? (
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key="completed"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-4">Analysis Complete</h3>
                      
                      <div className="mb-6 w-full flex justify-center">
                        <StatusBadge status={uploadedScan.analysis.verdict} />
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 w-full text-left mb-6">
                        <AnalysisExplanation result={uploadedScan.analysis} />
                      </div>

                      <div className="w-full mb-6">
                        <p className="text-sm font-bold text-slate-700 mb-3 text-left">Grad-CAM Heatmap</p>
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex justify-center p-2">
                          <ProtectedHeatmap key={uploadedScan.scan_id} scanId={uploadedScan.scan_id} available={Boolean(uploadedScan.analysis.heatmap_url)} className="max-h-48 object-contain" />
                        </div>
                      </div>

                      <div className="flex flex-col w-full gap-3 mt-auto">
                        <Link to={`/scans/${uploadedScan.scan_id}`} className="w-full py-3 rounded-xl font-bold bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors flex items-center justify-center gap-2">
                          View Full Report <ArrowRight className="w-4 h-4" />
                        </Link>
                        <ExportReportButton key={uploadedScan.scan_id} scanId={uploadedScan.scan_id} />
                      </div>
                    </motion.div>
                  </AnimatePresence>
                ) : uploadedScan ? (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50"
                  >
                    <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">{uploadedScan.status === 'failed' ? 'Analysis Failed' : 'Analysis Pending'}</h3>
                    <p className="text-sm font-medium text-slate-500 mt-2">
                      Scan #{uploadedScan.scan_id} is saved. {uploadedScan.analysis_error?.message || 'Check your scan history later if processing is delayed.'}
                    </p>
                  </motion.div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 group">
                    <Layers className={`w-12 h-12 mb-4 transition-colors ${isUploading ? 'text-sky-400 animate-pulse' : 'text-slate-300 group-hover:text-sky-300'}`} />
                    <h3 className="text-lg font-bold text-slate-900">
                      {isUploading ? 'Processing...' : 'Awaiting Analysis'}
                    </h3>
                    <p className="text-sm font-medium text-slate-500 mt-2 max-w-[250px]">
                      {isUploading 
                        ? 'Please wait while we securely transmit and process your image.' 
                        : 'Upload an image and click Analyze to see your results here.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Stats Footer */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <ScanCreditNotice scan={uploadedScan} />
                <div className="mt-4 space-y-2 text-xs font-medium text-slate-500">
                  <div className="flex items-center justify-between py-1">
                    <span>Result Status:</span>
                    <span className="font-bold text-slate-700">{uploadedScan?.analysis?.verdict || (uploadedScan ? uploadedScan.status : 'Waiting')}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>{uploadedScan?.analysis ? scorePresentation(uploadedScan.analysis).label : 'Confidence Score'}:</span>
                    <span className="font-bold text-slate-700">{uploadedScan?.analysis ? `${(scorePresentation(uploadedScan.analysis).value * 100).toFixed(2)}%` : '—'}</span>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        </div>

      </motion.div>
    </DashboardLayout>
  );
}

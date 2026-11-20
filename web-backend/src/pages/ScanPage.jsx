import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, Sparkles, Layers, AlertCircle, CheckCircle2, Image as ImageIcon, ArrowRight, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import CompletedScanWorkspace from '../components/common/CompletedScanWorkspace';
import ScanAllowance from '../components/common/ScanAllowance';
import useScanUpload from '../hooks/useScanUpload';
import {scanNumber} from '../utils/scanNumber';

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
  const [uploadedScan, setUploadedScan] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const {error, setError, busy: isUploading, stage, uploadBusy, run} = useScanUpload();

  const selectFile = (file) => {
    if (uploadBusy.current) return;
    if (file) {
      setError('');
      setUploadedScan(null);

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

  const handleFileChange = (e) => {
    selectFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    selectFile(e.dataTransfer.files?.[0]);
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
    setUploadedScan(null);
    const saved = await run(selectedFile);
    if (saved) setUploadedScan(saved);
  };

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (uploadedScan?.status === 'completed' && uploadedScan.analysis) {
    return <DashboardLayout wide><CompletedScanWorkspace scan={uploadedScan} file={selectedFile} previewUrl={previewUrl} onChooseAnother={resetUpload}/></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-8 max-w-6xl mx-auto">
        
        {/* Header Section */}
        <motion.div variants={fadeIn} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-accent uppercase tracking-[0.15em] mb-2">Analysis Workspace</p>
            <h1 className="text-3xl font-bold text-ink tracking-tight">Scan Image</h1>
            <p className="text-sm font-medium text-ink-muted mt-2">
              Upload an image for classification and suspected edit regions.
            </p>
          </div>
        </motion.div>

        {/* Notice Info Pill */}
        <motion.div variants={fadeIn} className="p-5 rounded-2xl bg-accent-soft/50 border border-line flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="text-sm text-ink-secondary font-medium leading-relaxed pt-1.5">
            <strong className="text-ink">What to expect:</strong> Your image is saved and analyzed for classification and available review highlights. Results are estimates, not absolute proof.
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Main Upload Zone */}
          <motion.div variants={fadeIn} className="lg:col-span-7 space-y-6">
            <div className="bg-surface rounded-3xl p-6 sm:p-8 border border-line shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-tr from-accent-soft/50 to-transparent rounded-full -ml-20 -mt-20 blur-2xl pointer-events-none"></div>
              
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">1. Upload Image</h2>
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mt-1">JPEG, PNG, or WebP &bull; Up to 10 MB</p>
                </div>
              </div>

              {!selectedFile ? (
                <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} className="relative z-10 bg-canvas border-2 border-dashed border-line hover:border-line rounded-2xl p-10 text-center transition-[background-color,border-color,box-shadow,transform] group focus-within:border-accent focus-within:bg-surface cursor-pointer">
                  <input
                    type="file"
                    aria-label="Choose image for analysis"
                    disabled={isUploading}
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                  />
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-line group-hover:shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-300">
                      <ImageIcon className="w-8 h-8 text-accent group-hover:text-accent transition-colors" />
                    </div>
                    <h3 className="text-lg font-bold text-ink mb-1">Select an image to analyze</h3>
                    <p className="text-sm font-medium text-ink-muted">Drag and drop, or click to browse</p>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 bg-canvas border border-line rounded-2xl p-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-32 h-32 rounded-xl border border-line bg-surface overflow-hidden shrink-0 shadow-sm relative group">
                      {previewUrl ? (
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-10 h-10 text-ink-muted absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                      {!isUploading && (
                        <label className="absolute inset-0 bg-overlay/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-overlay-ink text-xs font-bold">
                          Change
                          <input type="file" aria-label="Change selected image" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} className="sr-only" />
                        </label>
                      )}
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="font-bold text-ink break-all text-lg mb-1">{selectedFile.name}</h3>
                      <p className="text-sm font-medium text-ink-muted mb-4">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      
                      {isUploading ? (
                        <div role="status" className="flex items-center justify-center sm:justify-start gap-2 text-accent font-bold text-sm bg-accent-soft px-4 py-2 rounded-lg inline-flex">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {stage}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                          <button
                            type="button"
                            onClick={handleUpload}
                            disabled={Boolean(uploadedScan)}
                            className="theme-action px-6 py-2.5 rounded-xl font-bold bg-action hover:bg-action-hover disabled:bg-surface-raised disabled:text-ink-secondary disabled:cursor-not-allowed text-on-action shadow-md shadow-accent/20 hover:shadow-accent/40 transition-[background-color,border-color,box-shadow,transform] flex items-center gap-2"
                          >
                            <Sparkles className="w-4 h-4" /> {uploadedScan ? 'Scan saved' : 'Analyze Now'}
                          </button>
                          <button
                            type="button"
                            onClick={resetUpload}
                            className="px-6 py-2.5 rounded-xl font-bold border border-line bg-surface text-ink-secondary hover:bg-canvas hover:text-danger hover:border-danger transition-colors"
                          >
                            {uploadedScan ? 'Choose another image' : 'Cancel'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="mt-4 p-4 rounded-xl bg-danger-soft border border-danger flex items-start gap-3 relative z-10">
                  <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-danger">Unable to analyze image</h4>
                    <p className="text-sm font-medium text-danger mt-1">{error}</p>
                    <Link to="/history" className="block mt-2 text-sm font-semibold text-danger underline">Check Scan History</Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Results Sidebar */}
          <motion.div variants={fadeIn} className="lg:col-span-5 space-y-6">
            <div className="bg-surface rounded-3xl p-6 sm:p-8 border border-line shadow-sm flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center">
                  <FileText className="w-5 h-5 text-ink-muted" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">2. Scan Result</h2>
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mt-1">Live AI Analysis</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                {uploadedScan ? (
                  <motion.div 
                    role="status"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-line rounded-2xl bg-canvas"
                  >
                    <AlertCircle className="w-12 h-12 text-warning mb-4" />
                    <h3 className="text-lg font-bold text-ink">{uploadedScan.status === 'failed' ? 'Analysis Failed' : 'Analysis Pending'}</h3>
                    <p className="text-sm font-medium text-ink-muted mt-2">
                      Scan {scanNumber(uploadedScan)} is saved. {uploadedScan.analysis_error?.message || 'Check your scan history later if processing is delayed.'}
                    </p>
                    <Link to={`/scans/${uploadedScan.scan_id}`} className="mt-4 text-sm font-bold text-accent underline">View saved scan</Link>
                  </motion.div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-line rounded-2xl bg-canvas group">
                    <Layers className={`w-12 h-12 mb-4 transition-colors ${isUploading ? 'text-accent animate-pulse' : 'text-ink-muted group-hover:text-accent'}`} />
                    <h3 className="text-lg font-bold text-ink">
                      {isUploading ? 'Processing…' : 'Awaiting Analysis'}
                    </h3>
                    <p className="text-sm font-medium text-ink-muted mt-2 max-w-[250px]">
                      {isUploading 
                        ? 'We’re checking your image and preparing the result. The visual check may take a few minutes.'
                        : 'Upload an image and click Analyze to see your results here.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-line pt-4"><ScanAllowance scan={uploadedScan}/></div>

            </div>
          </motion.div>
        </div>

      </motion.div>
    </DashboardLayout>
  );
}

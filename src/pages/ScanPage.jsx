import React, { useState } from 'react';
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Eye, 
  Box, 
  Sparkles, 
  Layers, 
  AlertCircle,
  FileText
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';

export default function ScanPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [enableGradCam, setEnableGradCam] = useState(true);
  const [enableObjectDetection, setEnableObjectDetection] = useState(true);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan Image</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload a static image to prepare for classification, Grad-CAM heatmaps, and object detection.
          </p>
        </div>

        {/* Notice Info Pill */}
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-brand-200 leading-relaxed">
            <span className="font-semibold text-white">Frontend Scaffold Mode:</span> This layout provides the user interface for static image upload and feature configuration. AI inference (EfficientNet-B0) will be connected when backend integration is enabled.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Upload Zone & Options */}
          <div className="lg:col-span-2 space-y-6">
            <Card title="1. Static Image Upload" subtitle="Supported formats: JPG, PNG, WebP (Max 15MB)">
              <div className="mt-4 border-2 border-dashed border-slate-700 hover:border-brand-500/60 rounded-xl p-8 text-center transition-colors bg-slate-900/40 relative">
                <input
                  type="file"
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
                      <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <span className="inline-block mt-2 text-xs text-brand-400 hover:underline cursor-pointer">
                        Click to change image
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        Drag and drop your image here, or <span className="text-brand-400">browse</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        High resolution static images recommended for best accuracy
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="2. Model Options & Feature Toggles" subtitle="Configure explainable AI outputs">
              <div className="mt-4 space-y-4">
                <label className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-indigo-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">Grad-CAM Visual Heatmap</div>
                      <div className="text-xs text-slate-400">Generate XAI activation overlays showing focus areas</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableGradCam}
                    onChange={(e) => setEnableGradCam(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center gap-3">
                    <Box className="w-5 h-5 text-cyan-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">Object Detection Overlay</div>
                      <div className="text-xs text-slate-400">Detect key objects and bounding boxes</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableObjectDetection}
                    onChange={(e) => setEnableObjectDetection(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500"
                  />
                </label>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  Analyze Image (Frontend Ready)
                </button>
              </div>
            </Card>
          </div>

          {/* Results Workspace Placeholder Sidebar */}
          <div className="space-y-6">
            <Card title="Analysis Output Area" subtitle="Placeholder for future model results">
              <div className="mt-4 flex flex-col items-center justify-center p-8 rounded-xl border border-slate-800 bg-slate-900/40 text-center min-h-[300px]">
                <Layers className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-400">No active analysis yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Once AI backend is connected, classification results, confidence scores, and Grad-CAM heatmaps will render here.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400">
                <div className="flex items-center justify-between py-1">
                  <span>Classification Result:</span>
                  <span className="font-mono text-slate-500">Waiting for backend</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Confidence Score:</span>
                  <span className="font-mono text-slate-500">Waiting for backend</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Grad-CAM Status:</span>
                  <span className="font-mono text-slate-500">{enableGradCam ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

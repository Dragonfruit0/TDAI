import React from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, Key, ExternalLink } from 'lucide-react';

interface ApiKeyErrorModalProps {
  onClose: () => void;
  details?: string;
}

export const ApiKeyErrorModal: React.FC<ApiKeyErrorModalProps> = ({ onClose, details }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg bg-zinc-950 border border-red-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
      >
        {/* Glow Decor */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black tracking-tight text-white mb-1">Gemini API Key Restriction Issue</h3>
            <span className="text-xs text-red-400 font-mono block mb-4 uppercase tracking-wider">INVALID_KEY_RESTRICTION</span>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 flex items-center justify-center transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-zinc-300 text-xs leading-relaxed bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
            Your current API Key is too restricted to perform this request. Typically, this happens if the API key created in the Google Cloud Console is restricted to <strong className="text-red-400">"Agent Platform (Vertex) API"</strong> only, which blocks access to standard Gemini Developer API endpoints.
          </p>

          <div className="space-y-3">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-emerald-400" /> Key Actions to Unlock
            </h4>
            
            <div className="space-y-2 text-xs">
              <div className="flex gap-3 items-start bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex-1 text-zinc-300 leading-relaxed">
                  <span className="font-bold text-white block mb-0.5">Edit API Key Restrictions</span>
                  Go to <strong className="text-white">Google Cloud Console &rarr; APIs & Services &rarr; Credentials</strong>, then click on the API Key you currently configured under settings.
                </div>
              </div>

              <div className="flex gap-3 items-start bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex-1 text-zinc-300 leading-relaxed">
                  <span className="font-bold text-white block mb-0.5">Toggle / Expand Enabled APIs</span>
                  Scroll down to <strong className="text-white">API restrictions</strong>. You can either select <strong className="text-emerald-400 font-semibold">"Don't restrict key"</strong> (recommended for development), or under <strong className="text-white">"Restrict key"</strong>, make sure <strong className="text-emerald-400 font-semibold">"Generative Language API"</strong> is checked alongside Agent Platform API.
                </div>
              </div>

              <div className="flex gap-3 items-start bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  3
                </div>
                <div className="flex-1 text-zinc-300 leading-relaxed">
                  <span className="font-bold text-white block mb-0.5">Save & Retry</span>
                  Click <strong className="text-white">Save</strong>. Wait exactly 2-3 minutes for Google's edge cache to refresh, and re-run your prompt! It will run smoothly.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-300 font-medium text-xs transition-all"
          >
            I understand
          </button>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-bold text-xs transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
          >
            Open Credentials Page <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </motion.div>
    </div>
  );
};

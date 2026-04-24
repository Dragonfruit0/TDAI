
import React from 'react';
import { X, Zap, ArrowRight, Star } from 'lucide-react';
import { Button } from './Button';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSub: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, onSelectSub }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0f0f0f] border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center mb-6 border border-zinc-800">
            <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500" />
          </div>

          <h2 className="text-2xl font-bold mb-2">You've used your free Flash</h2>
          <p className="text-zinc-400 mb-8">
            Anqair generations are fast, high-quality, and cost-effective. Refuel your studio to keep creating.
          </p>

          <div className="space-y-4">
            {/* Primary Option */}
            <div className="p-6 bg-white rounded-xl group cursor-pointer active:scale-[0.98] transition-all hover:bg-zinc-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-black font-bold text-lg">3 More Flashes</span>
                <span className="text-black font-bold text-xl">₹10</span>
              </div>
              <p className="text-zinc-600 text-sm mb-4">One-time payment. Never expires.</p>
              <Button variant="primary" className="w-full bg-black text-white hover:bg-zinc-800 border-none group-hover:scale-[1.01]">
                Refill Instantly
              </Button>
            </div>

            {/* Secondary Option */}
            <button 
              onClick={onSelectSub}
              className="w-full p-6 border border-zinc-800 rounded-xl flex items-center justify-between hover:bg-zinc-900 transition-colors group"
            >
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-zinc-400" />
                  <span className="text-white font-semibold">Pro Subscription</span>
                </div>
                <p className="text-zinc-500 text-sm">Best for power users & teams</p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-500 group-hover:text-white transition-all transform group-hover:translate-x-1" />
            </button>
          </div>

          <p className="text-center text-zinc-500 text-xs mt-8">
            Secure payments powered by Stripe. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  );
};

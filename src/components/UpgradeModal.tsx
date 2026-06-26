import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, CreditCard, CheckCircle, Loader2, Shield, Lock, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types.ts';

interface UpgradeModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onSuccess: (newSubscription: any) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ user, onClose }) => {
  const [error, setError] = useState('');
  const [step, setStep] = useState<'details' | 'success'>('details');
  const [isStripeRedirecting, setIsStripeRedirecting] = useState(false);

  React.useEffect(() => {
    if (user?.subscription?.status === 'active') {
      setStep('success');
    }
  }, [user?.subscription?.status]);

  const handleStripeCheckoutRedirect = async () => {
    if (!user) {
      setError('Please sign in to proceed.');
      return;
    }

    setError('');
    setIsStripeRedirecting(true);

    try {
      // Access the optional payment link from client settings
      const configuredPaymentLink = (import.meta as any).env?.VITE_STRIPE_PAYMENT_LINK;
      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "";
      
      const response = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
          appUrl: window.location.origin,
        }),
      });

      if (response.status === 404) {
        if (configuredPaymentLink) {
          // Fallback seamlessly to Stripe Payment Link if defined (perfect for static SPA deployments!)
          const checkoutUrl = `${configuredPaymentLink}?prefilled_email=${encodeURIComponent(user.email || '')}&client_reference_id=${user.uid}`;
          window.location.href = checkoutUrl;
          return;
        }
        throw new Error(
          'Stripe checkout session API is offline or not configured on this custom domain. If you are hosting a static front-end page, you can easily activate your account subscription from the Admin tab inside this workspace, or specify a custom Stripe Payment Link (using VITE_STRIPE_PAYMENT_LINK in .env).'
        );
      }

      if (!response.ok) {
        let errMessage = 'Server error creating checkout session.';
        // Prevent JSON parsing crashes if the response is standard HTML error pages
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errJson = await response.json();
          errMessage = errJson.error || errMessage;
        } else {
          errMessage = `HTTP Error ${response.status}: Failed to reach checkout.`;
        }
        throw new Error(errMessage);
      }

      const session = await response.json();
      if (!session.url) {
        throw new Error('No checkout session URL returned from the payment network.');
      }

      // Safe, compliant redirect to Stripe hosted checkout screen
      window.location.href = session.url;
    } catch (err: any) {
      console.error('Stripe Checkout Error:', err);
      setError(err.message || 'Failed to initialize secure checkout session with Stripe.');
    } finally {
      setIsStripeRedirecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-4xl bg-zinc-950/75 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[500px]"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors z-50 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Panel: Value Proposition & Billing details */}
        <div className="md:col-span-5 bg-gradient-to-br from-purple-950/20 via-blue-950/20 to-zinc-950 p-8 md:p-10 border-r border-white/5 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8">
              <Sparkles className="w-4 h-4 text-purple-400 fill-purple-400/20 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide text-zinc-200">TheDesignAI Pro</span>
            </div>

            <h3 className="text-3xl font-black tracking-tight text-white mb-2 leading-tight">
              Upgrade to Pro
            </h3>
            <p className="text-zinc-400 text-sm mb-8">
              Work without boundaries, synthesize at premium speeds, and perfect code interactively.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Unlimited Generations</h4>
                  <p className="text-xs text-zinc-400">Never hit limit ceilings or daily generation blockages again.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Interactive Styling Panel</h4>
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5 flex-wrap">
                    Unlock full point-and-click stylesheet tools to modify any element on the preview canvas instantly.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">AI Design Assistant Co-pilot</h4>
                  <p className="text-xs text-zinc-400 font-medium">Have your helper change themes, styles, and layouts in natural language.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Full Source Export</h4>
                  <p className="text-xs text-zinc-400">Download production-ready raw HTML & Tailwind-equipped source code packages.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 md:mt-0 pt-6 border-t border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest leading-none">Monthly Billing Plan</span>
              <span className="text-2xl font-black tracking-tight text-white mt-1 leading-none">$14.00 <span className="text-xs text-zinc-500 font-normal">/ month</span></span>
            </div>
            <div className="text-xs text-zinc-500 font-medium bg-white/5 border border-white/5 px-2.5 py-1 rounded">
              Secure Stripe Flow
            </div>
          </div>
        </div>

        {/* Right Panel: Transaction Area */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center bg-black/40">
          <AnimatePresence mode="wait">
            {step === 'details' ? (
              <motion.div
                key="billing-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-6"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-300">
                    <CreditCard className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Stripe SECURE CHECKOUT</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">SSL Encrypted 256-bit Payment Channel</p>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs leading-relaxed">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Secure Gateway Presentation and Redirect Action */}
                <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-emerald-500/10 border border-white/5 rounded-2xl p-6 space-y-4 shadow-inner">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-emerald-400 rotate-12 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-white tracking-tight uppercase">Stripe Subscription Integration</h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed mt-0.5">
                        Redirect securely to Stripe's hosted subscription gateway to complete your premium upgrade safely. Your payments and cards are guarded by industry standard security frameworks.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isStripeRedirecting}
                    onClick={handleStripeCheckoutRedirect}
                    className="w-full bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 hover:opacity-95 active:scale-[0.99] text-white py-4 px-5 rounded-xl text-xs font-black tracking-wide uppercase transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isStripeRedirecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Initializing Secure Session...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                        <span>Upgrade with Stripe - $14.00</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Secure Badge Indicators */}
                <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                    <span>PCI-DSS SSL Merchant Certified</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Secure Gateway connection</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success-form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center flex flex-col items-center justify-center py-6"
              >
                <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent tracking-tight">
                  Pro Activated Successfully!
                </h3>
                <p className="text-zinc-400 text-sm mt-3 max-w-sm">
                  Your payments setup on Stripe is active. Premium attributes, co-pilot, and unlimited design synthesis are now unlocked of your profile.
                </p>

                <div className="w-full max-w-sm bg-zinc-950/60 border border-white/5 rounded-2xl p-5 mt-8 space-y-3 font-mono text-xs text-left">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Transaction Status</span>
                    <span className="text-emerald-400 font-bold">SUCCESS</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Receipt Email</span>
                    <span className="text-zinc-350">{user?.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Amount Charged</span>
                    <span className="text-emerald-400 font-bold">$14.00 USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Limits Status</span>
                    <span className="text-blue-400 font-bold">PRO UNLIMITED</span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="mt-8 bg-zinc-900 border border-white/10 hover:bg-zinc-850 text-white px-8 py-3.5 rounded-xl text-sm font-bold transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] w-full max-w-sm cursor-pointer"
                >
                  Return to Workspace
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

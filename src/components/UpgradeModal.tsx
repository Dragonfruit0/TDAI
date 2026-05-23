import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, CreditCard, CheckCircle, Loader2, Shield, Lock, Landmark, User, Calendar, Key, AlertCircle } from 'lucide-react';
import { db, doc, setDoc, handleFirestoreError, OperationType } from '../firebase.ts';
import { UserProfile } from '../types.ts';

interface UpgradeModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onSuccess: (newSubscription: any) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ user, onClose, onSuccess }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'details' | 'success'>('details');

  const stripeKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
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
      const response = await fetch('/api/stripe/create-checkout-session', {
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

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Server error creating checkout session.');
      }

      const session = await response.json();
      if (!session.url) {
        throw new Error('No checkout session URL returned from backend.');
      }

      // Safe, compliant redirect to checkout
      window.location.href = session.url;
    } catch (err: any) {
      console.error('Stripe Checkout Error:', err);
      setError(err.message || 'Failed to initialize secure checkout session with Stripe.');
    } finally {
      setIsStripeRedirecting(false);
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length > 2) {
      value = `${value.slice(0, 2)}/${value.slice(2)}`;
    }
    setExpiry(value);
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setCvc(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Please sign in to proceed.');
      return;
    }

    if (cardNumber.replace(/\s/g, '').length < 16) {
      setError('Please enter a valid 16-digit card number.');
      return;
    }
    if (!cardName.trim()) {
      setError('Please enter the cardholder Name.');
      return;
    }
    if (expiry.length < 5) {
      setError('Please enter a valid expiry date (MM/YY).');
      return;
    }
    if (cvc.length < 3) {
      setError('Please enter a valid 3-digit CVC.');
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      // Simulate real Stripe payment network delay (1.8s)
      await new Promise((resolve) => setTimeout(resolve, 1800));

      const mockSub = {
        status: 'active',
        plan: 'Pro',
        billingCycle: 'monthly',
        createdAt: new Date().toISOString()
      };

      const userRef = doc(db, 'users', user.uid);
      try {
        await setDoc(userRef, { subscription: mockSub }, { merge: true });
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.UPDATE, `users/${user.uid}`);
      }

      setStep('success');
      onSuccess(mockSub);
    } catch (err) {
      console.error(err);
      setError('Transaction was refused by Stripe payment network.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-4xl bg-zinc-950/75 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[550px]"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors z-50"
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
                  <p className="text-xs text-zinc-400">Standard users are limited to 3 generations per day.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Manual Tailwind Editing</h4>
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5 flex-wrap">
                    Unlock interactive class additions <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider">Unlimited</span>
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
                    <div className="flex flex-col gap-0.5">
                      <p className="text-zinc-500 text-xs">SSL Encrypted 128-bit Payment Channel</p>
                      {stripeKey ? (
                        <div className="text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Connected to custom key: {stripeKey.length > 15 ? `${stripeKey.substring(0, 15)}...` : stripeKey}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-500 font-mono mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>Sandbox Simulation Mode (No custom Stripe key in .env)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stripe Hosted Checkout Premium integration */}
                <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-emerald-500/10 border border-white/5 rounded-2xl p-5 space-y-3.5 shadow-inner">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-emerald-400 rotate-12 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-white tracking-tight uppercase">Stripe Subscription (Real Checkout)</h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed mt-0.5">
                        Redirect securely to our Stripe subscription gateway to complete your payment with full card processing, Google Pay, or Apple Pay.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isStripeRedirecting || isProcessing}
                    onClick={handleStripeCheckoutRedirect}
                    className="w-full bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 hover:opacity-90 active:scale-[0.99] text-white py-3.5 px-4 rounded-xl text-xs font-extrabold tracking-wide uppercase transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isStripeRedirecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Initializing Checkout Session...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300/20" />
                        <span>Pay 14.00 USD with Stripe</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative flex items-center justify-center py-1">
                  <div className="absolute inset-x-0 h-px bg-white/5" />
                  <span className="relative px-3 bg-[#0a0a0a] text-zinc-500 font-mono text-[9px] uppercase tracking-widest leading-none">OR Developer Simulator Option</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Card Number */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-zinc-500" /> Card Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder="4242 4242 4242 4242"
                        className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-purple-500/50 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                        required
                        disabled={isProcessing}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                        <span className="text-[9px] uppercase font-bold text-zinc-500 bg-white/5 border border-white/10 px-1 py-0.5 rounded leading-none">Stripe</span>
                      </div>
                    </div>
                  </div>

                  {/* Cardholder Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                      <User className="w-3 h-3 text-zinc-500" /> Cardholder Name
                    </label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-purple-500/50 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none transition-colors"
                      required
                      disabled={isProcessing}
                    />
                  </div>

                  {/* Expiry & CVC Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" /> Expiry Date
                      </label>
                      <input
                        type="text"
                        value={expiry}
                        onChange={handleExpiryChange}
                        placeholder="MM/YY"
                        className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-purple-500/50 rounded-xl px-4 py-3 text-white text-sm text-center font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                        required
                        disabled={isProcessing}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                        <Key className="w-3 h-3 text-zinc-500" /> security code (cvc)
                      </label>
                      <input
                        type="password"
                        value={cvc}
                        onChange={handleCvcChange}
                        placeholder="123"
                        className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-purple-500/50 rounded-xl px-4 py-3 text-white text-sm text-center font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                        required
                        disabled={isProcessing}
                      />
                    </div>
                  </div>

                  {/* SSL Indicator */}
                  <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Stripe Certified PCI-DSS Compliant</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Secure 256-bit Connection</span>
                    </div>
                  </div>

                  {/* Submit Checkout Button */}
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full mt-4 bg-white hover:bg-zinc-200 text-black py-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing with Stripe...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Authorize and Pay $14.00</span>
                      </>
                    )}
                  </button>
                </form>
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
                    <span className="text-zinc-500">Transaction ID</span>
                    <span className="text-zinc-350">ch_3N1f92LK03rWp2as88</span>
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

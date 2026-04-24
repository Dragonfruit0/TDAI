import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { Button } from './Button.tsx';
import { UserCircle, Mail, Phone, Briefcase, ChevronRight, LogIn } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyB9Gf0AB4ZfYGI3x-sFCHgGuz6Eb0ecBMo",
  authDomain: "pdata-ebec3.firebaseapp.com",
  projectId: "pdata-ebec3",
  storageBucket: "pdata-ebec3.firebasestorage.app",
  messagingSenderId: "884314054047",
  appId: "1:884314054047:web:d3ba71f05b38e172adb1aa",
  measurementId: "G-DEL7M7W50R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

interface AuthPageProps {
  onComplete: (userData: any) => void;
  onBack: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onComplete, onBack }) => {
  const [step, setStep] = useState<'LOGIN' | 'DETAILS'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: ''
  });

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      setFirebaseUser(result.user);
      setFormData(prev => ({
        ...prev,
        name: result.user.displayName || '',
        email: result.user.email || ''
      }));
      setStep('DETAILS');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.role) {
      setError('Please fill in all fields');
      return;
    }
    onComplete(formData);
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-black rounded-sm transform rotate-45" />
            </div>
            <span className="font-bold text-2xl tracking-tighter">Anqair</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {step === 'LOGIN' ? 'Welcome back' : 'Final details'}
          </h1>
          <p className="text-zinc-500">
            {step === 'LOGIN' 
              ? 'Sign in to start generating your UI library.' 
              : 'Tell us a bit about yourself to get started.'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0f0f0f] border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {step === 'LOGIN' ? (
            <div className="space-y-6">
              <button 
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-14 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Continue with Google
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0f0f0f] px-2 text-zinc-600">Secure entry</span>
                </div>
              </div>

              <div className="text-center">
                <p className="text-zinc-500 text-sm mb-4">
                  You’ll get 1 free Flash instantly upon sign up.
                </p>
                <button onClick={onBack} className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Full Name</label>
                <div className="relative">
                  <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Email Address</label>
                <div className="relative opacity-60">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="email"
                    readOnly
                    value={formData.email}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+91 99999 99999"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Professional Role</label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <select 
                    required
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-zinc-600 appearance-none transition-colors"
                  >
                    <option value="" disabled>Select your role</option>
                    <option value="designer">UI/UX Designer</option>
                    <option value="developer">Frontend Developer</option>
                    <option value="founder">Founder / Product Lead</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full h-14 mt-4 font-bold text-lg group">
                Enter Studio
                <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-zinc-600 text-xs">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
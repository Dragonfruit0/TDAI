import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, Loader2, X, User as UserIcon, LogOut, History, Download, MessageSquare, Send, LayoutGrid, ShieldAlert, Lock, CreditCard, Users, TrendingUp, Coins, Activity, Eye, RefreshCw, Trash2, ArrowUpRight, CheckCircle, AlignLeft, AlignCenter, AlignRight, Palette, Sliders, Type, Grid, Check, Paintbrush, Circle, Layers, SlidersHorizontal, MousePointerClick, CheckSquare, Undo2, Redo2, Paperclip, Plus } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AppView, UIVariant, UserProfile, Project, ChatMessage, UsageMetadata, DesignSuggestion, SavedDesign, ColorPalette, ProjectVersion } from './types.ts';
import { generateFollowUpQuestions, generateUIVariants, modifyUI, generateDesignSuggestions, getPreferredProvider, generateSingleUIVariant, generatePalette } from './services/geminiService.ts';
import { UIPreview } from './components/UIPreview.tsx';
import { OnboardingTutorial } from './components/OnboardingTutorial.tsx';
import DottedGlowBackground from './components/DottedGlowBackground.tsx';
import { UpgradeModal } from './components/UpgradeModal.tsx';
import { auth, db, googleProvider, signInWithPopup, signOut, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, handleFirestoreError, OperationType } from './firebase.ts';
import { onAuthStateChanged } from 'firebase/auth';

const getAppliedColor = (classes: string, type: 'bg' | 'text' | 'border'): string => {
  const arr = classes.split(/\s+/);
  // Look for arbitrary values first, e.g., bg-[#123456] or text-[rgb(0,0,0)]
  const arbitraryQuery = arr.find(c => c.startsWith(`${type}-[`));
  if (arbitraryQuery) {
    const match = arbitraryQuery.match(/\[([^\]]+)\]/);
    if (match) return match[1];
  }
  
  // Look for standard tailwind names, e.g., bg-emerald-500, bg-black, bg-white
  const standardMap: Record<string, string> = {
    'black': '#000000',
    'white': '#ffffff',
    'transparent': '#00000000',
    'zinc-950': '#09090b',
    'zinc-900': '#18181b',
    'zinc-800': '#27272a',
    'zinc-700': '#3f3f46',
    'zinc-600': '#52525b',
    'zinc-500': '#71717a',
    'zinc-400': '#a1a1aa',
    'zinc-300': '#d4d4d8',
    'zinc-200': '#e4e4e7',
    'zinc-100': '#f4f4f5',
    'zinc-50': '#fafafa',
    'slate-950': '#020617',
    'slate-900': '#0f172a',
    'slate-800': '#1e293b',
    'slate-705': '#334155',
    'slate-600': '#475569',
    'slate-500': '#64748b',
    'slate-400': '#94a3b8',
    'slate-300': '#cbd5e1',
    'slate-200': '#e2e8f0',
    'slate-100': '#f1f5f9',
    'slate-50': '#f8fafc',
    'emerald-950': '#022c22',
    'emerald-900': '#064e3b',
    'emerald-80': '#065f46',
    'emerald-700': '#047857',
    'emerald-600': '#059669',
    'emerald-500': '#10b981',
    'emerald-400': '#34d399',
    'emerald-300': '#6ee7b7',
    'emerald-200': '#a7f3d0',
    'emerald-100': '#d1fae5',
    'emerald-50': '#ecfdf5',
    'indigo-950': '#1e1b4b',
    'indigo-900': '#312e81',
    'indigo-800': '#3730a3',
    'indigo-700': '#4338ca',
    'indigo-600': '#4f46e5',
    'indigo-505': '#6366f1',
    'indigo-500': '#6366f1',
    'indigo-400': '#818cf8',
    'blue-500': '#3b82f6',
    'red-500': '#ef4444',
    'yellow-500': '#eab308',
    'orange-500': '#f97316',
    'purple-500': '#a855f7',
    'pink-500': '#ec4899',
  };

  const stdQuery = arr.find(c => c.startsWith(`${type}-`) && !c.includes('['));
  if (stdQuery) {
    const colorName = stdQuery.slice(type.length + 1);
    if (standardMap[colorName]) {
      return standardMap[colorName];
    }
    if (colorName.includes('white')) return '#ffffff';
    if (colorName.includes('black')) return '#000000';
    if (colorName.includes('transparent')) return '#00000000';
  }

  if (type === 'bg') return '#18181b';
  if (type === 'text') return '#ffffff';
  return '#3f3f46';
};

// Beautiful Interactive Canvas-drawn Color Wheel
const ColorWheel: React.FC<{
  color: string;
  onChange: (hex: string) => void;
}> = ({ color, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;

    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= r) {
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;
          
          const hue = (angle * 180) / Math.PI;
          const saturation = dist / r;
          const lightness = 0.5;
          
          let rVal, gVal, bVal;
          const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
          const p = 2 * lightness - q;
          
          const hueToRgb = (t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };

          rVal = hueToRgb(hue / 360 + 1/3);
          gVal = hueToRgb(hue / 360);
          bVal = hueToRgb(hue / 360 - 1/3);

          const idx = (y * size + x) * 4;
          data[idx] = Math.round(rVal * 255);
          data[idx + 1] = Math.round(gVal * 255);
          data[idx + 2] = Math.round(bVal * 255);
          data[idx + 3] = 255;
        } else {
          const idx = (y * size + x) * 4;
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const handlePointer = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = Math.floor(clientX - rect.left);
    const y = Math.floor(clientY - rect.top);
    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      if (p[3] > 0) {
        const hex = '#' + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
        onChange(hex);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center relative my-2">
      <div className="relative p-1 bg-white/5 border border-white/10 rounded-full shadow-2xl overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={130}
          height={130}
          className="rounded-full"
          onMouseDown={handlePointer}
          onMouseMove={(e) => { if (e.buttons === 1) handlePointer(e); }}
          onTouchStart={handlePointer}
          onTouchMove={handlePointer}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-black border-2 border-white rounded-full pointer-events-none shadow" />
      </div>
      <span className="text-[9px] text-zinc-500 mt-1 uppercase font-mono tracking-wider">Drag to select dynamic color</span>
    </div>
  );
};

// Feature 4: Standalone Version Item component to prevent losing focus during name edits
const VersionItem = ({ 
  version, 
  onRestore, 
  onUpdateName 
}: { 
  version: any, 
  onRestore: (html: string, name: string) => void, 
  onUpdateName: (id: string, name: string) => any,
  key?: any
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(version.name);
  
  return (
    <div className="bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5 transition-colors relative group/version">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {isEditing ? (
            <input
              type="text"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdateName(version.id, editVal);
                  setIsEditing(false);
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
              className="bg-black/50 border border-emerald-500/50 rounded px-2 py-0.5 text-xs text-white w-full focus:outline-none font-sans"
              autoFocus
              onBlur={() => {
                onUpdateName(version.id, editVal);
                setIsEditing(false);
              }}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-200 line-clamp-1">{version.name}</span>
              <button 
                type="button"
                onClick={() => { setEditVal(version.name); setIsEditing(true); }}
                className="text-zinc-500 hover:text-white transition-colors opacity-0 group-hover/version:opacity-100 shrink-0"
                title="Rename version"
              >
                <Plus className="w-3 h-3 rotate-45 transform text-zinc-400" />
              </button>
            </div>
          )}
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {new Date(version.createdAt).toLocaleTimeString()} — {new Date(version.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRestore(version.html, version.name)}
        className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-colors cursor-pointer"
      >
        Restore Layout
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LANDING);
  const [prompt, setPrompt] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = [
    "A brutalist architecture portfolio with heavy typography...",
    "A grainy Risograph poster for a modular synth festival...",
    "A minimalist kinetic mobile style dashboard...",
    "A volumetric prismatic landing page for a VR app...",
    "A Bauhaus-functionalism task management tool..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSurpriseMe = () => {
    const randomPrompt = placeholders[Math.floor(Math.random() * placeholders.length)];
    setPrompt(randomPrompt);
  };
  
  // Auth state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Limits and Pro state
  const [totalGenerations, setTotalGenerations] = useState<number>(0);
  const [generationsToday, setGenerationsToday] = useState<number>(0);
  const [isLoadingLimits, setIsLoadingLimits] = useState<boolean>(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  const refreshLimits = async (currentUser: UserProfile | null) => {
    if (!currentUser) return;
    setIsLoadingLimits(true);
    try {
      const q = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
      const snap = await getDocs(q);
      const projects: any[] = [];
      snap.forEach(docSnap => {
        projects.push(docSnap.data());
      });
      
      const total = projects.length;
      const todayStr = new Date().toDateString();
      const today = projects.filter(p => p.createdAt && new Date(p.createdAt).toDateString() === todayStr).length;
      
      setTotalGenerations(total);
      setGenerationsToday(today);
    } catch (err) {
      console.error("Error loading usage statistics", err);
    } finally {
      setIsLoadingLimits(false);
    }
  };

  useEffect(() => {
    if (view === AppView.BUILDER) {
      const completed = localStorage.getItem('design-ai-onboarding-completed');
      if (!completed) {
        setShowOnboarding(true);
      }
    }
  }, [view]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('design-ai-onboarding-completed', 'true');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          const userDocData = userSnap.exists() ? userSnap.data() : {};
          const userData: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            createdAt: userDocData.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          };

          if (firebaseUser.displayName) {
            userData.displayName = firebaseUser.displayName;
          } else if (userDocData.displayName) {
            userData.displayName = userDocData.displayName;
          }

          if (firebaseUser.photoURL) {
            userData.photoURL = firebaseUser.photoURL;
          } else if (userDocData.photoURL) {
            userData.photoURL = userDocData.photoURL;
          }

          if (userDocData.subscription) {
            userData.subscription = userDocData.subscription;
          }

          await setDoc(userRef, userData, { merge: true });
          setUser(userData);
          refreshLimits(userData);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setTotalGenerations(0);
        setGenerationsToday(0);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Parse returning query params on successful Stripe transaction redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout_success') === 'true') {
      setShowUpgradeModal(true);
      // Clean query parameters from URL for pristine state without full reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    } else if (params.get('checkout_cancelled') === 'true') {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Sync fresh subscription state from Firestore on successful checkout redirects
  useEffect(() => {
    if (user && isAuthReady) {
      const checkParams = new URL(window.location.href);
      // If we are showing upgrade modal or just returned from successful checkouts
      if (showUpgradeModal) {
        const syncSub = async () => {
          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              const userRef = doc(db, 'users', user.uid);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const data = userSnap.data();
                if (data?.subscription?.status === 'active') {
                  setUser({
                    ...user,
                    subscription: data.subscription
                  });
                  refreshLimits({
                    ...user,
                    subscription: data.subscription
                  });
                  break;
                }
              }
            } catch (err) {
              console.error("Failed to sync sub on return", err);
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        };
        syncSub();
      }
    }
  }, [user?.uid, isAuthReady, showUpgradeModal]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setView(AppView.LANDING);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const fetchUserProjects = async () => {
    if (!user) return;
    setIsLoadingProjects(true);
    try {
      const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const projects: Project[] = [];
      querySnapshot.forEach((doc) => {
        projects.push({ id: doc.id, ...doc.data() } as Project);
      });
      // Sort by createdAt descending
      projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUserProjects(projects);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const [profileTab, setProfileTab] = useState<'projects' | 'saves'>('projects');
  const [userSavedDesigns, setUserSavedDesigns] = useState<SavedDesign[]>([]);
  const [isLoadingSavedDesigns, setIsLoadingSavedDesigns] = useState(false);
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const [showSaveNamingModal, setShowSaveNamingModal] = useState(false);
  const [saveDesignName, setSaveDesignName] = useState('');

  const fetchSavedDesigns = async () => {
    if (!user) return;
    setIsLoadingSavedDesigns(true);
    try {
      const q = query(collection(db, 'saved_designs'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const designs: SavedDesign[] = [];
      querySnapshot.forEach((doc) => {
        designs.push({ id: doc.id, ...doc.data() } as SavedDesign);
      });
      // Sort by createdAt descending
      designs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUserSavedDesigns(designs);
    } catch (error) {
      console.error("Error loading saved designs", error);
    } finally {
      setIsLoadingSavedDesigns(false);
    }
  };

  const handleSaveDesign = async () => {
    if (!user) return;
    if (!saveDesignName.trim()) {
      alert("Please provide a name for this design.");
      return;
    }
    setIsSavingDesign(true);
    try {
      const designData: Omit<SavedDesign, 'id'> = {
        userId: user.uid,
        name: saveDesignName.trim(),
        html: builderHtml,
        parentPrompt: prompt || 'Custom Design Modification',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'saved_designs'), designData);
      alert("Design saved to your history successfully!");
      setSaveDesignName('');
      setShowSaveNamingModal(false);
      fetchSavedDesigns();
    } catch (error) {
      console.error("Error saving design:", error);
      alert("Failed to save design to your history.");
    } finally {
      setIsSavingDesign(false);
    }
  };

  // Generation state
  const [isGeneratingUI, setIsGeneratingUI] = useState(false);
  const [variants, setVariants] = useState<UIVariant[]>([]);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [currentProjectUsage, setCurrentProjectUsage] = useState<any>(null);
  const [currentProjectCost, setCurrentProjectCost] = useState<number>(0);

  // Admin Dashboard State
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminProjects, setAdminProjects] = useState<Project[]>([]);
  const [adminChatbotUsage, setAdminChatbotUsage] = useState<any[]>([]);
  const [adminLogTab, setAdminLogTab] = useState<'projects' | 'chatbot'>('projects');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [selectedAdminUser, setSelectedAdminUser] = useState<UserProfile | null>(null);
  const [preferredApiProvider, setPreferredApiProvider] = useState<'gemini' | 'openrouter'>(getPreferredProvider);
  const [adminSortBy, setAdminSortBy] = useState<'active' | 'newest'>('active');

  const handleToggleApiProvider = (provider: 'gemini' | 'openrouter') => {
    setPreferredApiProvider(provider);
    localStorage.setItem('preferred_api_provider', provider);
  };

  const fetchAdminData = async () => {
    setIsAdminLoading(true);
    try {
      let usersList: UserProfile[] = [];
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach(d => {
          usersList.push(d.data() as UserProfile);
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
      // Sort users by registration date (newest first)
      usersList.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setAdminUsers(usersList);

      let projectsList: Project[] = [];
      try {
        const projectsSnap = await getDocs(collection(db, 'projects'));
        projectsSnap.forEach(d => {
          projectsList.push({ id: d.id, ...d.data() } as Project);
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'projects');
      }
      setAdminProjects(projectsList);

      let chatbotList: any[] = [];
      try {
        const chatbotSnap = await getDocs(collection(db, 'chatbot_usage'));
        chatbotSnap.forEach(d => {
          chatbotList.push({ id: d.id, ...d.data() });
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'chatbot_usage');
      }
      setAdminChatbotUsage(chatbotList);
    } catch (err) {
      console.error("Error loading admin stats", err);
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleToggleSubscription = async (userId: string, currentSub?: any) => {
    try {
      const userRef = doc(db, 'users', userId);
      const isCurrentlyActive = currentSub?.status === 'active';
      const newSub = {
        status: isCurrentlyActive ? 'inactive' : 'active',
        plan: isCurrentlyActive ? 'Free' : 'Pro',
        billingCycle: 'monthly',
        createdAt: new Date().toISOString()
      };
      
      try {
        await setDoc(userRef, { subscription: newSub }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      }
      
      // Update local state instantly so user doesn't wait
      setAdminUsers(prev => prev.map(u => u.uid === userId ? { ...u, subscription: newSub } : u));
      if (selectedAdminUser?.uid === userId) {
        setSelectedAdminUser(prev => prev ? { ...prev, subscription: newSub } : null);
      }
    } catch (err) {
      console.error("Failed to update subscription status", err);
    }
  };

  useEffect(() => {
    if (view === AppView.ADMIN) {
      fetchAdminData();
    }
  }, [view]);

  // Builder state
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'editor' | 'palette' | 'history'>('chat');
  const [selectedElement, setSelectedElement] = useState<{ 
    tagName: string, 
    classes: string, 
    textContent?: string,
    rect?: { top: number, left: number, width: number, height: number } 
  } | null>(null);

  // Feature 1: Undo/Redo History Stack
  const [htmlHistory, setHtmlHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const builderHtml = historyIndex >= 0 ? htmlHistory[historyIndex] : '';

  const setBuilderHtml = (newHtml: string, skipHistory = false) => {
    if (skipHistory) {
      setHtmlHistory(prev => {
        const next = [...prev.slice(0, historyIndex + 1)];
        if (next.length === 0) {
          next.push(newHtml);
        } else {
          next[Math.max(historyIndex, 0)] = newHtml;
        }
        return next;
      });
      if (historyIndex < 0) {
        setHistoryIndex(0);
      }
      return;
    }
    setHtmlHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), newHtml];
      return next.slice(-50); // cap at 50 entries
    });
    setHistoryIndex(prev => {
      const nextIndex = prev + 1;
      return Math.min(nextIndex, 49);
    });
  };

  const resetBuilderHtml = (initialHtml: string) => {
    setHtmlHistory([initialHtml]);
    setHistoryIndex(0);
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < htmlHistory.length - 1;

  const undo = () => {
    if (!canUndo) return;
    setHistoryIndex(prev => prev - 1);
  };

  const redo = () => {
    if (!canRedo) return;
    setHistoryIndex(prev => prev + 1);
  };

  // Feature 2: Reference Image Upload State
  const [referenceImage, setReferenceImage] = useState<{ base64: string, mimeType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        setReferenceImage({
          base64,
          mimeType: file.type
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Feature 3: AI Color Palette Generator Panel State
  const [palettes, setPalettes] = useState<ColorPalette[]>([
    {
      id: 'default-emerald',
      name: 'Emerald Forest',
      swatches: [
        { role: 'primary', hex: '#10b981', tailwindClass: 'bg-emerald-500' },
        { role: 'secondary', hex: '#064e3b', tailwindClass: 'bg-emerald-900' },
        { role: 'background', hex: '#022c22', tailwindClass: 'bg-emerald-950' },
        { role: 'text', hex: '#f0fdf4', tailwindClass: 'text-emerald-50' },
        { role: 'accent', hex: '#34d399', tailwindClass: 'bg-emerald-400' }
      ]
    },
    {
      id: 'cyberpunk',
      name: 'Neo Cyberpunk',
      swatches: [
        { role: 'primary', hex: '#ec4899', tailwindClass: 'bg-pink-500' },
        { role: 'secondary', hex: '#3b82f6', tailwindClass: 'bg-blue-500' },
        { role: 'background', hex: '#0f172a', tailwindClass: 'bg-slate-900' },
        { role: 'text', hex: '#f8fafc', tailwindClass: 'text-slate-50' },
        { role: 'accent', hex: '#a855f7', tailwindClass: 'bg-purple-500' }
      ]
    },
    {
      id: 'nordic',
      name: 'Nordic Frost',
      swatches: [
        { role: 'primary', hex: '#0ea5e9', tailwindClass: 'bg-sky-500' },
        { role: 'secondary', hex: '#475569', tailwindClass: 'bg-slate-600' },
        { role: 'background', hex: '#f1f5f9', tailwindClass: 'bg-slate-100' },
        { role: 'text', hex: '#0f172a', tailwindClass: 'text-slate-900' },
        { role: 'accent', hex: '#0284c7', tailwindClass: 'bg-sky-600' }
      ]
    }
  ]);
  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false);

  // Feature 4: Version History & Auto-Saves State
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<ProjectVersion[]>([]);
  const [sessionSaveCount, setSessionSaveCount] = useState(1);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAutoSave = (html: string, changeName: string) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(async () => {
      const versionId = Date.now().toString();
      const newVersion = {
        id: versionId,
        name: changeName,
        html,
        createdAt: new Date().toISOString()
      };
      setVersionHistory(prev => [newVersion, ...prev]);
      setSessionSaveCount(prev => prev + 1);
      
      if (user && currentProjectId) {
        try {
          const versionData = {
            name: changeName,
            html,
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, `projects/${currentProjectId}/versions`), versionData);
          console.log("Auto-save successfully saved to Firebase.");
        } catch (err) {
          console.error("Auto-save failed to save to Firebase:", err);
        }
      }
    }, 2000);
  };

  const fetchProjectVersions = async (pId: string) => {
    if (!user) return;
    try {
      const q = query(collection(db, `projects/${pId}/versions`), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const versions: any[] = [];
      querySnapshot.forEach((doc) => {
        versions.push({ id: doc.id, ...doc.data() });
      });
      setVersionHistory(versions);
      setSessionSaveCount(versions.length + 1);
    } catch (err) {
      console.error("Error fetching project versions:", err);
    }
  };

  const updateVersionName = async (versionId: string, newName: string) => {
    setVersionHistory(prev => prev.map(v => v.id === versionId ? { ...v, name: newName } : v));
    if (user && currentProjectId) {
      try {
        const docRef = doc(db, `projects/${currentProjectId}/versions`, versionId);
        await setDoc(docRef, { name: newName }, { merge: true });
        console.log("Version name updated in Firestore.");
      } catch (err) {
        console.error("Error updating version name in Firestore:", err);
      }
    }
  };

  // Keyboard shortcut listener for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== AppView.BUILDER) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true')) {
        return;
      }
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl) {
        if (e.key.toLowerCase() === 'z') {
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, historyIndex, htmlHistory.length]);

  // Clean up auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Feature 5: Progressive Generating variants
  const [generatingVariants, setGeneratingVariants] = useState<UIVariant[]>([]);
  const [generatingStep, setGeneratingStep] = useState<string>('Analyzing design parameters...');

  // Feature 6: In-App Error Banner State
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);

  // Extra states for advanced color editing
  const [colorEditingType, setColorEditingType] = useState<'bg' | 'text' | 'border' | null>(null);
  const [bgInputHex, setBgInputHex] = useState('#18181b');
  const [textInputHex, setTextInputHex] = useState('#ffffff');
  const [borderInputHex, setBorderInputHex] = useState('#3f3f46');

  useEffect(() => {
    if (selectedElement) {
      setBgInputHex(getAppliedColor(selectedElement.classes, 'bg'));
      setTextInputHex(getAppliedColor(selectedElement.classes, 'text'));
      setBorderInputHex(getAppliedColor(selectedElement.classes, 'border'));
    } else {
      setColorEditingType(null);
    }
  }, [selectedElement?.classes]);

  const applyArbitraryColor = (type: 'bg' | 'text' | 'border', colorVal: string) => {
    if (!selectedElement) return;
    
    let cleaned = colorVal.trim();
    if (cleaned.startsWith('#')) {
      // is hex
    } else if (/^[0-9a-fA-F]{3,8}$/.test(cleaned)) {
      cleaned = '#' + cleaned;
    } else if (cleaned === '') {
      cleaned = type === 'bg' ? '#18181b' : type === 'text' ? '#ffffff' : '#3f3f46';
    }
    
    const newClass = `${type}-[${cleaned}]`;
    
    if (type === 'bg') {
      setBgInputHex(cleaned);
      applyStyleClass(['bg-'], newClass);
    } else if (type === 'text') {
      setTextInputHex(cleaned);
      applyStyleClass(['text-'], newClass);
    } else if (type === 'border') {
      setBorderInputHex(cleaned);
      
      let currentArr = selectedElement.classes.split(' ').filter(c => c.trim().length > 0);
      if (!currentArr.includes('border') && !currentArr.some(c => c.startsWith('border-') && !c.startsWith('border-['))) {
        currentArr.push('border');
      }
      currentArr = currentArr.filter(c => !c.startsWith('border-[') && !(c.startsWith('border-') && c !== 'border' && !['border-none', 'border-2', 'border-4', 'border-8'].includes(c)));
      currentArr.push(newClass);
      handleUpdateClasses(currentArr.join(' '));
    }
  };

  const applyPresetPalette = (bg: string, text: string, border: string) => {
    if (!selectedElement) return;
    setBgInputHex(bg);
    setTextInputHex(text);
    setBorderInputHex(border);
    
    let currentArr = selectedElement.classes.split(' ').filter(c => c.trim().length > 0);
    
    currentArr = currentArr.filter(c => !c.startsWith('bg-') && !c.startsWith('text-') && !c.startsWith('border-[') && !c.startsWith('border-') && c !== 'border');
    
    currentArr.push(`bg-[${bg}]`);
    currentArr.push(`text-[${text}]`);
    currentArr.push('border');
    currentArr.push(`border-[${border}]`);
    
    handleUpdateClasses(currentArr.join(' '));
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = document.getElementById('ui-preview-iframe') as HTMLIFrameElement | null;
      if (iframe && event.source !== iframe.contentWindow) return;

      if (event.data?.type === 'UI_EDITED' && event.data.html) {
        setBuilderHtml(event.data.html);
        triggerAutoSave(event.data.html, `Manual Tweak #${sessionSaveCount}`);
      } else if (event.data?.type === 'ELEMENT_SELECTED') {
        setSelectedElement({
          tagName: event.data.tagName,
          classes: event.data.classes,
          textContent: event.data.textContent,
          rect: event.data.rect
        });
        // Auto navigate to the sidebar editor tab once element is selected
        setSidebarTab('editor');
      } else if (event.data?.type === 'ELEMENT_TEXT_EDITED') {
        setSelectedElement(prev => prev ? { ...prev, textContent: event.data.textContent } : null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isManualEditing) {
      setSelectedElement(null);
      setSidebarTab('chat');
    } else {
      setSidebarTab('editor');
    }
  }, [isManualEditing]);

  const handleUpdateClasses = (newClasses: string) => {
    if (!selectedElement) return;
    setSelectedElement(prev => prev ? { ...prev, classes: newClasses } : null);
    
    // Post back to iframe with high precision ID targeting
    const iframe = document.getElementById('ui-preview-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'UPDATE_CLASSES', classes: newClasses }, '*');
    }
  };

  const handleUpdateText = (newText: string) => {
    if (!selectedElement) return;
    setSelectedElement(prev => prev ? { ...prev, textContent: newText } : null);
    
    // Post back to iframe with high precision ID targeting
    const iframe = document.getElementById('ui-preview-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'UPDATE_TEXT', text: newText }, '*');
    }
  };

  const applyStyleClass = (categoryPrefixes: string[], activeClass: string) => {
    if (!selectedElement) return;
    let currentArr = selectedElement.classes.split(' ').filter(c => c.trim().length > 0);
    // Filter out existing classes matches
    currentArr = currentArr.filter(c => {
      return !categoryPrefixes.some(pref => {
        if (pref.endsWith('-')) {
          return c.startsWith(pref);
        }
        return c === pref;
      });
    });
    // Append the active class
    if (activeClass) {
      currentArr.push(activeClass);
    }
    handleUpdateClasses(currentArr.join(' '));
  };

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000000) * 0.075;
    const outputCost = (usage.candidatesTokenCount / 1000000) * 0.30;
    return inputCost + outputCost;
  };

  const isPro = user?.subscription?.status === 'active' || user?.email === 'thedesignai3@gmail.com';

  const handlePromptSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    
    if (!isPro) {
      if (generationsToday >= 3) {
        setShowUpgradeModal(true);
        return;
      }
    }
    
    setView(AppView.GENERATING);
    setIsGeneratingUI(true);
    setGenerationError(null);
    setGeneratingVariants([]);
    
    const accumulatedVariants: UIVariant[] = [];
    let totalPromptTokenCount = 0;
    let totalCandidatesTokenCount = 0;
    
    try {
      const stepNames = [
        "Analyzing layout variant 1 of 3 (Standard Layout)...",
        "Synthesizing variant 2 of 3 (Cosmic Slate Layout)...",
        "Refining variant 3 of 3 (Ultra Minimalist Layout)..."
      ];
      
      for (let i = 0; i < 3; i++) {
        setGeneratingStep(stepNames[i]);
        
        // Call the single-variant generation endpoint
        const result = await generateSingleUIVariant(prompt, [], [], i, referenceImage);
        const variantData = result.data;
        if (!variantData.id) {
          variantData.id = `variant-${Date.now()}-${i}`;
        }
        
        accumulatedVariants.push(variantData);
        setGeneratingVariants([...accumulatedVariants]);
        
        if (result.usage) {
          totalPromptTokenCount += result.usage.promptTokenCount || 0;
          totalCandidatesTokenCount += result.usage.candidatesTokenCount || 0;
        }
      }
      
      const finalUsage: UsageMetadata = {
        promptTokenCount: totalPromptTokenCount,
        candidatesTokenCount: totalCandidatesTokenCount,
        totalTokenCount: totalPromptTokenCount + totalCandidatesTokenCount
      };
      
      const finalCost = calculateCost(finalUsage);
      
      setVariants(accumulatedVariants);
      setCurrentVariantIndex(0);
      setCurrentProjectUsage(finalUsage);
      setCurrentProjectCost(finalCost);
      
      if (user) {
        try {
          const projectData: Omit<Project, 'id'> = {
            userId: user.uid,
            prompt,
            questions: [],
            answers: [],
            variants: accumulatedVariants,
            createdAt: new Date().toISOString(),
            usage: finalUsage,
            cost: finalCost
          };
          const docRef = await addDoc(collection(db, 'projects'), projectData);
          setCurrentProjectId(docRef.id);
          await fetchProjectVersions(docRef.id);
          await refreshLimits(user);
        } catch (dbError) {
          handleFirestoreError(dbError, OperationType.CREATE, 'projects');
        }
      }
      
      setView(AppView.PREVIEW);
    } catch (error: any) {
      console.error(error);
      setGenerationError(error.message || "Failed to generate UI. Please try again.");
      setView(AppView.LANDING);
    } finally {
      setIsGeneratingUI(false);
      setGeneratingVariants([]);
    }
  };

  const handleAnswerSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
  };

  const renderLanding = () => (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Header / Auth */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <img src="/tdai_logo.jpeg" alt="TheDesignAI Logo" className="w-10 h-10 rounded-xl shadow-lg border border-white/10" />
          <div className="font-bold text-[15px] tracking-tighter flex flex-col leading-none">
            <span>TheDesignAI</span>
            <span className="text-zinc-500 font-normal text-[10px]">by Anqair</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-white">
          {isAuthReady && (
            user ? (
              <>
                {/* Limits & Pro tag */}
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono border tracking-wide uppercase flex items-center gap-1.5 leading-none ${isPro ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-900 text-zinc-400 border-white/5'}`}>
                  {isPro ? (
                    <>
                      <Sparkles className="w-3 h-3 text-blue-400 fill-blue-400/20" />
                      Pro Plan
                    </>
                  ) : (
                    `Limit (${generationsToday}/3 today)`
                  )}
                </span>

                {!isPro && (
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 hover:opacity-90 text-white px-4 py-2 rounded-full text-xs font-extrabold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Get Pro</span>
                  </button>
                )}

                {user.email === 'thedesignai3@gmail.com' && (
                  <button
                    onClick={() => setView(AppView.ADMIN)}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>Admin Dashboard</span>
                  </button>
                )}
                <button 
                  onClick={() => {
                    fetchUserProjects();
                    fetchSavedDesigns();
                    setView(AppView.PROFILE);
                  }}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-full text-sm font-medium border border-white/10"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                  <span>{user.displayName || 'Profile'}</span>
                </button>
              </>
            ) : (
              <button 
                onClick={handleSignIn}
                className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 transition-colors px-5 py-2 rounded-full text-sm font-bold"
              >
                Sign In
              </button>
            )
          )}
        </div>
      </header>

      {/* Immersive Background */}
      <DottedGlowBackground />
      
      <main className="relative z-10 w-full max-w-5xl px-6 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium tracking-wide text-zinc-300">Design AI Generative Engine v2.0</span>
          </div>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter mb-12 leading-[0.85]">
            DESIGN AT THE <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400">
              SPEED OF THOUGHT
            </span>
          </h1>
        </motion.div>

        {generationError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-2xl text-sm flex items-start gap-4 text-left shadow-2xl relative z-50"
          >
            <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-white mb-1">Generation Failed</h4>
              <p className="text-red-300 text-xs font-light leading-relaxed">{generationError}</p>
            </div>
            <button 
              type="button"
              onClick={() => setGenerationError(null)} 
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
 
        <motion.form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!user) {
              handleSignIn();
              return;
            }
            handlePromptSubmit(e);
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-3xl flex flex-col items-center gap-6"
        >
          <div className="w-full relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-blue-600 to-emerald-600 rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
            <div className="relative flex flex-col w-full sm:flex-row items-center bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-white/30 transition-colors">
              <div className="flex-1 w-full relative flex items-center min-h-[64px]">
                <Sparkles className="w-6 h-6 text-zinc-500 ml-4 hidden sm:block" />
                <AnimatePresence mode="wait">
                  {!prompt && (
                    <motion.div
                      key={placeholderIndex}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="absolute inset-0 flex items-center px-4 sm:px-14 text-zinc-600 pointer-events-none text-sm md:text-base italic"
                    >
                      {placeholders[placeholderIndex]}
                    </motion.div>
                  )}
                </AnimatePresence>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-transparent text-white px-4 py-4 text-lg md:text-xl focus:outline-none placeholder:text-zinc-600 z-10"
                  disabled={!user && isAuthReady}
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto p-2 sm:p-0">
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  disabled={!user && isAuthReady}
                  className="bg-zinc-900 border border-white/10 text-white p-4 rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center justify-center shrink-0"
                  title="Surprise Me"
                >
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </button>
                <button
                  type="submit"
                  disabled={user ? !prompt.trim() : !isAuthReady}
                  className="flex-1 sm:flex-none bg-white text-black px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.05] active:scale-[0.95]"
                >
                  {!user ? (
                    "Sign In"
                  ) : (
                    <>
                      Generate <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          {/* Bento-grid image reference uploader hidden for now
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-[#0d0d0d]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 text-left flex flex-col justify-between min-h-[140px] relative overflow-hidden group/card hover:border-white/20 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none" />
              <div>
                <h3 className="text-white font-bold text-sm tracking-tight mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Interactive Guidance Mode</span>
                </h3>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-md">
                  Combine a textual prompt description with an optional image reference style. Gemini will extract structure, color layouts, and architectural style to build variant interfaces.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500 border border-black flex items-center justify-center text-[10px] font-bold">1</div>
                  <div className="w-6 h-6 rounded-full bg-blue-500 border border-black flex items-center justify-center text-[10px] font-bold">2</div>
                  <div className="w-6 h-6 rounded-full bg-emerald-500 border border-black flex items-center justify-center text-[10px] font-bold">3</div>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono tracking-wider uppercase">Generates 3 distinct layout solutions</span>
              </div>
            </div>

            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleImageUpload(file);
              }}
              className={`relative bg-[#0d0d0d]/80 backdrop-blur-2xl border rounded-2xl p-4 flex flex-col items-center justify-center min-h-[140px] transition-all cursor-pointer ${isDragging ? 'border-emerald-500 bg-emerald-500/5 scale-[0.98]' : referenceImage ? 'border-emerald-500/50' : 'border-white/10 hover:border-white/20'}`}
              onClick={() => document.getElementById('reference-file-input')?.click()}
            >
              <input 
                id="reference-file-input"
                type="file" 
                accept="image/png, image/jpeg, image/jpg"
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
              
              {referenceImage ? (
                <div className="flex flex-col items-center gap-2 w-full h-full justify-between" onClick={(e) => e.stopPropagation()}>
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                    <img src={referenceImage.base64} alt="Reference Preview" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setReferenceImage(null)}
                      className="absolute top-1 right-1 bg-black/80 hover:bg-black text-white p-1 rounded-full border border-white/10 hover:scale-110 transition-transform"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider uppercase flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" /> Image Loaded
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Paperclip className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-200 font-bold">Attach reference</span>
                    <p className="text-zinc-500 text-[10px] mt-0.5">Drag & drop or browse</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          */}
        </motion.form>
      </main>
    </div>
  );

  const renderGenerating = () => {
    const totalSteps = 3;
    const currentStepIndex = generatingVariants.length;
    
    const stepsInfo = [
      { name: "Standard Layout", desc: "Solid structure with clean grids & classic typography." },
      { name: "Cosmic Slate Layout", desc: "Futuristic dark mode with subtle neon gradients." },
      { name: "Ultra Minimalist Layout", desc: "Generous margins, stark contrasts & raw elegance." }
    ];

    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center relative overflow-hidden p-6 z-50">
        {/* Ambient background glows */}
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <motion.div 
            animate={{ 
              scale: [1, 1.15, 1],
              rotate: [0, 120, 240, 360],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="w-[500px] h-[500px] bg-gradient-to-tr from-purple-600/10 via-blue-600/10 to-emerald-600/10 blur-[100px] opacity-70" 
          />
        </div>

        {/* Logo Header */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-center z-50">
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span className="font-bold text-xs tracking-tighter uppercase font-mono">Synthesizing Designs</span>
          </div>
        </div>

        <div className="z-10 w-full max-w-5xl flex flex-col items-center text-center mt-12">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
            Generating Interfaces...
          </h2>
          <p className="text-emerald-400 font-mono text-xs tracking-wider uppercase mb-12 flex items-center gap-2">
            <span>{generatingStep}</span>
          </p>

          {/* 3 Progressive Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {[0, 1, 2].map((idx) => {
              const isGenerated = idx < generatingVariants.length;
              const isGeneratingNow = idx === generatingVariants.length;
              const info = stepsInfo[idx];
              const variant = generatingVariants[idx];

              return (
                <div 
                  key={idx}
                  className={`border rounded-2xl p-4 flex flex-col h-[300px] relative transition-all duration-500 overflow-hidden ${isGenerated ? 'border-emerald-500/20 bg-white/[0.01]' : isGeneratingNow ? 'border-purple-500/30 bg-purple-500/[0.01] shadow-[0_0_30px_rgba(168,85,247,0.05)] animate-pulse' : 'border-white/5 bg-zinc-950/25 opacity-30'}`}
                >
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Variant {idx + 1}</span>
                    {isGenerated ? (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase">READY</span>
                    ) : isGeneratingNow ? (
                      <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] px-2 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase animate-pulse flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> SYNTHESIZING</span>
                    ) : (
                      <span className="bg-zinc-800/20 text-zinc-600 border border-white/5 text-[9px] px-2 py-0.5 rounded-full font-mono tracking-wider uppercase">PENDING</span>
                    )}
                  </div>

                  <div className="flex-1 w-full flex items-center justify-center min-h-0">
                    {isGenerated ? (
                      <div className="w-full h-full relative rounded-xl border border-white/5 overflow-hidden bg-black/40">
                        <div className="absolute inset-0 origin-top-left" style={{ width: '200%', height: '200%', transform: 'scale(0.5)' }}>
                          <UIPreview html={variant.html} isEditable={false} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center gap-3 p-4 h-full">
                        {isGeneratingNow ? (
                          <Sparkles className="w-8 h-8 text-purple-400 animate-spin" style={{ animationDuration: '3s' }} />
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-600 font-mono text-xs">
                            {idx + 1}
                          </div>
                        )}
                        <div>
                          <h4 className="text-sm font-bold text-zinc-300">{info.name}</h4>
                          <p className="text-zinc-500 text-[10px] max-w-[200px] mx-auto mt-1 leading-relaxed">{info.desc}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (variants.length === 0) return null;
    const currentVariant = variants[currentVariantIndex];

    return (
      <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden relative">
        <header className="h-16 px-6 flex items-center justify-between bg-black/50 backdrop-blur-md z-50 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/tdai_logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg" />
              <span className="font-bold tracking-tighter text-[15px] hidden sm:block">TheDesignAI</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-sm text-zinc-400 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full text-[10px]">
              {currentVariant.label} ({currentVariantIndex + 1}/3)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setView(AppView.LANDING);
                setPrompt('');
                setCurrentProjectUsage(null);
                setCurrentProjectCost(0);
              }}
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Start Over
            </button>
          </div>
        </header>

        <div className="flex-1 relative w-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentVariantIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full"
            >
              <UIPreview html={currentVariant.html} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Arrows */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 z-50">
          <button
            onClick={() => setCurrentVariantIndex(prev => (prev > 0 ? prev - 1 : variants.length - 1))}
            className="w-12 h-12 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 z-50">
          <button
            onClick={() => setCurrentVariantIndex(prev => (prev < variants.length - 1 ? prev + 1 : 0))}
            className="w-12 h-12 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Description Toast & Actions */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-4xl w-full px-4 flex justify-center">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-full p-2 pl-6 shadow-2xl flex items-center gap-6 w-full max-w-3xl">
            <p className="text-zinc-300 text-sm truncate flex-1" title={currentVariant.description}>
              {currentVariant.description}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => {
                  resetBuilderHtml(currentVariant.html);
                  setView(AppView.BUILDER);
                }} 
                className="px-5 py-2 rounded-full text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors flex items-center gap-2"
              >
                Build with this <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const applyPaletteToUI = async (palette: ColorPalette) => {
    setIsChatGenerating(true);
    setSidebarTab('chat');
    const description = `Apply the ${palette.name} color palette. Swatches: ${palette.swatches.map(s => `${s.role} (${s.hex})`).join(', ')}. Rewrite colors of all backgrounds, texts, borders and accents to strictly match this palette style.`;
    
    // Append user message
    const userMsgId = Date.now().toString();
    setChatMessages(prev => [...prev, { id: userMsgId, role: 'user', content: `Please style the interface using the ${palette.name} color palette.` }]);
    
    try {
      let streamedHtml = "";
      const result = await modifyUI(builderHtml, description, (chunk) => {
        streamedHtml += chunk;
        setBuilderHtml(streamedHtml);
      });
      const updatedHtml = result.data;
      setBuilderHtml(updatedHtml);
      
      setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', content: `I have styled your interface with the **${palette.name}** color palette! All corresponding background gradients, visual cards, text styles, and highlights have been updated.` }]);
      
      triggerAutoSave(updatedHtml, `Applied ${palette.name} Palette`);
    } catch (err: any) {
      console.error("Failed to apply palette:", err);
      setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', content: `Error applying color palette: ${err.message || err}` }]);
    } finally {
      setIsChatGenerating(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatGenerating) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsChatGenerating(true);
    
    try {
      let streamedHtml = "";
      const result = await modifyUI(builderHtml, userMsg, (chunk) => {
        streamedHtml += chunk;
        setBuilderHtml(streamedHtml, true);
      });
      const updatedHtml = result.data;
      const usage = result.usage;
      const cost = calculateCost(usage);

      setBuilderHtml(updatedHtml);
      triggerAutoSave(updatedHtml, `AI Edit: ${userMsg.slice(0, 30)}...`);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: 'I have updated the design based on your request.' }]);

      if (user) {
        try {
          const logData = {
            userId: user.uid,
            userEmail: user.email,
            prompt: userMsg,
            usage,
            cost,
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'chatbot_usage'), logData);
        } catch (dbError) {
          console.error("Failed to log chatbot token usage", dbError);
        }
      }
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: 'Sorry, I encountered an error while updating the design.' }]);
    } finally {
      setIsChatGenerating(false);
    }
  };

  const handleExport = () => {
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Design</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; overflow-x: hidden; background: #0f0f0f; color: white; min-height: 100vh; }
  </style>
</head>
<body>
  ${builderHtml}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderBuilder = () => (
    <div className="h-screen w-screen bg-black text-white flex overflow-hidden relative">
      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full relative">
        <header className="h-16 px-6 flex items-center justify-between bg-black/50 backdrop-blur-md z-50 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/tdai_logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg" />
              <span className="font-bold tracking-tighter text-[15px] hidden sm:block">TheDesignAI</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <button 
              onClick={() => setView(AppView.PREVIEW)}
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Variants
            </button>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-0.5 rounded-full shrink-0">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-all flex items-center justify-center cursor-pointer"
                title="Undo (Ctrl + Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-all flex items-center justify-center cursor-pointer"
                title="Redo (Ctrl + Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              id="manual-edit-button"
              onClick={() => {
                if (!isPro && totalGenerations >= 6) {
                  setShowUpgradeModal(true);
                } else {
                  setIsManualEditing(!isManualEditing);
                }
              }} 
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${isManualEditing ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}
            >
              {!isPro && totalGenerations >= 6 && <Lock className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500/10" />}
              <span>{isManualEditing ? 'Done Editing' : 'Manual Edit'}</span>
            </button>
            <button 
              id="export-button"
              onClick={handleExport}
              className="px-4 py-2 rounded-full text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Export HTML
            </button>
            {user && (
              <button 
                id="save-design-button"
                onClick={() => {
                  setSaveDesignName(prompt ? `${prompt.slice(0, 30)} - Revised` : 'My Edited Version');
                  setShowSaveNamingModal(true);
                }}
                className="px-4 py-2 rounded-full text-sm font-bold bg-emerald-505 bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-550/10"
              >
                <Check className="w-4 h-4" />
                <span>Save Design</span>
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 relative w-full overflow-hidden">
          <UIPreview html={builderHtml} isEditable={isManualEditing} />
          
          {/* Floating Property Editor removed to keep preview canvas clean! */}
          {isManualEditing && !selectedElement && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-5 py-2.5 rounded-full text-xs font-extrabold shadow-2xl pointer-events-none flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>Select an element to edit its text, spacing, actions and styles</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Modern Quad-Tab Sidebar */}
      <div id="chat-sidebar" className="w-96 border-l border-white/10 bg-[#0a0a0a] flex flex-col h-full shrink-0 relative">
        {/* Sleek Quad Tab Headers */}
        <div className="flex border-b border-white/10 bg-black/40">
          <button
            type="button"
            onClick={() => setSidebarTab('chat')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all border-b-2 flex flex-col items-center justify-center gap-1 cursor-pointer ${sidebarTab === 'chat' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            title="AI Chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setIsManualEditing(true);
              setSidebarTab('editor');
            }}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all border-b-2 flex flex-col items-center justify-center gap-1 cursor-pointer ${sidebarTab === 'editor' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            title="Manual Styles"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab('palette')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all border-b-2 flex flex-col items-center justify-center gap-1 cursor-pointer ${sidebarTab === 'palette' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            title="AI Color Palette"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Palette</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab('history')}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all border-b-2 flex flex-col items-center justify-center gap-1 cursor-pointer ${sidebarTab === 'history' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            title="Version History"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
        </div>
        
        {/* Lock Overlay for Free tier >= 6 generations (locks only chat/editor) */}
        {!isPro && totalGenerations >= 6 && (sidebarTab === 'chat' || sidebarTab === 'editor') ? (
          <div className="absolute inset-x-0 bottom-0 top-14 bg-black/95 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 bg-zinc-900 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
              <Sparkles className="w-6 h-6 text-yellow-500 animate-pulse" />
            </div>
            <h4 className="text-lg font-black tracking-tight text-white mb-2">Upgrade to Pro Required</h4>
            <p className="text-zinc-405 text-xs leading-relaxed mb-6 max-w-[240px]">
              AI Design Chatbot and Manual edits features are available exclusively for Pro plan users starting from your 6th generation.
            </p>
            <div className="text-[11px] bg-white/5 border border-white/10 px-3 py-1.5 rounded-full font-mono text-zinc-300 mb-8 select-none">
              Generated: <span className="font-bold text-emerald-400">{totalGenerations}</span> / 5 Free limit
            </div>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="w-full bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 text-white py-3 rounded-xl font-bold text-xs tracking-wider uppercase shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              Get Pro for $14 USD
            </button>
          </div>
        ) : null}

        {sidebarTab === 'chat' ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 font-sans">
              {chatMessages.length === 0 ? (
                <div className="text-center text-zinc-500 text-sm mt-10">
                  Ask me to add pages, change colors, or modify the layout!
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-white/10 text-zinc-200 rounded-bl-none'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isChatGenerating && (
                <div className="flex items-start">
                  <div className="bg-white/10 text-zinc-200 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 font-sans">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span className="text-sm">Updating design...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-black/50">
              <form onSubmit={handleChatSubmit} className="relative flex items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Make it dark mode..."
                  disabled={isChatGenerating}
                  className="w-full bg-white/5 border border-white/10 rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors disabled:opacity-50"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isChatGenerating}
                  className="absolute right-2 w-8 h-8 flex items-center justify-center bg-emerald-500 text-black rounded-full disabled:opacity-50 disabled:bg-zinc-600 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : sidebarTab === 'editor' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-6 flex flex-col font-sans">
            {!selectedElement ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 text-emerald-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <h4 className="text-sm font-bold text-white mb-2">No Element Selected</h4>
                <p className="text-zinc-405 text-xs leading-relaxed max-w-[240px]">
                  Click any element on the live preview screen inside the canvas to inspect, tweak, and edit style classes in real-time.
                </p>
                <div className="mt-6 border border-white/5 bg-white/[0.02] p-4 rounded-2xl text-left text-[11px] text-zinc-400 space-y-2 max-w-[240px] w-full">
                  <div className="font-bold text-[10px] uppercase text-zinc-500 tracking-wider">Quick Hotkeys</div>
                  <div className="flex items-center gap-1.5">🖱️ <span className="text-zinc-300">Left-click</span> to select element</div>
                  <div className="flex items-center gap-1.5">✍️ <span className="text-zinc-300">Double-click</span> to edit text inline</div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Element Descriptor Card */}
                <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active tag</span>
                    <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 font-mono font-bold rounded uppercase">
                      {selectedElement.tagName}
                    </span>
                  </div>

                  {/* Direct Inner Text Editor */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Text Content</span>
                    <textarea
                      value={selectedElement.textContent || ''}
                      onChange={(e) => handleUpdateText(e.target.value)}
                      placeholder="No inner text..."
                      className="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-xs text-zinc-300 h-20 focus:outline-none focus:border-emerald-500/40 resize-y transition-colors font-sans"
                    />
                  </div>

                  {/* Tailwind Utility Classes Editor */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Tailwind Utility Classes</span>
                    <textarea
                      value={selectedElement.classes}
                      onChange={(e) => handleUpdateClasses(e.target.value)}
                      placeholder="p-4 bg-zinc-800 text-white rounded-lg..."
                      className="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-emerald-400 h-24 focus:outline-none focus:border-emerald-500/40 resize-y transition-colors"
                    />
                  </div>
                </div>

                {/* Point-and-Click Visual Presets Controller */}
                 <div className="space-y-4">
                  <div className="border-t border-white/10 pt-4 flex items-center gap-2">
                     <Paintbrush className="w-4 h-4 text-emerald-400" />
                     <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-350">Graphical Styling Panel</h4>
                  </div>

                  {/* ADVANCED COLOR PALETTE PANEL */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-emerald-400" />
                        Color Palette
                      </span>
                      <span className="text-[9px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded font-mono">
                        {selectedElement.classes.includes('bg-[') || selectedElement.classes.includes('text-[') ? 'Arbitrary Hex' : 'Theme Standard'}
                      </span>
                    </div>

                    {/* Palette Switcher Bar (Segmented Controls) */}
                    <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-lg">
                      {[
                        { label: 'Background', type: 'bg' as const, color: bgInputHex },
                        { label: 'Text', type: 'text' as const, color: textInputHex },
                        { label: 'Border', type: 'border' as const, color: borderInputHex }
                      ].map(tab => {
                        const isActive = (colorEditingType || 'bg') === tab.type;
                        return (
                          <button
                            key={tab.type}
                            type="button"
                            onClick={() => setColorEditingType(tab.type)}
                            className={`py-1.5 px-1 rounded text-[10px] font-semibold transition-all flex flex-col items-center gap-1 cursor-pointer leading-none ${isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
                          >
                            <span>{tab.label}</span>
                            <span 
                              className="w-4 h-2 rounded-full border border-white/10 inline-block"
                              style={{ backgroundColor: tab.color }}
                            />
                          </button>
                        );
                      })}
                    </div>

                    {/* Color Wheel & Hex Modifier */}
                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg flex flex-col items-center justify-center space-y-3">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
                        Editing {(colorEditingType || 'bg').toUpperCase()} Color
                      </div>

                      {/* Interactive Canvas Color Wheel */}
                      <ColorWheel 
                        color={((colorEditingType || 'bg') === 'bg' ? bgInputHex : (colorEditingType || 'bg') === 'text' ? textInputHex : borderInputHex)} 
                        onChange={(hex) => applyArbitraryColor((colorEditingType || 'bg'), hex)} 
                      />

                      {/* Input fields synced in real-time */}
                      <div className="flex items-center gap-2 w-full">
                        {/* Native Trigger Color Swatch */}
                        <div className="relative w-8 h-8 rounded-lg border border-white/20 shadow overflow-hidden shrink-0 cursor-pointer group flex items-center justify-center">
                          <input 
                            type="color" 
                            value={((colorEditingType || 'bg') === 'bg' ? bgInputHex : (colorEditingType || 'bg') === 'text' ? textInputHex : borderInputHex)}
                            onChange={(e) => applyArbitraryColor((colorEditingType || 'bg'), e.target.value)}
                            className="absolute -inset-1 w-10 h-10 cursor-pointer opacity-0"
                          />
                          <div 
                            className="w-full h-full transition-transform group-hover:scale-110" 
                            style={{ backgroundColor: ((colorEditingType || 'bg') === 'bg' ? bgInputHex : (colorEditingType || 'bg') === 'text' ? textInputHex : borderInputHex) }}
                          />
                        </div>

                        {/* Hex Input Text Field */}
                        <div className="relative flex-1">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-500 font-mono">#</span>
                          <input 
                            type="text" 
                            maxLength={7}
                            value={((colorEditingType || 'bg') === 'bg' ? bgInputHex : (colorEditingType || 'bg') === 'text' ? textInputHex : borderInputHex).replace('#', '')}
                            onChange={(e) => applyArbitraryColor((colorEditingType || 'bg'), e.target.value)}
                            placeholder="FFFFFF"
                            className="w-full bg-black/60 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Cohesive Master Palettes presets */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Unified Theme Presets (Click to Paint)</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { bg: '#030712', text: '#fda4af', border: '#ec4899', label: 'Sunset Cyber' },
                          { bg: '#064e3b', text: '#d1fae5', border: '#059669', label: 'Nordic Emerald' },
                          { bg: '#2e1065', text: '#e9d5ff', border: '#a855f7', label: 'Neon Purple' },
                          { bg: '#1e293b', text: '#f1f5f9', border: '#475569', label: 'Classic Steel' },
                          { bg: '#451a03', text: '#fef3c7', border: '#f97316', label: 'Amber Glow' },
                          { bg: '#fafafa', text: '#18181b', border: '#e4e4e7', label: 'Clean Paper' }
                        ].map((preset, idx) => {
                          const isCurrentMatch = bgInputHex === preset.bg && textInputHex === preset.text;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => applyPresetPalette(preset.bg, preset.text, preset.border)}
                              className={`p-2 rounded-lg border text-left transition-all hover:bg-white/5 cursor-pointer flex flex-col gap-1.5 ${isCurrentMatch ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.02] border-white/5'}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-200 truncate">{preset.label}</span>
                                {isCurrentMatch && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                              </div>
                              <div className="flex gap-1">
                                <span className="w-4 h-3 rounded" style={{ backgroundColor: preset.bg }} />
                                <span className="w-4 h-3 rounded" style={{ backgroundColor: preset.text }} />
                                <span className="w-4 h-3 rounded" style={{ backgroundColor: preset.border }} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Category: Padding/Spacing */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Padding Spacing</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'None', val: '', class: 'p-0' },
                        { label: 'Compact', val: 'p-2', class: 'p-2' },
                        { label: 'Normal', val: 'p-4', class: 'p-4' },
                        { label: 'Roomy', val: 'p-6', class: 'p-6' },
                        { label: 'Spacious', val: 'p-8', class: 'p-8' },
                        { label: 'Side Pill', val: 'px-6 py-2.5', class: 'px-4 py-2' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.class) || (item.val === '' && !selectedElement.classes.includes('p-'));
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['p-', 'px-', 'py-'], item.val)}
                            className={`p-2 rounded-lg text-[10px] font-medium transition-all cursor-pointer border flex items-center justify-start ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            <span className={`w-3.5 h-3.5 border border-dashed rounded text-[8px] mr-1.5 flex items-center justify-center shrink-0 ${isCurrent ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-zinc-600 bg-zinc-850'}`}>
                              {item.label === 'None' ? '■' : '▫'}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Border Radius */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Corner Rounding</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Sharp Corner', val: 'rounded-none', rounded: 'rounded-none' },
                        { label: 'Soft Round', val: 'rounded-md', rounded: 'rounded-md' },
                        { label: 'Modern Curve', val: 'rounded-xl', rounded: 'rounded-xl' },
                        { label: 'Hyper Round', val: 'rounded-3xl', rounded: 'rounded-3xl' },
                        { label: 'Circular Pill', val: 'rounded-full', rounded: 'rounded-full' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val) || (item.val === 'rounded-none' && !selectedElement.classes.includes('rounded-'));
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['rounded-'], item.val)}
                            className={`p-2 rounded-lg text-[10px] font-medium transition-all cursor-pointer border flex items-center ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            <span className={`w-3.5 h-3.5 bg-white/10 mr-2 border border-white/20 inline-block shrink-0 ${item.rounded}`} />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Alignment */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Text Alignment</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'Left', val: 'text-left', icon: <AlignLeft className="w-3.5 h-3.5 shrink-0" /> },
                        { label: 'Center', val: 'text-center', icon: <AlignCenter className="w-3.5 h-3.5 shrink-0" /> },
                        { label: 'Right', val: 'text-right', icon: <AlignRight className="w-3.5 h-3.5 shrink-0" /> }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val) || (item.val === 'text-left' && !selectedElement.classes.includes('text-center') && !selectedElement.classes.includes('text-right'));
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['text-left', 'text-center', 'text-right'], item.val)}
                            className={`p-2 rounded-lg text-[10px] font-medium transition-all cursor-pointer border flex items-center justify-center gap-1.5 ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Borders */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Border Outline</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'No Outline', val: 'border-none', class: 'border-0 border-zinc-900 border-dashed' },
                        { label: 'Glassy Card', val: 'border border-white/10', class: 'border border-white/10' },
                        { label: 'Emerald Tint', val: 'border border-emerald-500/30', class: 'border border-emerald-500/30' },
                        { label: 'Thick Steel', val: 'border-2 border-zinc-700', class: 'border-2 border-zinc-700' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val.split(' ')[0]) && item.val !== 'border-none';
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['border', 'border-'], item.val === 'border-none' ? '' : item.val)}
                            className={`p-2 rounded-lg text-[10px] font-medium transition-all cursor-pointer border flex items-center gap-2 ${isCurrent || (item.val === 'border-none' && !selectedElement.classes.includes('border')) ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            <span className={`w-4 h-3 rounded shrink-0 ${item.class}`} />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Layout Mode */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Container Flow</span>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label: 'Regular Block (Responsive)', val: 'block', desc: 'Flows naturally in document stack' },
                        { label: 'Grid Stack (Flex Column)', val: 'flex flex-col gap-4', desc: 'Vertical alignment, 16px gap spacing' },
                        { label: 'Horizontal Row (Flex Row)', val: 'flex flex-row items-center gap-2', desc: 'Side-by-side spacing with auto center' },
                        { label: 'Symmetry Center (Centered)', val: 'flex items-center justify-center', desc: 'Horizontal and Vertical visual center' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val.split(' ')[0]);
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['flex', 'flex-col', 'flex-row', 'items-center', 'justify-center', 'block'], item.val)}
                            className={`p-2.5 rounded-lg text-[10px] transition-all cursor-pointer border text-left flex flex-col gap-0.5 ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                          >
                            <span className="font-bold">{item.label}</span>
                            <span className="text-[9px] text-zinc-500">{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Deselect element button */}
                <button
                  onClick={() => setSelectedElement(null)}
                  className="w-full mt-4 bg-white/5 border border-white/10 text-zinc-350 hover:text-white hover:bg-white/10 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Deselect Element
                </button>
              </div>
            )}
          </div>
        ) : sidebarTab === 'palette' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col font-sans">
            <div className="flex items-center justify-between shrink-0">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-emerald-400" />
                <span>AI Style Palettes</span>
              </h4>
              <span className="text-[10px] font-mono text-zinc-500 uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                {palettes.length} Palettes
              </span>
            </div>

            <button
              type="button"
              disabled={isGeneratingPalette}
              onClick={async () => {
                setIsGeneratingPalette(true);
                try {
                  const res = await generatePalette(builderHtml);
                  setPalettes(prev => [...res.data, ...prev]);
                } catch (err: any) {
                  console.error("Palette generation failed:", err);
                  alert("Palette generation failed: " + err.message);
                } finally {
                  setIsGeneratingPalette(false);
                }
              }}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-lg shrink-0"
            >
              {isGeneratingPalette ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Palettes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
                  <span>Generate New Palettes with AI</span>
                </>
              )}
            </button>

            <div className="space-y-4 flex-1 overflow-y-auto pr-0.5">
              {palettes.map((p) => (
                <div key={p.id} className="bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl p-4 flex flex-col gap-3 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">{p.name}</span>
                  </div>
                  
                  {/* Visual swatches row */}
                  <div className="grid grid-cols-5 gap-1 bg-black/40 p-1.5 rounded-lg border border-white/5">
                    {p.swatches.map((swatch, sIdx) => (
                      <div key={sIdx} className="flex flex-col items-center gap-1">
                        <div 
                          className="w-full aspect-square rounded-md shadow-sm border border-white/10 relative group/swatch"
                          style={{ backgroundColor: swatch.hex }}
                          title={`${swatch.role}: ${swatch.hex}`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 hover:opacity-100 transition-opacity rounded-md">
                            <span className="text-[8px] font-mono font-bold text-white uppercase">{swatch.role.slice(0, 3)}</span>
                          </div>
                        </div>
                        <span className="text-[8px] font-mono text-zinc-500 font-bold select-all">{swatch.hex}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => applyPaletteToUI(p)}
                    className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-colors cursor-pointer"
                  >
                    Apply Palette to Design
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col font-sans">
            <div className="flex items-center justify-between shrink-0">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-400" />
                <span>Version Timeline</span>
              </h4>
              <span className="text-[10px] font-mono text-zinc-500 uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                {versionHistory.length} Saved
              </span>
            </div>

            {versionHistory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-3 text-zinc-500">
                  <History className="w-5 h-5" />
                </div>
                <p className="text-zinc-500 text-xs">No version history recorded yet.</p>
                <p className="text-zinc-600 text-[10px] max-w-[200px] mt-1">Make any edits or layout selections to auto-save variations.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                {versionHistory.map((version) => (
                  <VersionItem 
                    key={version.id}
                    version={version}
                    onRestore={(html, name) => {
                      setBuilderHtml(html);
                      triggerAutoSave(html, `Restored point: ${name}`);
                    }}
                    onUpdateName={updateVersionName}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center relative overflow-hidden">
      <header className="w-full p-6 flex justify-between items-center z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView(AppView.LANDING)}
            className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-5 h-5" /> Back
          </button>
          <div className="flex items-center gap-3">
            <img src="/tdai_logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg" />
            <span className="font-bold text-xl tracking-tighter">Your Workspace</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user?.email === 'thedesignai3@gmail.com' && (
            <button
              onClick={() => setView(AppView.ADMIN)}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-full text-xs font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Admin Dashboard</span>
            </button>
          )}
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-2 text-zinc-400 hover:text-red-400 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="z-10 w-full max-w-5xl px-6 py-12 flex flex-col gap-12">
        {/* User Info */}
        <div className="flex items-center gap-6 bg-white/5 border border-white/10 p-8 rounded-3xl">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full border-2 border-white/20" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-white/20">
              <UserIcon className="w-10 h-10 text-zinc-500" />
            </div>
          )}
          <div>
            <h2 className="text-3xl font-bold mb-1">{user?.displayName || 'User'}</h2>
            <p className="text-zinc-400">{user?.email}</p>
          </div>
        </div>

        {/* Workspace Hub Tabs */}
        <div>
          <div className="flex border-b border-white/10 gap-8 mb-8">
            <button 
              onClick={() => setProfileTab('projects')}
              className={`pb-4 px-1.5 text-lg font-bold transition-all relative ${profileTab === 'projects' ? 'text-white font-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Original Projects ({userProjects.length})
              {profileTab === 'projects' && (
                <motion.div layoutId="profile-tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
              )}
            </button>
            <button 
              onClick={() => {
                fetchSavedDesigns();
                setProfileTab('saves');
              }}
              className={`pb-4 px-1.5 text-lg font-bold transition-all relative ${profileTab === 'saves' ? 'text-white font-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Saved Edited Designs ({userSavedDesigns.length})
              {profileTab === 'saves' && (
                <motion.div layoutId="profile-tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
              )}
            </button>
          </div>

          {profileTab === 'projects' ? (
            isLoadingProjects ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
              </div>
            ) : userProjects.length === 0 ? (
              <div className="text-center py-16 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-zinc-400 text-lg">You haven't generated any projects yet.</p>
                <button 
                  onClick={() => setView(AppView.LANDING)}
                  className="mt-6 bg-white text-black px-6 py-3 rounded-full font-medium hover:bg-zinc-200 transition-colors"
                >
                  Create Your First Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userProjects.map((project) => (
                    <div 
                      key={project.id} 
                      className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors cursor-pointer group flex flex-col h-full"
                      onClick={() => {
                        setVariants(project.variants);
                        setCurrentVariantIndex(0);
                        setCurrentProjectUsage(project.usage || null);
                        setCurrentProjectCost(project.cost || 0);
                        setView(AppView.PREVIEW);
                      }}
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-lg mb-2 line-clamp-2 group-hover:text-emerald-400 transition-colors">
                          {project.prompt}
                        </h4>
                        <p className="text-sm text-zinc-500 mb-4">
                          {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                          <span className="bg-black/50 px-2 py-1 rounded-md">{project.variants.length} Variants</span>
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            )
          ) : (
            isLoadingSavedDesigns ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
              </div>
            ) : userSavedDesigns.length === 0 ? (
              <div className="text-center py-16 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-zinc-400 text-lg">You haven't saved any customized variants to history yet.</p>
                <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
                  Modify any variant layout using the interactive side chatbot panel, then click "Save Design" to persist your visual drafts.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userSavedDesigns.map((design) => (
                    <div 
                      key={design.id} 
                      className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors cursor-pointer group flex flex-col h-full animate-fadeIn"
                      onClick={() => {
                        resetBuilderHtml(design.html);
                        setIsManualEditing(false);
                        setChatMessages([
                          { id: 'welcome', role: 'ai', content: `Restored saved design: "${design.name}".` }
                        ]);
                        setView(AppView.BUILDER);
                      }}
                    >
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-2 line-clamp-2 text-zinc-200 group-hover:text-emerald-400 transition-colors">
                          {design.name}
                        </h4>
                        <p className="text-xs text-zinc-400 mb-2 font-mono italic">
                          Parent prompt: "{design.parentPrompt}"
                        </p>
                        <p className="text-xs text-zinc-500 mb-4 font-mono">
                          Saved: {new Date(design.createdAt).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Load Edited Design
                        </span>
                      </div>
                    </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );

  const renderAdmin = () => {
    // 1. Calculations
    const totalUsers = adminUsers.length;
    
    // Sort users dynamically
    const sortedAdminUsers = [...adminUsers].sort((a, b) => {
      if (adminSortBy === 'active') {
        const timeA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      } else {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
    });
    
    // Active users: login within 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeUsersCount = adminUsers.filter(u => u.lastLoginAt ? new Date(u.lastLoginAt).getTime() > sevenDaysAgo : false).length;
    
    // Active subscriptions: plan status 'active' (or admin since designai3 is active Pro by default)
    const activeSubsCount = adminUsers.filter(u => u.subscription?.status === 'active' || u.email === 'thedesignai3@gmail.com').length;
    
    // API Costs
    const totalCost = adminProjects.reduce((sum, p) => sum + (p.cost || 0), 0);
    const totalTokens = adminProjects.reduce((sum, p) => sum + (p.usage?.totalTokenCount || 0), 0);
    const totalPrompt = adminProjects.reduce((sum, p) => sum + (p.usage?.promptTokenCount || 0), 0);
    const totalCandidates = adminProjects.reduce((sum, p) => sum + (p.usage?.candidatesTokenCount || 0), 0);

    const chatbotCost = adminChatbotUsage.reduce((sum, c) => sum + (c.cost || 0), 0);
    const chatbotTokens = adminChatbotUsage.reduce((sum, c) => sum + (c.usage?.totalTokenCount || 0), 0);
    const chatbotPrompt = adminChatbotUsage.reduce((sum, c) => sum + (c.usage?.promptTokenCount || 0), 0);
    const chatbotCandidates = adminChatbotUsage.reduce((sum, c) => sum + (c.usage?.candidatesTokenCount || 0), 0);

    const grandTotalCost = totalCost + chatbotCost;
    const grandTotalTokens = totalTokens + chatbotTokens;
    const grandTotalPrompt = totalPrompt + chatbotPrompt;
    const grandTotalCandidates = totalCandidates + chatbotCandidates;

    // Prepare daily time-series data for the charts
    const dailyMap: Record<string, { date: string; projectsCost: number; chatbotCost: number; projectsTokens: number; chatbotTokens: number; totalCost: number }> = {};
    
    adminProjects.forEach(p => {
      if (!p.createdAt) return;
      const d = new Date(p.createdAt);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!dailyMap[key]) {
        dailyMap[key] = { date: key, projectsCost: 0, chatbotCost: 0, projectsTokens: 0, chatbotTokens: 0, totalCost: 0 };
      }
      dailyMap[key].projectsCost += p.cost || 0;
      dailyMap[key].projectsTokens += p.usage?.totalTokenCount || 0;
      dailyMap[key].totalCost += p.cost || 0;
    });

    adminChatbotUsage.forEach(c => {
      if (!c.createdAt) return;
      const d = new Date(c.createdAt);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!dailyMap[key]) {
        dailyMap[key] = { date: key, projectsCost: 0, chatbotCost: 0, projectsTokens: 0, chatbotTokens: 0, totalCost: 0 };
      }
      dailyMap[key].chatbotCost += c.cost || 0;
      dailyMap[key].chatbotTokens += c.usage?.totalTokenCount || 0;
      dailyMap[key].totalCost += c.cost || 0;
    });

    const dailyChartData = Object.values(dailyMap).sort((a, b) => {
      const projA = adminProjects.find(p => p.createdAt && new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === a.date);
      const chatA = adminChatbotUsage.find(c => c.createdAt && new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === a.date);
      const valA = new Date(projA?.createdAt || chatA?.createdAt || Date.now()).getTime();

      const projB = adminProjects.find(p => p.createdAt && new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === b.date);
      const chatB = adminChatbotUsage.find(c => c.createdAt && new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === b.date);
      const valB = new Date(projB?.createdAt || chatB?.createdAt || Date.now()).getTime();

      return valA - valB;
    });

    // Group stats by user id
    const userStats: Record<string, { 
      projectsCount: number; 
      cost: number; 
      promptTokens: number; 
      candidatesTokens: number; 
      totalTokens: number;
      chatCost: number;
      chatTokens: number;
    }> = {};

    adminUsers.forEach(u => {
      userStats[u.uid] = { projectsCount: 0, cost: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, chatCost: 0, chatTokens: 0 };
    });

    adminProjects.forEach(p => {
      if (!userStats[p.userId]) {
        userStats[p.userId] = { projectsCount: 0, cost: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, chatCost: 0, chatTokens: 0 };
      }
      userStats[p.userId].projectsCount += 1;
      userStats[p.userId].cost += (p.cost || 0);
      userStats[p.userId].promptTokens += (p.usage?.promptTokenCount || 0);
      userStats[p.userId].candidatesTokens += (p.usage?.candidatesTokenCount || 0);
      userStats[p.userId].totalTokens += (p.usage?.totalTokenCount || 0);
    });

    adminChatbotUsage.forEach(c => {
      if (!userStats[c.userId]) {
        userStats[c.userId] = { projectsCount: 0, cost: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, chatCost: 0, chatTokens: 0 };
      }
      userStats[c.userId].chatCost += (c.cost || 0);
      userStats[c.userId].chatTokens += (c.usage?.totalTokenCount || 0);
    });

    // Detailed projects for selected user
    const selectedUserProjects = selectedAdminUser 
      ? adminProjects.filter(p => p.userId === selectedAdminUser.uid)
      : [];

    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center relative overflow-hidden pb-12">
        <DottedGlowBackground />
        
        {/* Header */}
        <header className="w-full p-6 flex justify-between items-center z-50 border-b border-white/10 bg-black/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setSelectedAdminUser(null);
                setView(AppView.LANDING);
              }}
              className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <ChevronLeft className="w-5 h-5" /> Back to App
            </button>
            <div className="flex items-center gap-3">
              <img src="/tdai_logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg" />
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tighter leading-none">Console</span>
                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest leading-none mt-1">Admin Dashboard</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Preferred API Provider Badge */}
            <div className="hidden sm:flex items-center gap-2 bg-zinc-950/60 border border-white/5 rounded-full px-3 py-1 mr-1">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Powered By:</span>
              <div className="flex items-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full px-2.5 py-0.5 gap-1 text-[9px] font-bold tracking-wider uppercase">
                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                <span>Gemini API</span>
              </div>
            </div>

            <button 
              onClick={fetchAdminData}
              disabled={isAdminLoading}
              className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white transition-all px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAdminLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Stats</span>
            </button>
            <button 
              onClick={() => {
                setSelectedAdminUser(null);
                setView(AppView.LANDING);
              }}
              className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 transition-colors px-4 py-2 rounded-full text-xs font-bold"
            >
              Exit Console
            </button>
          </div>
        </header>

        <main className="z-10 w-full max-w-7xl px-6 py-10 flex flex-col gap-8 flex-1">
          {isAdminLoading && adminUsers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mb-4" />
              <p className="text-zinc-400 text-sm">Loading dynamic workspace telemetry...</p>
            </div>
          ) : (
            <>
              {/* Dynamic Gateway Selector Dashboard Widget */}
              <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden group">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                    <Sliders className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Dynamic Generation API Routing</h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                      Choose which AI gateway to route design logic, clarifying interviews, and variant drafts by default. The inactive provider will automatically act as a high-fidelity failover fallback.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0 z-10">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-center sm:text-left">Selected Core Gateway:</span>
                  <div className="flex bg-black/60 border border-white/10 rounded-full p-1">
                    <div className="flex-1 sm:flex-initial px-5 py-2 rounded-full text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 bg-emerald-500 text-black shadow-lg shadow-emerald-500/25">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Gemini API (Active)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Telemetry Bento Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                     {/* 1. Cost */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Coins className="w-16 h-16 text-emerald-400" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono block mb-2">Total Api Cost</span>
                  <div className="text-3xl md:text-4xl font-black text-emerald-400 tracking-tight font-mono leading-none">
                    ${grandTotalCost.toFixed(3)}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-3 flex justify-between">
                    <span>Projs: ${totalCost.toFixed(3)}</span>
                    <span>Chat: ${chatbotCost.toFixed(3)}</span>
                  </div>
                </div>

                {/* 2. Registered & Active Users */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Users className="w-16 h-16 text-purple-400" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono block mb-2">Active Users (7d)</span>
                  <div className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none flex items-baseline gap-2">
                    <span>{activeUsersCount}</span>
                    <span className="text-zinc-500 text-sm font-light font-mono">/ {totalUsers} total</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-3">Users seen this week</span>
                </div>

                {/* 3. Subscriptions */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <CreditCard className="w-16 h-16 text-blue-400" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono block mb-2">Active Pro Plans</span>
                  <div className="text-3xl md:text-4xl font-black text-blue-400 tracking-tight leading-none flex items-baseline gap-2 font-mono">
                    <span>{activeSubsCount}</span>
                    <span className="text-zinc-500 text-sm font-light">active</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-3">Toggled in administration panel</span>
                </div>

                {/* 4. Token metrics */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Activity className="w-16 h-16 text-yellow-500" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono block mb-2">Token Usage Balance</span>
                  <div className="text-3xl md:text-4xl font-black text-yellow-500 tracking-tight leading-none font-mono">
                    {(grandTotalTokens / 1000).toFixed(0)}k
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-3 flex flex-col gap-0.5">
                    <div className="flex justify-between">
                      <span>Projs: {(totalTokens / 1000).toFixed(0)}k</span>
                      <span>Chat: {(chatbotTokens / 1000).toFixed(0)}k</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Telemetry Visual Graphs (New) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Daily Costs Graph */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex flex-col h-[380px]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-bold text-zinc-200">Daily API Costs (USD)</h4>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Model Price Weighted</span>
                  </div>
                  
                  {dailyChartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-650 text-xs font-mono">
                      No telemetry cost logs gathered yet.
                    </div>
                  ) : (
                    <div className="flex-1 w-full min-h-0 text-[10px] font-mono">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorProjects" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorChat" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.1} vertical={false} />
                          <XAxis dataKey="date" stroke="#71717a" tickLine={false} />
                          <YAxis stroke="#71717a" tickLine={false} tickFormatter={(val) => `$${val.toFixed(2)}`} />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-zinc-950 border border-white/10 p-3 rounded-xl shadow-2xl font-mono text-[10px] text-zinc-300">
                                    <p className="font-bold text-white mb-1">{label}</p>
                                    {payload.map((entry: any, i: number) => (
                                      <div key={i} className="flex justify-between gap-4 py-0.5">
                                        <span style={{ color: entry.stroke || entry.fill }}>{entry.name}:</span>
                                        <span className="font-bold text-white">${entry.value.toFixed(4)}</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area name="Project Gen" type="monotone" dataKey="projectsCost" stroke="#10b981" fillOpacity={1} fill="url(#colorProjects)" strokeWidth={2} />
                          <Area name="Chat Adjust" type="monotone" dataKey="chatbotCost" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorChat)" strokeWidth={2} />
                          <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* 2. Daily Token Load Graph */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex flex-col h-[380px]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-yellow-500" />
                      <h4 className="text-sm font-bold text-zinc-200">Daily Token Load</h4>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Model Token Consumption</span>
                  </div>
                  
                  {dailyChartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-650 text-xs font-mono">
                      No token telemetry data gathered yet.
                    </div>
                  ) : (
                    <div className="flex-1 w-full min-h-0 text-[10px] font-mono">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.1} vertical={false} />
                          <XAxis dataKey="date" stroke="#71717a" tickLine={false} />
                          <YAxis stroke="#71717a" tickLine={false} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-zinc-950 border border-white/10 p-3 rounded-xl shadow-2xl font-mono text-[10px] text-zinc-300">
                                    <p className="font-bold text-white mb-1">{label}</p>
                                    {payload.map((entry: any, i: number) => (
                                      <div key={i} className="flex justify-between gap-4 py-0.5">
                                        <span style={{ color: entry.fill }}>{entry.name}:</span>
                                        <span className="font-bold text-white">{(entry.value / 1000).toFixed(1)}k tokens</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar name="Project Tokens" dataKey="projectsTokens" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar name="Chatbot Tokens" dataKey="chatbotTokens" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* User management and Detail Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Admin Users Table (Col span 12 or 7 if a user is selected) */}
                <div className={`bg-zinc-950/25 border border-white/5 rounded-3xl p-6 backdrop-blur-md overflow-hidden transition-all duration-300 ${selectedAdminUser ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-zinc-400" />
                      <h3 className="text-lg font-bold">User API Usage Records</h3>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <span className="text-xs text-zinc-400 font-mono">Sort:</span>
                      <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/5">
                        <button
                          onClick={() => setAdminSortBy('active')}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${adminSortBy === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10' : 'text-zinc-400 hover:text-white'}`}
                        >
                          Last Active
                        </button>
                        <button
                          onClick={() => setAdminSortBy('newest')}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${adminSortBy === 'newest' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10' : 'text-zinc-400 hover:text-white'}`}
                        >
                          Newest
                        </button>
                      </div>
                      <span className="text-xs bg-white/5 px-2.5 py-1 rounded-full text-zinc-400 font-mono">
                        {adminUsers.length} Users
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="text-zinc-500 text-xs font-mono uppercase tracking-wider border-b border-white/5">
                          <th className="pb-3 font-medium">Identity</th>
                          <th className="pb-3 font-medium">Plans / Status</th>
                          <th className="pb-3 font-medium text-right">Projects</th>
                          <th className="pb-3 font-medium text-right font-mono">Usage Cost</th>
                          <th className="pb-3 font-medium text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sortedAdminUsers.map(userItem => {
                          const stats = userStats[userItem.uid] || { projectsCount: 0, cost: 0, totalTokens: 0, chatCost: 0, chatTokens: 0 };
                          const isActivePro = userItem.subscription?.status === 'active' || userItem.email === 'thedesignai3@gmail.com';
                          const isCurrentlySelected = selectedAdminUser?.uid === userItem.uid;

                          return (
                            <tr 
                              key={userItem.uid} 
                              className={`hover:bg-white/2 transition-colors group ${isCurrentlySelected ? 'bg-white/5' : ''}`}
                            >
                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-3">
                                  {userItem.photoURL ? (
                                    <img src={userItem.photoURL} alt="" className="w-9 h-9 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10 text-xs uppercase font-bold text-zinc-400">
                                      {(userItem.displayName || userItem.email || '?')[0]}
                                    </div>
                                  )}
                                  <div className="flex flex-col flex-wrap max-w-[200px]">
                                    <span className="font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
                                      {userItem.displayName || 'No Name'}
                                    </span>
                                    <span className="text-zinc-500 text-xs font-mono truncate">
                                      {userItem.email}
                                    </span>
                                    {userItem.lastLoginAt && (
                                      <span className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                        Active: {new Date(userItem.lastLoginAt).toLocaleDateString()} {new Date(userItem.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              
                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase leading-none ${isActivePro ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-zinc-800/80 text-zinc-500 border border-white/5'}`}>
                                    {isActivePro ? 'Pro Active' : 'Free tier'}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSubscription(userItem.uid, userItem.subscription);
                                    }}
                                    className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white px-2 py-1 rounded transition-colors border border-white/5 uppercase font-medium"
                                  >
                                    Toggle Pro
                                  </button>
                                </div>
                              </td>

                              <td className="py-4 pr-4">
                                <div className="flex flex-col text-right font-mono text-zinc-300">
                                  <span className="font-bold">{stats.projectsCount} Projs</span>
                                  <span className="text-zinc-500 text-[11px]">{(stats.chatTokens / 1000).toFixed(1)}k chat tkns</span>
                                </div>
                              </td>

                              <td className="py-4 pr-4 text-right">
                                <span className="font-mono text-emerald-400 block font-bold text-sm">
                                  ${(stats.cost + stats.chatCost).toFixed(4)}
                                </span>
                                <span className="text-[10px] text-zinc-500 block font-mono">
                                  {((stats.totalTokens + stats.chatTokens) / 1000).toFixed(1)}k total
                                </span>
                              </td>

                              <td className="py-4 text-center">
                                <button
                                  onClick={() => setSelectedAdminUser(userItem)}
                                  className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-medium border border-white/10 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Inspect</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Selected User Logs Subscreen (Col span 6) */}
                {selectedAdminUser && (
                  <div className="lg:col-span-6 bg-zinc-950/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl flex flex-col gap-6 relative">
                    <button 
                      onClick={() => setSelectedAdminUser(null)}
                      className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4 pb-4 border-b border-white/5">
                      {selectedAdminUser.photoURL ? (
                        <img src={selectedAdminUser.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-white/10" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10 text-lg uppercase font-bold text-zinc-400">
                          {selectedAdminUser.displayName?.[0] || selectedAdminUser.email[0]}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest block leading-none mb-1">Inspecting API Session Logs</span>
                        <h3 className="text-lg font-bold leading-none">{selectedAdminUser.displayName || 'Unnamed user'}</h3>
                        <p className="text-zinc-400 text-xs font-mono mt-1">{selectedAdminUser.email}</p>
                      </div>
                    </div>

                    {/* Quick user totals bento */}
                    <div className="grid grid-cols-3 gap-2 bg-black/40 border border-white/5 rounded-2xl p-4">
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase font-mono block">Projs / Chat</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">
                          {selectedUserProjects.length} / {adminChatbotUsage.filter(c => c.userId === selectedAdminUser.uid).length}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase font-mono block font-bold">Total Cost</span>
                        <span className="text-sm font-black font-mono text-emerald-400">
                          ${((userStats[selectedAdminUser.uid]?.cost || 0) + (userStats[selectedAdminUser.uid]?.chatCost || 0)).toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 uppercase font-mono block">Total Tokens</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">
                          {(((userStats[selectedAdminUser.uid]?.totalTokens || 0) + (userStats[selectedAdminUser.uid]?.chatTokens || 0)) / 1000).toFixed(1)}k
                        </span>
                      </div>
                    </div>

                    {/* Detailed Prompt entries list */}
                    <div className="flex flex-col gap-4">
                      {/* Selected user logs sub-tabs */}
                      <div className="flex border-b border-white/5 gap-4">
                        <button 
                          onClick={() => setAdminLogTab('projects')}
                          className={`pb-2 px-1 text-xs font-bold transition-all relative ${adminLogTab === 'projects' ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
                        >
                          Project Runs ({selectedUserProjects.length})
                          {adminLogTab === 'projects' && (
                            <motion.div layoutId="admin-log-tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
                          )}
                        </button>
                        <button 
                          onClick={() => setAdminLogTab('chatbot')}
                          className={`pb-2 px-1 text-xs font-bold transition-all relative ${adminLogTab === 'chatbot' ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
                        >
                          Chatbot Edits ({adminChatbotUsage.filter(c => c.userId === selectedAdminUser.uid).length})
                          {adminLogTab === 'chatbot' && (
                            <motion.div layoutId="admin-log-tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
                          )}
                        </button>
                      </div>
                      
                      {adminLogTab === 'projects' ? (
                        selectedUserProjects.length === 0 ? (
                          <div className="text-center py-10 bg-black/20 rounded-2xl border border-white/5 text-zinc-500 text-sm">
                            No query logs registered for this user in workspace records.
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                            {selectedUserProjects.map(proj => {
                              const dateStr = new Date(proj.createdAt).toLocaleString();
                              const variantsCount = proj.variants?.length || 0;
                              const promptTitle = proj.prompt;
                              const costVal = proj.cost || 0;
                              const tPrompt = proj.usage?.promptTokenCount || 0;
                              const tCandidates = proj.usage?.candidatesTokenCount || 0;

                              return (
                                <div key={proj.id} className="bg-black/30 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors flex flex-col gap-3 relative group">
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                      <span className="text-[9px] text-zinc-500 font-mono block mb-1">Prompt Query Run: {dateStr}</span>
                                      <p className="text-xs text-white font-medium line-clamp-2 md:leading-relaxed" title={promptTitle}>
                                        "{promptTitle}"
                                      </p>
                                    </div>

                                    <button
                                      onClick={() => {
                                        setVariants(proj.variants);
                                        setCurrentVariantIndex(0);
                                        setCurrentProjectUsage(proj.usage || null);
                                        setCurrentProjectCost(proj.cost || 0);
                                        setView(AppView.PREVIEW);
                                      }}
                                      className="shrink-0 flex items-center gap-1 bg-white/5 hover:bg-emerald-500 hover:text-black hover:border-emerald-600 border border-white/10 text-zinc-300 px-2 py-1 rounded text-[10px] font-bold transition-all"
                                      title="Examine live rendered artifact variants"
                                    >
                                      <span>View UI</span>
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-500">
                                    <div>
                                      <span className="block text-[8px] uppercase text-zinc-555 font-bold">Cost</span>
                                      <span className="text-emerald-400 font-bold">${costVal.toFixed(4)}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] uppercase text-zinc-555 font-bold">Tokens</span>
                                      <span className="text-zinc-300">{tPrompt + tCandidates} total</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] uppercase text-zinc-555 font-bold font-bold">Variants</span>
                                      <span className="text-zinc-300">{variantsCount} synthesized</span>
                                    </div>
                                  </div>
                                  <div className="text-[9px] text-zinc-650 font-mono text-right mt-1">
                                    In: {tPrompt} tkns / Out: {tCandidates} tkns
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        adminChatbotUsage.filter(c => c.userId === selectedAdminUser.uid).length === 0 ? (
                          <div className="text-center py-10 bg-black/20 rounded-2xl border border-white/5 text-zinc-500 text-sm">
                            No chatbot query records found in workspace logs.
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                            {adminChatbotUsage.filter(c => c.userId === selectedAdminUser.uid).map(chat => {
                              const dateStr = new Date(chat.createdAt).toLocaleString();
                              const chatPrompt = chat.prompt;
                              const costVal = chat.cost || 0;
                              const tPrompt = chat.usage?.promptTokenCount || 0;
                              const tCandidates = chat.usage?.candidatesTokenCount || 0;

                              return (
                                <div key={chat.id} className="bg-black/30 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors flex flex-col gap-3 relative">
                                  <div>
                                    <span className="text-[9px] text-zinc-500 font-mono block mb-1 font-bold">Chatbot Request: {dateStr}</span>
                                    <p className="text-xs text-white font-medium italic break-words leading-relaxed animate-fadeIn" title={chatPrompt}>
                                      "{chatPrompt}"
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-500">
                                    <div>
                                      <span className="block text-[8px] uppercase text-zinc-555 font-bold">Chatbot Cost</span>
                                      <span className="text-emerald-400 font-bold">${costVal.toFixed(4)}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] uppercase text-zinc-555 font-bold">Total Tokens</span>
                                      <span className="text-zinc-300">{tPrompt + tCandidates}</span>
                                    </div>
                                  </div>
                                  <div className="text-[9px] text-zinc-650 font-mono text-right mt-1">
                                    In: {tPrompt} tkns / Out: {tCandidates} tkns
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}
                    </div>

                  </div>
                )}

              </div>
            </>
          )}
        </main>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black font-sans">
      {view === AppView.LANDING && renderLanding()}
      {view === AppView.GENERATING && renderGenerating()}
      {view === AppView.PREVIEW && renderPreview()}
      {view === AppView.BUILDER && renderBuilder()}
      {view === AppView.PROFILE && renderProfile()}
      {view === AppView.ADMIN && renderAdmin()}

      {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}

      <AnimatePresence>
        {showUpgradeModal ? (
          <UpgradeModal 
            user={user}
            onClose={() => setShowUpgradeModal(false)}
            onSuccess={(newSub) => {
              if (user) {
                setUser({
                  ...user,
                  subscription: newSub
                });
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* Global Branding Credit */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity pointer-events-none sm:pointer-events-auto">
        <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">TheDesignAI</span>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <img src="/tdai_logo.jpeg" alt="Logo" className="w-5 h-5 rounded-full" />
          <span className="text-[10px] font-bold tracking-tighter text-zinc-400">by Anqair</span>
        </div>
      </div>
    </div>
  );
};

export default App;
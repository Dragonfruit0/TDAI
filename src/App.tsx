import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, Loader2, X, User as UserIcon, LogOut, History, Download, MessageSquare, Send, LayoutGrid, ShieldAlert, Lock, CreditCard, Users, TrendingUp, Coins, Activity, Eye, RefreshCw, Trash2, ArrowUpRight, CheckCircle, Palette } from 'lucide-react';
import { AppView, UIVariant, UserProfile, Project, ChatMessage, UsageMetadata, DesignSuggestion } from './types.ts';
import { generateFollowUpQuestions, generateUIVariants, modifyUI, generateDesignSuggestions } from './services/geminiService.ts';
import { UIPreview } from './components/UIPreview.tsx';
import { OnboardingTutorial } from './components/OnboardingTutorial.tsx';
import DottedGlowBackground from './components/DottedGlowBackground.tsx';
import { UpgradeModal } from './components/UpgradeModal.tsx';
import { ApiKeyErrorModal } from './components/ApiKeyErrorModal.tsx';
import { auth, db, googleProvider, signInWithPopup, signOut, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, handleFirestoreError, OperationType } from './firebase.ts';
import { onAuthStateChanged } from 'firebase/auth';

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
  const [apiKeyErrorDetails, setApiKeyErrorDetails] = useState<string | null>(null);

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

  // Generation state
  const [isGeneratingUI, setIsGeneratingUI] = useState(false);
  const [variants, setVariants] = useState<UIVariant[]>([]);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [currentProjectUsage, setCurrentProjectUsage] = useState<any>(null);
  const [currentProjectCost, setCurrentProjectCost] = useState<number>(0);

  // Admin Dashboard State
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminProjects, setAdminProjects] = useState<Project[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [selectedAdminUser, setSelectedAdminUser] = useState<UserProfile | null>(null);

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
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'editor'>('chat');
  const [selectedElement, setSelectedElement] = useState<{ 
    tagName: string, 
    classes: string, 
    textContent?: string,
    rect?: { top: number, left: number, width: number, height: number } 
  } | null>(null);
  const [builderHtml, setBuilderHtml] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);

  // Multi-page state system
  const [pages, setPages] = useState<{ name: string; html: string }[]>([
    { name: 'Home', html: '' }
  ]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  
  // Track active index in a Ref to safeguard event listener captures
  const activePageIndexRef = useRef(0);
  useEffect(() => {
    activePageIndexRef.current = activePageIndex;
  }, [activePageIndex]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UI_EDITED' && event.data.html) {
        const newHtml = event.data.html;
        setBuilderHtml(newHtml);
        setPages(prev => prev.map((p, idx) => 
          idx === activePageIndexRef.current ? { ...p, html: newHtml } : p
        ));
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
    
    // Post back to iframe
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'UPDATE_CLASSES', classes: newClasses }, '*');
    }
  };

  const handleUpdateText = (newText: string) => {
    if (!selectedElement) return;
    setSelectedElement(prev => prev ? { ...prev, textContent: newText } : null);
    
    // Post back to iframe
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'UPDATE_TEXT', text: newText }, '*');
    }
  };

  const parseHexColor = (classes: string, type: 'bg' | 'text' | 'border'): string => {
    // Search for explicit custom style wrapper [color] (e.g., bg-[#ff00bb] or text-[#123123])
    const regex = new RegExp(`${type}-\\[(#[a-fA-F0-9]{3,8}|[^]]+)\\]`);
    const match = classes.match(regex);
    if (match) {
      return match[1];
    }
    
    // Fallback dictionary for common standard Tailwind color classes
    if (classes.includes(`${type}-transparent`)) return 'transparent';
    if (classes.includes(`${type}-black`)) return '#000000';
    if (classes.includes(`${type}-white`)) return '#ffffff';
    if (classes.includes(`${type}-zinc-900`)) return '#18181b';
    if (classes.includes(`${type}-zinc-800`)) return '#27272a';
    if (classes.includes(`${type}-zinc-700`)) return '#3f3f46';
    if (classes.includes(`${type}-zinc-600`)) return '#52525b';
    if (classes.includes(`${type}-zinc-500`)) return '#71717a';
    if (classes.includes(`${type}-zinc-400`)) return '#a1a1aa';
    if (classes.includes(`${type}-zinc-300`)) return '#d4d4d8';
    if (classes.includes(`${type}-emerald-500`)) return '#10b981';
    if (classes.includes(`${type}-blue-500`)) return '#3b82f6';
    if (classes.includes(`${type}-indigo-600`)) return '#4f46e5';
    if (classes.includes(`${type}-purple-600`)) return '#9333ea';
    if (classes.includes(`${type}-red-500`)) return '#ef4444';
    if (classes.includes(`${type}-amber-500`)) return '#f59e0b';
    
    return '';
  };

  const updateDynamicColor = (type: 'bg' | 'text' | 'border', hexOrUtil: string) => {
    if (!selectedElement) return;
    let currentClasses = selectedElement.classes.split(' ').filter(c => c.trim().length > 0);
    
    // Clear out standard patterns for background, text, or border classes
    const pfxs = [`${type}-`, `hover:${type}-`, `focus:${type}-`];
    currentClasses = currentClasses.filter(c => !pfxs.some(p => c.startsWith(p)));
    
    if (hexOrUtil) {
      if (hexOrUtil.startsWith('#') || hexOrUtil.startsWith('rgb') || hexOrUtil.startsWith('hsl')) {
        currentClasses.push(`${type}-[${hexOrUtil}]`);
      } else {
        currentClasses.push(`${type}-${hexOrUtil}`);
      }
    }
    
    handleUpdateClasses(currentClasses.join(' '));
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
    try {
      const result = await generateUIVariants(prompt);
      const generatedVariants = result.data;
      const usage = result.usage;
      const cost = calculateCost(usage);
      
      setVariants(generatedVariants);
      setCurrentVariantIndex(0);
      setCurrentProjectUsage(usage);
      setCurrentProjectCost(cost);
      
      if (user) {
        try {
          const projectData: Omit<Project, 'id'> = {
            userId: user.uid,
            prompt,
            questions: [],
            answers: [],
            variants: generatedVariants,
            createdAt: new Date().toISOString(),
            usage,
            cost
          };
          await addDoc(collection(db, 'projects'), projectData);
          await refreshLimits(user);
        } catch (dbError) {
          handleFirestoreError(dbError, OperationType.CREATE, 'projects');
        }
      }

      setView(AppView.PREVIEW);
    } catch (error: any) {
      console.error(error);
      if (error?.isApiKeyRestricted || error?.message?.includes('API_KEY_RESTRICTED') || error?.message?.includes('API key')) {
        setApiKeyErrorDetails(error.message || 'Restricted Key Error');
      } else {
        alert("Failed to generate UI: " + (error?.message || "Unknown error"));
      }
      setView(AppView.LANDING);
    } finally {
      setIsGeneratingUI(false);
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
          <img src="/logo.jpeg" alt="TheDesignAI Logo" className="w-10 h-10 rounded-xl shadow-lg border border-white/10" />
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
          className="w-full max-w-3xl flex flex-col items-center"
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
        </motion.form>
      </main>
    </div>
  );

  const renderGenerating = () => (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Logo Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-center z-50 animate-pulse">
        <div className="flex items-center gap-3 bg-white/5 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
          <img src="/logo.jpeg" alt="Logo" className="w-6 h-6 rounded-lg shadow-2xl" />
          <span className="font-bold text-sm tracking-tighter">TheDesignAI</span>
        </div>
      </div>

      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 180, 270, 360],
            borderRadius: ["20%", "50%", "20%"]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-96 h-96 bg-gradient-to-tr from-purple-600/20 via-blue-600/20 to-emerald-600/20 blur-[80px]" 
        />
      </div>
      <div className="z-10 flex flex-col items-center text-center">
        <div className="relative w-24 h-24 mb-12 flex items-center justify-center">
          <div className="absolute inset-0 border-t-2 border-l-2 border-white rounded-full animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-2 border-r-2 border-b-2 border-blue-400 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          <Sparkles className="w-8 h-8 text-white animate-pulse" />
        </div>
        <h2 className="text-5xl font-black tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
          Synthesizing Reality
        </h2>
        <p className="text-zinc-400 text-xl max-w-lg font-light">
          Processing your prompt and answers to construct 3 distinct, production-ready interfaces...
        </p>
      </div>
    </div>
  );

  const renderPreview = () => {
    if (variants.length === 0) return null;
    const currentVariant = variants[currentVariantIndex];

    return (
      <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden relative">
        <header className="h-16 px-6 flex items-center justify-between bg-black/50 backdrop-blur-md z-50 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg" />
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
                  setPages([{ name: 'Home', html: currentVariant.html }]);
                  setActivePageIndex(0);
                  setBuilderHtml(currentVariant.html);
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

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatGenerating) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsChatGenerating(true);
    
    try {
      const result = await modifyUI(builderHtml, userMsg);
      // Update HTML content
      setBuilderHtml(result.html);
      
      // Update the active page's html in our page system!
      setPages(prev => prev.map((p, idx) => 
        idx === activePageIndex ? { ...p, html: result.html } : p
      ));

      // Append AI Reasoning to chat interaction log
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: result.reasoning }]);
    } catch (error: any) {
      console.error(error);
      if (error?.isApiKeyRestricted || error?.message?.includes('API_KEY_RESTRICTED') || error?.message?.includes('API key')) {
        setApiKeyErrorDetails(error.message || 'Restricted Key Error');
        setChatMessages(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'ai', 
          content: `⚠️ **API Key Restriction Detected**\n\nYour Gemini API Key is restricted to "Agent Platform (Vertex) API" only in the Google Cloud Console. Standard Gemini operations require the "Generative Language API" to be enabled.\n\n*Click the popping credentials instructions modal or troubleshoot using the button to solve this issue.*` 
        }]);
      } else {
        setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: `Sorry, I encountered an error while updating the design: ${error?.message || "Unknown error"}` }]);
      }
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
              <img src="/logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg" />
              <span className="font-bold tracking-tighter text-[15px] hidden sm:block">TheDesignAI</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <button 
              onClick={() => setView(AppView.PREVIEW)}
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Variants
            </button>
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

      {/* Modern Dual-Tab Sidebar */}
      <div id="chat-sidebar" className="w-96 border-l border-white/10 bg-[#0a0a0a] flex flex-col h-full shrink-0 relative">
        {/* Sleek Dual Tab Headers */}
        <div className="flex border-b border-white/10 bg-black/40">
          <button
            onClick={() => setSidebarTab('chat')}
            className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'chat' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Assistant
          </button>
          
          <button
            onClick={() => {
              if (isManualEditing) {
                setSidebarTab('editor');
              } else {
                // Instantly activate manual edit mode when switching tabs
                if (!isPro && totalGenerations >= 6) {
                  setShowUpgradeModal(true);
                } else {
                  setIsManualEditing(true);
                  setSidebarTab('editor');
                }
              }
            }}
            className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'editor' ? 'border-emerald-500 text-white bg-white/[0.02]' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Manual Editor
          </button>
        </div>
        
        {/* Lock Overlay for Free tier >= 6 generations */}
        {!isPro && totalGenerations >= 6 ? (
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
        ) : (
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
                  <div className="border-t border-white/5 pt-4">
                     <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Graphical Styling Panel</h4>
                  </div>

                  {/* Category: Padding/Spacing */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Padding Spacing</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'None', val: '' },
                        { label: 'Sm', val: 'p-2' },
                        { label: 'Md', val: 'p-4' },
                        { label: 'Lg', val: 'p-6' },
                        { label: 'XL', val: 'p-8' },
                        { label: 'Inline Pill', val: 'px-4 py-2' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val) && item.val !== '';
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['p-', 'px-', 'py-'], item.val)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-450 hover:bg-white/10 hover:text-white'}`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Category: Dynamic Color Palette & Color Wheel */}
                  <div className="space-y-4 border-t border-white/5 pt-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">Dynamic Element Palette</span>
                    
                    <div className="grid grid-cols-1 gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                      {/* Sub-item: Background Color */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-5 h-5 rounded-full border border-white/10 shadow-sm transition-transform hover:scale-110 cursor-pointer"
                            style={{ backgroundColor: parseHexColor(selectedElement.classes, 'bg') || 'transparent' }}
                            title="Current Background"
                          />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-300">Background</span>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase">
                              {parseHexColor(selectedElement.classes, 'bg') || 'Not Set'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 justify-end">
                          {/* Color Wheel Selector */}
                          <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-colors bg-white/5 flex items-center justify-center cursor-pointer">
                            <input 
                              type="color" 
                              value={parseHexColor(selectedElement.classes, 'bg').startsWith('#') ? parseHexColor(selectedElement.classes, 'bg') : '#000000'}
                              onChange={(e) => updateDynamicColor('bg', e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                            />
                            <Palette className="w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                          </div>
                          {/* Hex text input */}
                          <input 
                            type="text"
                            placeholder="#000000"
                            value={parseHexColor(selectedElement.classes, 'bg')}
                            onChange={(e) => updateDynamicColor('bg', e.target.value)}
                            className="w-20 bg-black/60 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-center text-emerald-400 focus:outline-none focus:border-emerald-500/40"
                          />
                        </div>
                      </div>

                      {/* Sub-item: Text Color */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-5 h-5 rounded-full border border-white/10 shadow-sm transition-transform hover:scale-110 cursor-pointer"
                            style={{ backgroundColor: parseHexColor(selectedElement.classes, 'text') || 'transparent' }}
                            title="Current Text"
                          />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-300 font-sans">Text Color</span>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase">
                              {parseHexColor(selectedElement.classes, 'text') || 'Not Set'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 justify-end">
                          {/* Color Wheel Selector */}
                          <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-colors bg-white/5 flex items-center justify-center cursor-pointer">
                            <input 
                              type="color" 
                              value={parseHexColor(selectedElement.classes, 'text').startsWith('#') ? parseHexColor(selectedElement.classes, 'text') : '#ffffff'}
                              onChange={(e) => updateDynamicColor('text', e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                            />
                            <Palette className="w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                          </div>
                          {/* Hex text input */}
                          <input 
                            type="text"
                            placeholder="#ffffff"
                            value={parseHexColor(selectedElement.classes, 'text')}
                            onChange={(e) => updateDynamicColor('text', e.target.value)}
                            className="w-20 bg-black/60 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-center text-emerald-400 focus:outline-none focus:border-emerald-500/40"
                          />
                        </div>
                      </div>

                      {/* Sub-item: Border Color */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-5 h-5 rounded-full border border-white/10 shadow-sm transition-transform hover:scale-110 cursor-pointer"
                            style={{ backgroundColor: parseHexColor(selectedElement.classes, 'border') || 'transparent' }}
                            title="Current Border"
                          />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-300">Border Color</span>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase">
                              {parseHexColor(selectedElement.classes, 'border') || 'Not Set'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 justify-end">
                          {/* Color Wheel Selector */}
                          <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-colors bg-white/5 flex items-center justify-center cursor-pointer">
                            <input 
                              type="color" 
                              value={parseHexColor(selectedElement.classes, 'border').startsWith('#') ? parseHexColor(selectedElement.classes, 'border') : '#ffffff'}
                              onChange={(e) => updateDynamicColor('border', e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                            />
                            <Palette className="w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                          </div>
                          {/* Hex text input */}
                          <input 
                            type="text"
                            placeholder="#ffffff"
                            value={parseHexColor(selectedElement.classes, 'border')}
                            onChange={(e) => updateDynamicColor('border', e.target.value)}
                            className="w-20 bg-black/60 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-center text-emerald-400 focus:outline-none focus:border-emerald-500/40"
                          />
                        </div>
                      </div>

                      {/* Brand Quick Palettes presets list */}
                      <div className="border-t border-white/5 pt-3 mt-1 space-y-2">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Palette Presets (Branding)</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { name: 'Pure Dark', bg: '#09090b', text: '#ffffff', bdr: '#27272a' },
                            { name: 'Cyber Neon', bg: '#030712', text: '#34d399', bdr: '#059669' },
                            { name: 'Warm Amber', bg: '#1c1917', text: '#fcd34d', bdr: '#d97706' },
                            { name: 'Clean Light', bg: '#ffffff', text: '#09090b', bdr: '#cbd5e1' },
                            { name: 'Nordic Snow', bg: '#f8fafc', text: '#0f172a', bdr: '#cbd5e1' },
                            { name: 'Indigo Core', bg: '#eff6ff', text: '#2563eb', bdr: '#3b82f6' }
                          ].map(preset => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => {
                                updateDynamicColor('bg', preset.bg);
                                updateDynamicColor('text', preset.text);
                                updateDynamicColor('border', preset.bdr);
                              }}
                              className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-[9px] font-mono text-zinc-400 cursor-pointer hover:text-white flex items-center gap-1"
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: preset.bg }} />
                              <span>{preset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Category: Border Radius */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Corner Rounding</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Sharp Corner', val: 'rounded-none' },
                        { label: 'Small', val: 'rounded-md' },
                        { label: 'Medium', val: 'rounded-xl' },
                        { label: 'Super Round', val: 'rounded-3xl' },
                        { label: 'Circular Pill', val: 'rounded-full' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val);
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['rounded-'], item.val)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-455 hover:bg-white/10 hover:text-white'}`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Alignment */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Text Alignment</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Align Left', val: 'text-left' },
                        { label: 'Align Center', val: 'text-center' },
                        { label: 'Align Right', val: 'text-right' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val);
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['text-left', 'text-center', 'text-right'], item.val)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-455 hover:bg-white/10 hover:text-white'}`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category: Layout Mode */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Flex Container Controls</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Block (Default)', val: 'block' },
                        { label: 'Flex Column', val: 'flex flex-col gap-4' },
                        { label: 'Flex Row (Align Center)', val: 'flex flex-row items-center gap-2' },
                        { label: 'Centered Flex', val: 'flex items-center justify-center' }
                      ].map(item => {
                        const isCurrent = selectedElement.classes.includes(item.val.split(' ')[0]);
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyStyleClass(['flex', 'flex-col', 'flex-row', 'items-center', 'justify-center', 'block'], item.val)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${isCurrent ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/5 text-zinc-455 hover:bg-white/10 hover:text-white'}`}
                          >
                            {item.label}
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
            <img src="/logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg" />
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

        {/* Project History */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <History className="w-6 h-6 text-emerald-400" />
            <h3 className="text-2xl font-semibold">Your Projects</h3>
          </div>

          {isLoadingProjects ? (
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
          )}
        </div>
      </main>
    </div>
  );

  const renderAdmin = () => {
    // 1. Calculations
    const totalUsers = adminUsers.length;
    
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

    // Group stats by user id
    const userStats: Record<string, { projectsCount: number; cost: number; promptTokens: number; candidatesTokens: number; totalTokens: number }> = {};
    adminUsers.forEach(u => {
      userStats[u.uid] = { projectsCount: 0, cost: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    });
    adminProjects.forEach(p => {
      if (!userStats[p.userId]) {
        userStats[p.userId] = { projectsCount: 0, cost: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
      }
      userStats[p.userId].projectsCount += 1;
      userStats[p.userId].cost += (p.cost || 0);
      userStats[p.userId].promptTokens += (p.usage?.promptTokenCount || 0);
      userStats[p.userId].candidatesTokens += (p.usage?.candidatesTokenCount || 0);
      userStats[p.userId].totalTokens += (p.usage?.totalTokenCount || 0);
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
              <img src="/logo.jpeg" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg" />
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tighter leading-none">Console</span>
                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest leading-none mt-1">Admin Dashboard</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
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
              {/* Telemetry Bento Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                
                {/* 1. Cost */}
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Coins className="w-16 h-16 text-emerald-400" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono block mb-2">Total Api Cost</span>
                  <div className="text-3xl md:text-4xl font-black text-emerald-400 tracking-tight font-mono leading-none">
                    ${totalCost.toFixed(3)}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-3">Calculated from model prices</span>
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
                    {(totalTokens / 1000).toFixed(0)}k
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-3 flex justify-between">
                    <span>In: {(totalPrompt / 1000).toFixed(0)}k</span>
                    <span>Out: {(totalCandidates / 1000).toFixed(0)}k</span>
                  </div>
                </div>

              </div>

              {/* User management and Detail Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Admin Users Table (Col span 12 or 7 if a user is selected) */}
                <div className={`bg-zinc-950/25 border border-white/5 rounded-3xl p-6 backdrop-blur-md overflow-hidden transition-all duration-300 ${selectedAdminUser ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
                  <div className="flex items-center justify-between mb-6 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-zinc-400" />
                      <h3 className="text-lg font-bold">User API Usage Records</h3>
                    </div>
                    <span className="text-xs bg-white/5 px-2.5 py-1 rounded-full text-zinc-400 font-mono">
                      {adminUsers.length} Users Found
                    </span>
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
                        {adminUsers.map(userItem => {
                          const stats = userStats[userItem.uid] || { projectsCount: 0, cost: 0, totalTokens: 0 };
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

                              <td className="py-4 pr-4 text-right font-mono font-bold text-zinc-300">
                                {stats.projectsCount}
                              </td>

                              <td className="py-4 pr-4 text-right">
                                <span className="font-mono text-emerald-400 block font-bold text-sm">
                                  ${stats.cost.toFixed(4)}
                                </span>
                                <span className="text-[10px] text-zinc-500 block font-mono">
                                  {(stats.totalTokens / 1000).toFixed(0)}k tkns
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
                        <span className="text-[9px] text-zinc-505 uppercase font-mono block">Total Projects</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{selectedUserProjects.length}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-505 uppercase font-mono block font-bold">Sum Incurred</span>
                        <span className="text-sm font-black font-mono text-emerald-400">
                          ${(userStats[selectedAdminUser.uid]?.cost || 0).toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-505 uppercase font-mono block">Total Tokens</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">
                          {((userStats[selectedAdminUser.uid]?.totalTokens || 0) / 1000).toFixed(0)}k
                        </span>
                      </div>
                    </div>

                    {/* Detailed Prompt entries list */}
                    <div className="flex flex-col gap-4">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Prompt & API Run Log History</h4>
                      
                      {selectedUserProjects.length === 0 ? (
                        <div className="text-center py-10 bg-black/20 rounded-2xl border border-white/5 text-zinc-505 text-sm">
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
                                    <span className="text-[9px] text-zinc-550 font-mono block mb-1">Prompt Query Run: {dateStr}</span>
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
                                    <span className="block text-[8px] uppercase text-zinc-500">Cost</span>
                                    <span className="text-emerald-400 font-bold">${costVal.toFixed(4)}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[8px] uppercase text-zinc-500">Tokens</span>
                                    <span className="text-zinc-300">{tPrompt + tCandidates} total</span>
                                  </div>
                                  <div>
                                    <span className="block text-[8px] uppercase text-zinc-500">Variants</span>
                                    <span className="text-zinc-300">{variantsCount} synthesized</span>
                                  </div>
                                </div>
                                <div className="text-[9px] text-zinc-600 font-mono text-right mt-1">
                                  In: {tPrompt} tkns / Out: {tCandidates} tkns
                                </div>
                              </div>
                            );
                          })}
                        </div>
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

        {apiKeyErrorDetails ? (
          <ApiKeyErrorModal 
            details={apiKeyErrorDetails}
            onClose={() => setApiKeyErrorDetails(null)}
          />
        ) : null}
      </AnimatePresence>

      {/* Global Branding Credit */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity pointer-events-none sm:pointer-events-auto">
        <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">TheDesignAI</span>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <img src="/logo.jpeg" alt="Logo" className="w-5 h-5 rounded-full" />
          <span className="text-[10px] font-bold tracking-tighter text-zinc-400">by Anqair</span>
        </div>
      </div>
    </div>
  );
};

export default App;
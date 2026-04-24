import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, Loader2, X, User as UserIcon, LogOut, History, Download, MessageSquare, Send } from 'lucide-react';
import { AppView, UIVariant, UserProfile, Project, ChatMessage, UsageMetadata, DesignSuggestion } from './types.ts';
import { generateFollowUpQuestions, generateUIVariants, modifyUI, generateDesignSuggestions } from './services/geminiService.ts';
import { UIPreview } from './components/UIPreview.tsx';
import { OnboardingTutorial } from './components/OnboardingTutorial.tsx';
import DottedGlowBackground from './components/DottedGlowBackground.tsx';
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

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

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
          
          const userData: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || undefined,
            photoURL: firebaseUser.photoURL || undefined,
            createdAt: userSnap.exists() ? userSnap.data().createdAt : new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          };

          await setDoc(userRef, userData, { merge: true });
          setUser(userData);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

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

  // Builder state
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ 
    tagName: string, 
    classes: string, 
    rect?: { top: number, left: number, width: number, height: number } 
  } | null>(null);
  const [builderHtml, setBuilderHtml] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UI_EDITED' && event.data.html) {
        setBuilderHtml(event.data.html);
      } else if (event.data?.type === 'ELEMENT_SELECTED') {
        setSelectedElement({
          tagName: event.data.tagName,
          classes: event.data.classes,
          rect: event.data.rect
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isManualEditing) {
      setSelectedElement(null);
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

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000000) * 0.075;
    const outputCost = (usage.candidatesTokenCount / 1000000) * 0.30;
    return inputCost + outputCost;
  };

  const handlePromptSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    
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
        } catch (dbError) {
          handleFirestoreError(dbError, OperationType.CREATE, 'projects');
        }
      }

      setView(AppView.PREVIEW);
    } catch (error) {
      console.error(error);
      alert("Failed to generate UI.");
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
        <div>
          {isAuthReady && (
            user ? (
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
      const updatedHtml = await modifyUI(builderHtml, userMsg);
      setBuilderHtml(updatedHtml);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: 'I have updated the design based on your request.' }]);
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
              onClick={() => setIsManualEditing(!isManualEditing)} 
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${isManualEditing ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}
            >
              {isManualEditing ? 'Done Editing' : 'Manual Edit'}
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
          
          {/* Floating Property Editor */}
          <AnimatePresence>
            {isManualEditing && selectedElement && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  top: selectedElement.rect 
                    ? Math.min(Math.max(20, selectedElement.rect.top), window.innerHeight - 400)
                    : 20,
                  left: selectedElement.rect 
                    ? (selectedElement.rect.left + selectedElement.rect.width + 340 < window.innerWidth - 384 // -384 is chat sidebar
                        ? selectedElement.rect.left + selectedElement.rect.width + 20
                        : Math.max(20, selectedElement.rect.left - 340))
                    : 'auto',
                  right: selectedElement.rect ? 'auto' : 20
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed w-80 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 z-[90]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                      {selectedElement.tagName}
                    </div>
                    <span className="text-xs font-medium text-white">Properties</span>
                  </div>
                  <button 
                    onClick={() => setSelectedElement(null)}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tailwind Classes</label>
                    <textarea
                      value={selectedElement.classes}
                      onChange={(e) => handleUpdateClasses(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-300 h-32 focus:outline-none focus:border-emerald-500/50 resize-none"
                      placeholder="p-4 bg-blue-500 rounded-lg..."
                    />
                  </div>
                  
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      Editing classes will immediately update the live design. You can also double-click text in the preview to edit it directly.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isManualEditing && !selectedElement && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-2 rounded-full text-xs font-bold shadow-xl pointer-events-none"
            >
              Select an element to edit its properties
            </motion.div>
          )}
        </div>
      </div>

      {/* Chat Sidebar */}
      <div id="chat-sidebar" className="w-96 border-l border-white/10 bg-[#0a0a0a] flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold">Design Assistant</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
              <div className="bg-white/10 text-zinc-200 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
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
              className="absolute right-2 w-8 h-8 flex items-center justify-center bg-emerald-500 text-black rounded-full disabled:opacity-50 disabled:bg-zinc-600 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
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
        <button 
          onClick={handleSignOut}
          className="flex items-center gap-2 text-zinc-400 hover:text-red-400 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
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
                      {project.cost !== undefined && (
                        <div className="text-[10px] font-mono text-emerald-400/80">
                          ${project.cost.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-black font-sans">
      {view === AppView.LANDING && renderLanding()}
      {view === AppView.GENERATING && renderGenerating()}
      {view === AppView.PREVIEW && renderPreview()}
      {view === AppView.BUILDER && renderBuilder()}
      {view === AppView.PROFILE && renderProfile()}

      {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}

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
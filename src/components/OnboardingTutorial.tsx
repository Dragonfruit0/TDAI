import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, Check } from 'lucide-react';

interface Step {
  targetId: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const steps: Step[] = [
  {
    targetId: '',
    title: 'Welcome to the Builder!',
    content: 'Now that you have a design, let\'s learn how to refine it and make it yours.',
    position: 'center'
  },
  {
    targetId: 'manual-edit-button',
    title: 'Manual Editing',
    content: 'Click this to enable direct editing. Once enabled, you can click on any element in the design to see and modify its code.',
    position: 'bottom'
  },
  {
    targetId: 'chat-sidebar',
    title: 'Design Assistant',
    content: 'Our AI assistant is here to help! Describe any changes you want to make, like "change the primary color to emerald" or "add a login section".',
    position: 'left'
  },
  {
    targetId: 'export-button',
    title: 'Export Your Work',
    content: 'Once you are happy with your design, export it as a clean, production-ready HTML file.',
    position: 'bottom'
  }
];

interface OnboardingTutorialProps {
  onComplete: () => void;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ onComplete }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [highlightPos, setHighlightPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const currentStep = steps[currentStepIndex];

  const updatePositions = () => {
    if (!currentStep.targetId) {
      setTooltipPos({ top: window.innerHeight / 2, left: window.innerWidth / 2 });
      setHighlightPos({ top: 0, left: 0, width: 0, height: 0 });
      return;
    }

    const element = document.getElementById(currentStep.targetId);
    if (element) {
      const rect = element.getBoundingClientRect();
      setHighlightPos({
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16
      });

      const gap = 20;
      let top = 0;
      let left = 0;

      switch (currentStep.position) {
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2;
          break;
        case 'top':
          top = rect.top - gap;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - gap;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + gap;
          break;
      }

      setTooltipPos({ top, left });
    }
  };

  useEffect(() => {
    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [currentStepIndex]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      onComplete();
    }
  };

  const getTooltipStyle = () => {
    if (currentStep.position === 'center') {
      return {
        transform: 'translate(-50%, -50%)',
        top: '50%',
        left: '50%'
      };
    }

    let transform = '';
    switch (currentStep.position) {
      case 'bottom': transform = 'translate(-50%, 0)'; break;
      case 'top': transform = 'translate(-50%, -100%)'; break;
      case 'left': transform = 'translate(-100%, -50%)'; break;
      case 'right': transform = 'translate(0, -50%)'; break;
    }

    return {
      top: tooltipPos.top,
      left: tooltipPos.left,
      transform
    };
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dim Overlay */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto"
      />

      {/* Highlight Hole */}
      <AnimatePresence>
        {currentStep.targetId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              top: highlightPos.top,
              left: highlightPos.left,
              width: highlightPos.width,
              height: highlightPos.height,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              borderRadius: '8px',
              border: '2px solid rgb(52 211 153)', // emerald-400
            }}
            className="pointer-events-none z-[101]"
          />
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <motion.div
        key={currentStepIndex}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        style={getTooltipStyle()}
        className="absolute w-[320px] bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl pointer-events-auto z-[102]"
      >
        <button 
          onClick={onComplete}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-4">
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
        </div>

        <h3 className="text-lg font-bold text-white mb-2">{currentStep.title}</h3>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">
          {currentStep.content}
        </p>

        <div className="flex justify-between items-center">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`w-1 h-1 rounded-full ${i === currentStepIndex ? 'bg-emerald-400 w-4' : 'bg-zinc-700'} transition-all`}
              />
            ))}
          </div>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors"
          >
            {currentStepIndex === steps.length - 1 ? (
              <>Got it <Check className="w-4 h-4" /></>
            ) : (
              <>Next <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

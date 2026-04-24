import React, { useMemo } from 'react';

interface DottedGlowBackgroundProps {
  gap?: number;
  radius?: number;
  color?: string;
  glowColor?: string;
  speedScale?: number;
}

const DottedGlowBackground: React.FC<DottedGlowBackgroundProps> = ({
  gap = 24,
  radius = 1.5,
  color = 'rgba(255, 255, 255, 0.05)',
  glowColor = 'rgba(255, 255, 255, 0.15)',
  speedScale = 0.5
}) => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div 
        className="absolute inset-0 opacity-20"
        style={{ 
          backgroundImage: `radial-gradient(${color} ${radius}px, transparent ${radius}px)`,
          backgroundSize: `${gap}px ${gap}px`
        }} 
      />
      {/* Dynamic Glow Entities */}
      <div className="absolute inset-0">
        <div 
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] mix-blend-screen animate-pulse"
          style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, animationDuration: `${8 / speedScale}s` }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[120px] mix-blend-screen animate-pulse"
          style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, animationDuration: `${12 / speedScale}s`, animationDelay: '2s' }}
        />
      </div>
    </div>
  );
};

export default DottedGlowBackground;


import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { Button } from './Button';

interface ProjectNamingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  defaultName: string;
}

export const ProjectNamingModal: React.FC<ProjectNamingModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm,
  defaultName 
}) => {
  const [name, setName] = useState(defaultName);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0f0f0f] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center mb-6 border border-zinc-800">
            <FolderPlus className="w-6 h-6 text-blue-500" />
          </div>

          <h2 className="text-2xl font-bold mb-2">Name your project</h2>
          <p className="text-zinc-400 mb-8">
            Give your project a name to keep your studio organized.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., E-commerce Redesign"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            <Button type="submit" className="w-full h-12" disabled={!name.trim()}>
              Create & Generate
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

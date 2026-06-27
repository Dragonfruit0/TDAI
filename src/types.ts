
export enum AppView {
  LANDING = 'LANDING',
  GENERATING = 'GENERATING',
  PREVIEW = 'PREVIEW',
  PROFILE = 'PROFILE',
  BUILDER = 'BUILDER',
  ADMIN = 'ADMIN'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export interface UIVariant {
  id: string;
  label: string;
  html: string;
  description: string;
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface DesignSuggestion {
  id: string;
  title: string;
  description: string;
  action: string;
}

export interface Project {
  id: string;
  userId: string;
  prompt: string;
  questions?: string[];
  answers?: string[];
  variants: UIVariant[];
  createdAt: string;
  usage?: UsageMetadata;
  cost?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt?: string;
  subscription?: {
    status: string;
    plan: string;
    billingCycle?: string;
    createdAt?: string;
  };
}

export interface SavedDesign {
  id: string;
  userId: string;
  name: string;
  html: string;
  parentPrompt: string;
  createdAt: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  name: string;
  html: string;
  createdAt: string;
}

export interface ColorSwatch {
  role: 'primary' | 'accent' | 'background' | 'surface' | 'text';
  hex: string;
}

export interface ColorPalette {
  id?: string;
  name: string;
  colors: ColorSwatch[];
  swatches?: ColorSwatch[];
}



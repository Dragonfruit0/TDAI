import { Zap, Layout, Code } from 'lucide-react';

export const COLORS = {
  primary: '#ffffff',
  secondary: '#a1a1aa',
  accent: '#3b82f6',
  bg: '#050505',
  card: '#0f0f0f',
  border: '#27272a'
};

export const PRICING_PLANS = [
  {
    name: 'Free',
    price: '₹0',
    description: 'Perfect for exploring the possibilities',
    features: ['1 Free Flash', '3 UI Variations per Flash', 'Export HTML/CSS'],
    cta: 'Current Plan',
    highlighted: false
  },
  {
    name: 'Pay-as-you-go',
    price: '₹10',
    description: '3 More Flashes instantly',
    features: ['3 Credits', 'Lifetime Validity', 'Full Export Support'],
    cta: 'Buy Now',
    highlighted: true
  },
  {
    name: 'Pro Subscription',
    price: '₹499/mo',
    description: 'For power users needing speed',
    features: ['10 Flashes daily', 'Priority GPU', 'React Export (Beta)', 'Private History'],
    cta: 'Subscribe',
    highlighted: false
  }
];

export const FEATURES = [
  {
    icon: Zap,
    iconColor: 'text-blue-500',
    title: "Prompt your idea",
    desc: "Describe any UI component or landing page section in plain English."
  },
  {
    icon: Layout,
    iconColor: 'text-purple-500',
    title: "Generate 3 directions",
    desc: "Our engine crafts three distinct visual styles for every single prompt."
  },
  {
    icon: Code,
    iconColor: 'text-emerald-500',
    title: "Export ready code",
    desc: "Clean, production-ready Tailwind HTML ready to drop into your project."
  }
];
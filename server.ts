import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

import fs from 'fs';
import { 
  generateFollowUpQuestionsServer, 
  generateUIVariantsServer, 
  modifyUIServer, 
  modifyUIServerStream,
  generateDesignSuggestionsServer,
  generateSingleUIVariantServer,
  generatePaletteServer
} from './server/aiService.ts';

let adminDb: any = null;
let firebaseConfig: any = null;
let firebaseInitialized = false;

function getFirebaseAdmin() {
  if (!firebaseInitialized) {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
        adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);
        firebaseInitialized = true;
      } catch (err) {
        console.error("Failed to parse firebase-applet-config.json:", err);
      }
    } else {
      console.warn("firebase-applet-config.json is missing! Firebase Admin functions will fail. Using mock user for development.");
    }
  }
  return { adminDb, firebaseConfig, initialized: firebaseInitialized };
}

const app = express();
const PORT = 3000;

// Lazy initialize Stripe instance to prevent backend crashes when secret key is unset on boot
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key, {
      apiVersion: '2025-01-27.accredited' as any,
    });
  }
  return stripeClient;
}

// Special raw body parser for Stripe secure signature verification
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    res.status(400).send('Webhook Error: Missing Stripe Signature header.');
    return;
  }

  try {
    const stripe = getStripe();
    let event: Stripe.Event;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not configured. Webhook processing aborted for security.');
    }
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);

    console.log(`Received webhook event: ${event.type}`);

    // Handle payment success event of Stripe subscriptions
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      
      if (userId) {
        console.log(`Stripe subscription checkout succeeded for user: ${userId}`);
        const { adminDb: dbInstance } = getFirebaseAdmin();
        if (dbInstance) {
          const userRef = dbInstance.collection('users').doc(userId);
          
          await userRef.set({
            subscription: {
              status: 'active',
              plan: 'Pro',
              billingCycle: 'monthly',
              createdAt: new Date().toISOString(),
              stripeSessionId: session.id,
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null
            }
          }, { merge: true });

          console.log(`User ${userId} upgraded to Pro in Firestore successfully.`);
        } else {
          console.warn('Firebase Admin not initialized, skipping Stripe user status sync.');
        }
      } else {
        console.warn('Missing client_reference_id (userId) in checkout session.');
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// CORS configuration with known origin allowlist & dynamic developer previews
const ALLOWED_ORIGINS = [
  'https://thedesignai.com',
  'https://www.thedesignai.com',
  'https://tdai-y9rj.onrender.com',
  'http://localhost:3000'
];

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else if (process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Title');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON body parser for normal API routes
app.use(express.json());

// Firebase ID Token Verification Middleware
async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const { initialized } = getFirebaseAdmin();
  
  if (!initialized) {
    // Graceful fallback for development when config is missing
    req.user = { uid: 'dev-user', email: 'thedesignai3@gmail.com' };
    next();
    return;
  }

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
    return;
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
}

// Usage Limits verification for Free tier on the server-side
async function checkUsageLimits(req: any, res: any, next: any) {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  
  if (userEmail === 'thedesignai3@gmail.com') {
    next();
    return;
  }
  
  try {
    const { adminDb: dbInstance } = getFirebaseAdmin();
    if (!dbInstance) {
      // If db is not initialized, we let it pass in dev
      next();
      return;
    }
    const userDoc = await dbInstance.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isPro = userData?.subscription?.status === 'active';
    
    if (isPro) {
      next();
      return;
    }
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayIso = startOfToday.toISOString();
    
    const projectsSnap = await dbInstance.collection('projects')
      .where('userId', '==', userId)
      .where('createdAt', '>=', startOfTodayIso)
      .get();
      
    if (projectsSnap.size >= 3) {
      res.status(429).json({
        error: 'Usage limit reached: Free tier is limited to 3 generations per day. Please upgrade to Pro to continue.',
        limitReached: true
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error checking usage limits on server:', error);
    next();
  }
}

// Server-side input size limits for HTML payload safety
const MAX_HTML_SIZE = 50_000; // 50KB maximum size to prevent excessive payload injection
function validateHtmlSize(req: any, res: any, next: any) {
  const { currentHtml } = req.body;
  if (currentHtml && currentHtml.length > MAX_HTML_SIZE) {
    res.status(400).json({ error: 'HTML payload is too large. Maximum size is 50KB.' });
    return;
  }
  next();
}

// API rate limit implementation for all AI-powered routes
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per IP address
  message: { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Secure proxy endpoints for model generations
app.post('/api/ai/follow-up', aiRateLimiter, requireAuth, checkUsageLimits, async (req, res) => {
  const { prompt, preferred } = req.body;
  try {
    const result = await generateFollowUpQuestionsServer(prompt, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/follow-up:', error);
    res.status(500).json({ error: 'An error occurred while generating follow-up questions.' });
  }
});

app.post('/api/ai/ui-variants', aiRateLimiter, requireAuth, checkUsageLimits, async (req, res) => {
  const { prompt, questions, answers, preferred, referenceImage } = req.body;
  try {
    if (referenceImage) {
      const MAX_BASE64 = 7 * 1024 * 1024; // ~5MB file → ~7MB base64
      if (typeof referenceImage.base64 !== 'string' || referenceImage.base64.length > MAX_BASE64) {
        res.status(400).json({ error: 'Image too large or invalid.' });
        return;
      }
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!ALLOWED_MIMES.includes(referenceImage.mimeType)) {
        res.status(400).json({ error: 'Unsupported image type.' });
        return;
      }
    }
    const result = await generateUIVariantsServer(prompt, questions, answers, preferred, referenceImage);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/ui-variants:', error);
    res.status(500).json({ error: 'An error occurred while generating UI variants.' });
  }
});

app.post('/api/ai/ui-variant-single', aiRateLimiter, requireAuth, checkUsageLimits, async (req, res) => {
  const { prompt, questions, answers, variantIndex, preferred, referenceImage } = req.body;
  try {
    if (referenceImage) {
      const MAX_BASE64 = 7 * 1024 * 1024; // ~5MB file → ~7MB base64
      if (typeof referenceImage.base64 !== 'string' || referenceImage.base64.length > MAX_BASE64) {
        res.status(400).json({ error: 'Image too large or invalid.' });
        return;
      }
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!ALLOWED_MIMES.includes(referenceImage.mimeType)) {
        res.status(400).json({ error: 'Unsupported image type.' });
        return;
      }
    }
    const result = await generateSingleUIVariantServer(prompt, questions, answers, preferred, Number(variantIndex), referenceImage);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/ui-variant-single:', error);
    res.status(500).json({ error: 'An error occurred while generating this variant.' });
  }
});

app.post('/api/ai/generate-palette', aiRateLimiter, requireAuth, validateHtmlSize, async (req, res) => {
  const { currentHtml } = req.body;
  try {
    const result = await generatePaletteServer(currentHtml);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/generate-palette:', error);
    res.status(500).json({ error: 'An error occurred while generating the palette.' });
  }
});

app.post('/api/ai/modify-ui', aiRateLimiter, requireAuth, checkUsageLimits, validateHtmlSize, async (req, res) => {
  const { currentHtml, prompt, preferred, stream } = req.body;
  try {
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      await modifyUIServerStream(currentHtml, prompt, preferred, (chunk, usage) => {
        const payload = { chunk, ...(usage ? { usage } : {}) };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      });

      res.write(`data: [DONE]\n\n`);
      res.end();
    } else {
      const result = await modifyUIServer(currentHtml, prompt, preferred);
      res.json(result);
    }
  } catch (error: any) {
    console.error('Error in /api/ai/modify-ui:', error);
    if (stream) {
      res.write(`data: ${JSON.stringify({ error: 'An error occurred while modifying the UI.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'An error occurred while modifying the UI.' });
    }
  }
});

app.post('/api/ai/suggestions', aiRateLimiter, requireAuth, checkUsageLimits, validateHtmlSize, async (req, res) => {
  const { currentHtml, preferred } = req.body;
  try {
    const result = await generateDesignSuggestionsServer(currentHtml, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/suggestions:', error);
    res.status(500).json({ error: 'An error occurred while generating design suggestions.' });
  }
});

// API route to create a checkout session
app.post('/api/stripe/create-checkout-session', requireAuth, async (req, res) => {
  const { userId, userEmail, appUrl } = req.body;

  // Prevent user spoofing: verify request uid matches userId
  if ((req as any).user.uid !== userId) {
    res.status(403).json({ error: 'Forbidden: You cannot create a session for another user.' });
    return;
  }

  if (!userId) {
    res.status(400).json({ error: 'Missing userId parameter' });
    return;
  }

  try {
    const stripe = getStripe();
    
    // Validate redirect URL to prevent open redirect vulnerabilities
    let baseUrl = appUrl || process.env.APP_URL || 'http://localhost:3000';
    try {
      const parsedUrl = new URL(baseUrl);
      if (!isOriginAllowed(parsedUrl.origin)) {
        console.warn(`Unsafe appUrl provided: ${baseUrl}. Falling back to default URL.`);
        baseUrl = process.env.APP_URL || 'http://localhost:3000';
      }
    } catch {
      baseUrl = process.env.APP_URL || 'http://localhost:3000';
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'TheDesignAI Pro Plan',
              description: 'Unlock unlimited design generations, real-time AI Design Co-Pilot, and manual Tailwind code edits.',
            },
            unit_amount: 1400, // $14 USD
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      client_reference_id: userId,
      customer_email: userEmail || undefined,
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}&checkout_success=true`,
      cancel_url: `${baseUrl}?checkout_cancelled=true`,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync endpoint to look up live Firebase/Stripe profile status
app.get('/api/stripe/status/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  // Verify ownership to prevent unauthorized data leaks (Issue 7)
  if ((req as any).user.uid !== userId && (req as any).user.email !== 'thedesignai3@gmail.com') {
    res.status(403).json({ error: 'Forbidden: You do not have permission to access this user\'s billing status.' });
    return;
  }

  try {
    const { adminDb: dbInstance } = getFirebaseAdmin();
    if (!dbInstance) {
      res.json({ active: true, plan: 'Pro', subscription: { status: 'active', plan: 'Pro' } });
      return;
    }
    const userDoc = await dbInstance.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      res.json({ active: false, plan: 'Free' });
      return;
    }
    const data = userDoc.data();
    const isPro = data?.subscription?.status === 'active';
    res.json({ active: isPro, subscription: data?.subscription || null });
  } catch (error: any) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription status.' });
  }
});

async function startServer() {
  const vite = process.env.NODE_ENV !== 'production'
    ? await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    : null;

  // Serve Vite pages in development, compiled build output assets in production
  if (vite) {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000 as required on the container structure
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on Port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start full-stack server:', err);
});

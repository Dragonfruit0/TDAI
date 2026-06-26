import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { 
  generateFollowUpQuestionsServer, 
  generateUIVariantsServer, 
  modifyUIServer, 
  generateDesignSuggestionsServer 
} from './server/aiService.ts';

// Initialize Firebase Admin using credentials present in the sandbox
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

initializeApp({
  projectId: firebaseConfig.projectId,
});

// Target the specific dynamic firestore database ID
const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);

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

    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
    } else {
      console.warn('Warning: STRIPE_WEBHOOK_SECRET is not configured. Webhook payload integrity is not verified.');
      event = JSON.parse(req.body.toString());
    }

    console.log(`Received webhook event: ${event.type}`);

    // Handle payment success event of Stripe subscriptions
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      
      if (userId) {
        console.log(`Stripe subscription checkout succeeded for user: ${userId}`);
        const userRef = adminDb.collection('users').doc(userId);
        
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
        console.warn('Missing client_reference_id (userId) in checkout session.');
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// JSON body parser for other normal API routes
app.use(express.json());

// Secure proxy endpoints for model generations
app.post('/api/ai/follow-up', async (req, res) => {
  const { prompt, preferred } = req.body;
  try {
    const result = await generateFollowUpQuestionsServer(prompt, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/follow-up:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/ui-variants', async (req, res) => {
  const { prompt, questions, answers, preferred } = req.body;
  try {
    const result = await generateUIVariantsServer(prompt, questions, answers, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/ui-variants:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/modify-ui', async (req, res) => {
  const { currentHtml, prompt, preferred } = req.body;
  try {
    const result = await modifyUIServer(currentHtml, prompt, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/modify-ui:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/suggestions', async (req, res) => {
  const { currentHtml, preferred } = req.body;
  try {
    const result = await generateDesignSuggestionsServer(currentHtml, preferred);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

// API route to create a checkout session
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  const { userId, userEmail, appUrl } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'Missing userId parameter' });
    return;
  }

  try {
    const stripe = getStripe();
    
    // Use user-provided app url or fallback to container configuration
    const baseUrl = appUrl || process.env.APP_URL || 'http://localhost:3000';

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
app.get('/api/stripe/status/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      res.json({ active: false, plan: 'Free' });
      return;
    }
    const data = userDoc.data();
    const isPro = data?.subscription?.status === 'active';
    res.json({ active: isPro, subscription: data?.subscription || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

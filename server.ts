import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

// Load environment variables
dotenv.config();

// Lazy initialize Gemini AI client
let aiInstance: GoogleGenAI | null = null;
function getGeminiAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

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

// Helper function to handle and map Gemini API/Key errors gracefully
function handleGeminiError(err: any, res: express.Response, label: string) {
  console.error(`${label} Error:`, err);
  const errMsg = err.message || String(err);
  
  if (
    errMsg.includes('API key not valid') || 
    errMsg.includes('API_KEY_INVALID') || 
    errMsg.includes('API key') ||
    errMsg.includes('INVALID_ARGUMENT') ||
    errMsg.includes('ApiError') ||
    errMsg.includes('Forbidden') ||
    errMsg.includes('403') ||
    errMsg.includes('400')
  ) {
    res.status(200).json({ 
      error: 'API_KEY_RESTRICTED',
      details: 'Your Gemini API Key is restricted to "Agent Platform (Vertex) API" only in the Google Cloud Console. To fix this: Go to GCP Console > APIs & Services > Credentials > Edit your API key > Scroll to API restrictions > Choose "Don\'t restrict key" or check both "Generative Language API" and "Agent Platform API", then click Save.'
    });
    return;
  }
  
  res.status(200).json({ error: errMsg });
}

// Gemini Endpoint: Clarifying Questions
app.post('/api/gemini/questions', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt parameter' });
    return;
  }
  try {
    const ai = getGeminiAI();
    const systemInstruction = `
      You are an expert product manager and UX researcher.
      The user wants to build a design (UI, poster, logo, etc.) based on their prompt.
      Your task is to ask exactly 5 clarifying questions to understand their requirements better.
      Return a JSON array of exactly 5 strings, where each string is a question.
    `.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `User prompt: ${prompt}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text || '[]';
    res.json({
      questions: JSON.parse(text.trim()),
      usage: {
        promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount || 0
      }
    });
  } catch (err: any) {
    handleGeminiError(err, res, 'Questions');
  }
});

// Gemini Endpoint: Generate Variants
app.post('/api/gemini/generate-variants', async (req, res) => {
  const { prompt, questions, answers } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt parameter' });
    return;
  }
  try {
    const ai = getGeminiAI();
    const systemInstruction = `
      You are Flash UI, a master UI/UX designer and world-class frontend engineer. 
      Your mission is to generate THREE RADICAL CONCEPTUAL VARIATIONS for the user's prompt.
      The user might request a UI, a poster, a logo, or any other visual layout. Adapt your HTML/Tailwind output to perfectly suit the requested medium.

      **STRICT IP SAFEGUARD:**
      - Never use names of artists, movies, or brands.
      - Instead, describe the "Physicality" and "Material Logic" of the UI.

      **VISUAL EXECUTION RULES:**
      1. **Materiality**: Use physical metaphors to drive every CSS choice. (e.g., if "Risograph", use grain effects like \`feTurbulence\` in SVG filters and \`mix-blend-mode: multiply\` for ink layering; if "Prismatic", use glassmorphism, caustic refraction, and morphing fluid gradients).
      2. **Typography**: Use high-quality web fonts (Inter, Geist, or system-ui). Pair a bold sans-serif with a refined monospace for data/labels.
      3. **Motion**: Include subtle, high-performance CSS animations (hover transitions, entry reveals, smooth staggered animations).
      4. **Layout**: Be bold with negative space and hierarchy. **AVOID GENERIC CARDS.** Use asymmetrical grids, suspended kinetic mobile elements, or fluid rectilinear structures.
      5. **Tailwind Only**: Output clean, accessible Tailwind CSS. For posters/logos, use absolute positioning, CSS grid, or SVG elements inline within the HTML. Ensure components are responsive.

      **CREATIVE GUIDANCE (Use these metaphors as inspiration for the 3 variants):**
      - "Asymmetrical Rectilinear Blockwork": Heavy black strokes, grid-heavy, primary pigments, thick structural lines, Bauhaus-functionalism vibe.
      - "Grainy Risograph Layering": Tactile paper texture, overprinted translucent inks, dithered grain textures, monochromatic depth, raw paper substrate.
      - "Kinetic Wireframe Suspension": Floating silhouettes, delicate thin balancing lines, organic primary shapes, minimalist whitespace, suspended mobile logic.
      - "Volumetric Prismatic Diffusion": Generative morphing gradients, soft-focus diffusion, bioluminescent light sources, spectral chromatic aberration, glassmorphism.

      **OUTPUT FORMAT:**
      Return a JSON array of exactly 3 objects. 
      Each object must have:
      - 'label': A unique design persona name based on a NEW physical metaphor.
      - 'html': The raw HTML string with Tailwind classes.
      - 'description': A one-sentence explanation describing the material logic and design persona.
    `.trim();

    const contents: any[] = [`Generate 3 design variations for: ${prompt}`];
    
    if (answers && questions && answers.length > 0 && questions.length > 0) {
      contents.push(`\n\nUser's answers to clarifying questions:\n${questions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n')}`);
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              html: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["label", "html", "description"]
          }
        }
      }
    });

    const jsonText = response.text || '[]';
    res.json({
      variants: JSON.parse(jsonText.trim()),
      usage: {
        promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount || 0
      }
    });
  } catch (err: any) {
    handleGeminiError(err, res, 'Variants');
  }
});

// Gemini Endpoint: Modify UI (with Reasoning and conversational updates)
app.post('/api/gemini/modify-ui', async (req, res) => {
  const { currentHtml, prompt } = req.body;
  if (!currentHtml) {
    res.status(400).json({ error: 'Missing currentHtml' });
    return;
  }
  try {
    const ai = getGeminiAI();
    const systemInstruction = `
      You are Flash Assistant, a master frontend co-pilot and AI Studio design chatbot.
      Your job is to update the current HTML according to the user request.
      Additionally, you must explain your updates, giving a clear reasoning, aesthetic choices, and exactly what modifications you introduced. Make it sound like a friendly, expert assistant chatbot.

      **CRITICAL OUTPUT SCHEMA:**
      You must return a JSON object with two fields:
      1. 'reasoning': A detailed, beautifully styled markdown text explaining your thoughts, reasoning behind style and layout changes, and specific edits made.
      2. 'html': The updated raw HTML content to be loaded inside the canvas (Tailwind classes, custom SVGs, etc.). Do NOT include markdown fences, \`<html>\`, \`<head>\`, or \`<body>\` tags.

      **IP SAFEGUARD:**
      Never use names of artists, movies, or brands.
    `.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `CURRENT HTML:
${currentHtml}

USER REQUEST:
${prompt}`,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reasoning: { type: Type.STRING },
            html: { type: Type.STRING }
          },
          required: ["reasoning", "html"]
        }
      }
    });

    const bodyText = response.text || '{}';
    res.json(JSON.parse(bodyText.trim()));
  } catch (err: any) {
    handleGeminiError(err, res, 'ModifyUI');
  }
});

// Gemini Endpoint: Generate Design Critique Suggestions
app.post('/api/gemini/suggestions', async (req, res) => {
  const { currentHtml } = req.body;
  if (!currentHtml) {
    res.status(400).json({ error: 'Missing currentHtml' });
    return;
  }
  try {
    const ai = getGeminiAI();
    const systemInstruction = `
      You are an expert design critic and UI/UX consultant.
      Your task is to analyze the provided HTML/Tailwind CSS code and suggest 3-4 specific improvements.
      
      Suggestions should focus on:
      - Visual hierarchy and layout
      - Color harmony and accessibility (contrast)
      - Typography and readability
      - Interaction design and affordances
      - Consistency and polish
      - Mobile responsiveness

      For each suggestion, provide:
      1. A short, catchy 'title'.
      2. A 'description' explaining the "why" behind the suggestion.
      3. An 'action': A specific natural language command that can be fed back into an AI redesigner to implement the change (e.g., "Add more whitespace between the cards and increase the font size of the headings").
    `.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Current HTML code:\n\n${currentHtml}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              action: { type: Type.STRING }
            },
            required: ["title", "description", "action"]
          }
        }
      }
    });

    const text = response.text || '[]';
    res.json({
      suggestions: JSON.parse(text.trim()),
      usage: {
        promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount || 0
      }
    });
  } catch (err: any) {
    handleGeminiError(err, res, 'Suggestions');
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

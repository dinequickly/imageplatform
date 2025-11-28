import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { CONFIG } from '@/lib/config';
import path from 'path';

// Helper to interact with Vertex AI Gemini
async function generateImageVertexGemini(prompt: string, accessToken: string, projectId: string, location: string, referenceImage?: string) {
    // Use Gemini 1.5 Pro or Flash on Vertex AI
    const model = "gemini-1.5-flash-001"; 
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    // Construct Content Parts
    const parts: any[] = [
        { text: prompt + " Return the output strictly as a generated image." }
    ];

    if (referenceImage) {
        // Strip header for API
        const base64Data = referenceImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        const mimeType = referenceImage.match(/^data:(image\/[a-zA-Z]+);base64,/)?.[1] || 'image/png';

        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: base64Data
            }
        });
    }

    const payload = {
        contents: [
            {
                role: "user",
                parts: parts
            }
        ],
        generationConfig: {
            response_mime_type: "image/jpeg" // Request Image output if model supports it (Gemini 2.0 does, 1.5 might output text description of image)
            // Note: Gemini 1.5 on Vertex might NOT support direct image generation yet, mostly text/code.
            // Imagen 3 is for images.
        }
    };
    
    // WAIT: Gemini 1.5 Flash on Vertex is TEXT-ONLY input/output (multimodal input, text output).
    // It CANNOT generate images directly.
    // We must use Imagen 3 for image generation.
    // But Imagen 3 doesn't support "Image Reference" easily in this API format.
    
    // If the user wants "Image to Image", we need a model that supports it.
    // Or we use Gemini to describe the image, then send that description to Imagen.
    
    // Let's stick to Imagen 3 (Vertex AI) which we had working, and just use the text prompt.
    // If a reference image is provided, we can't easily send it to Imagen 3 via this API yet without specific editing endpoints.
    // So we will ignore the reference image bytes and just rely on the text description we engineered in the frontend.
    
    return generateImageImagen3(prompt, accessToken, projectId, location);
}

async function generateImageImagen3(prompt: string, accessToken: string, projectId: string, location: string) {
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-4.0-generate-001:predict`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
            instances: [
                { prompt: prompt }
            ],
            parameters: {
                sampleCount: 2,
                aspectRatio: "1:1" 
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.predictions || data.predictions.length < 2) {
         throw new Error('Vertex AI did not return enough images.');
    }

    return {
        imageA: `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`,
        imageB: `data:image/png;base64,${data.predictions[1].bytesBase64Encoded}`
    };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, referenceImage } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. Authentication (Vertex AI)
    const keyFile = path.resolve(process.cwd(), CONFIG.GOOGLE.CREDENTIALS_PATH);
    
    const auth = new GoogleAuth({
        keyFile: keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const projectId = CONFIG.GOOGLE.PROJECT_ID;
    const location = CONFIG.GOOGLE.LOCATION;

    if (!accessToken.token) {
         throw new Error("Failed to get Google Cloud access token.");
    }

    // 2. Generate Images
    // Note: We are ignoring 'referenceImage' bytes here because Imagen 3 API 
    // is primarily text-to-image. The 'reference' context is already in the 'prompt' text 
    // thanks to our frontend prompt engineering (using webhook captions).
    const { imageA, imageB } = await generateImageImagen3(prompt, accessToken.token, projectId, location);

    return NextResponse.json({ imageA, imageB });

  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate images' }, { status: 500 });
  }
}
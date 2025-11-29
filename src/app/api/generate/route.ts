import { NextResponse } from 'next/server';

async function generateImageWithGemini(
    prompt: string,
    apiKey: string,
    referenceImages?: string[]
) {
    const model = "gemini-2.5-flash-image";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Build parts array: text prompt first, then reference images
    const parts: any[] = [{ text: prompt }];

    if (referenceImages && referenceImages.length > 0) {
        for (const imageUrl of referenceImages) {
            // Strip header if present and get just the base64 data
            const base64Data = imageUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
            const mimeType = imageUrl.match(/^data:(image\/[a-zA-Z]+);base64,/)?.[1] || 'image/jpeg';

            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            });
        }
    }

    const payload = {
        contents: [{
            parts: parts
        }]
    };

    console.log(`Calling Gemini 2.5 Flash Image API with ${referenceImages?.length || 0} reference images...`);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API Error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
        });
        throw new Error(`Gemini Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract the base64 image from the response
    if (data.candidates && data.candidates[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
            if (part.inlineData?.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }
        }
    }

    throw new Error('No image data returned from Gemini');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, referenceImages } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get Gemini API key from environment
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is not set');
    }

    // Generate 2 images for A/B comparison
    console.log('Generating image A...');
    const imageA = await generateImageWithGemini(prompt, apiKey, referenceImages);

    console.log('Generating image B...');
    const imageB = await generateImageWithGemini(prompt, apiKey, referenceImages);

    return NextResponse.json({ imageA, imageB });

  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate images' }, { status: 500 });
  }
}
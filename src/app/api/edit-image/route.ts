import { NextResponse } from 'next/server';

async function editImageWithGemini(
    imageBase64: string,
    modificationPrompt: string,
    apiKey: string
) {
    const model = "gemini-2.5-flash-image";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Strip header if present and get just the base64 data
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    const mimeType = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,/)?.[1] || 'image/jpeg';

    const payload = {
        contents: [{
            parts: [
                { text: modificationPrompt },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: base64Data
                    }
                }
            ]
        }]
    };

    console.log('Calling Gemini 2.5 Flash Image API...');

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
    console.log('Gemini response received');

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
        const { imageBase64, modificationPrompt } = body;

        if (!imageBase64 || !modificationPrompt) {
            return NextResponse.json(
                { error: 'imageBase64 and modificationPrompt are required' },
                { status: 400 }
            );
        }

        // Get Gemini API key from environment
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY environment variable is not set');
        }

        // Edit image using Gemini 2.5 Flash Image
        const modifiedImage = await editImageWithGemini(
            imageBase64,
            modificationPrompt,
            apiKey
        );

        return NextResponse.json({ modifiedImage });

    } catch (error: any) {
        console.error('Image editing error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to edit image' },
            { status: 500 }
        );
    }
}

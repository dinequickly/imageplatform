import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageBase64 } = body;

        if (!imageBase64) {
            return NextResponse.json(
                { error: 'imageBase64 is required' },
                { status: 400 }
            );
        }

        // Get HF API key from environment
        const apiKey = process.env.HF_API_KEY;
        if (!apiKey) {
            throw new Error('HF_API_KEY environment variable is not set');
        }

        // Model ID - user requested SAM3
        // If SAM3 endpoint isn't working, we can fallback or user can change it.
        const model = "facebook/sam3"; // Or "facebook/sam-vit-huge"
        const endpoint = `https://router.huggingface.co/models/${model}`;

        // Strip header if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        
        // Convert base64 to binary for HF API
        const buffer = Buffer.from(base64Data, 'base64');

        console.log(`Calling Hugging Face Inference API (${model})...`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' // HF often accepts raw bytes too, but JSON with inputs is safer for some models
            },
            body: buffer // Send raw image bytes
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('HF API Error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`HF Error: ${response.status} - ${errorText}`);
        }

        // Check content type
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('image/')) {
            // If it returns an image directly
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');
            const mimeType = contentType;
            return NextResponse.json({ 
                type: 'image',
                data: `data:${mimeType};base64,${base64}` 
            });
        } else {
            // Assume JSON (list of masks)
            const data = await response.json();
            // console.log('HF Response:', data);
            
            // data should be array of { score, label, mask (base64) }
            // We need to composite these into a single image or return them.
            // For simplicity, let's try to composite them on the client or return the first one?
            // "Segment all items" -> return all masks.
            
            return NextResponse.json({ 
                type: 'masks',
                data: data 
            });
        }

    } catch (error: any) {
        console.error('Segmentation error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to segment image' },
            { status: 500 }
        );
    }
}

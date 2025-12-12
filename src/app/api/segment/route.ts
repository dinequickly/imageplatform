import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

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

<<<<<<< HEAD
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
=======
        // Path to the python script
        const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'segment.py');
>>>>>>> 56d7dde (Sam3 fixed hope)
        
        // Use the python executable from the conda environment
        const pythonExec = '/opt/miniconda3/envs/sam3_env/bin/python';

        return new Promise((resolve) => {
            const pythonProcess = spawn(pythonExec, [scriptPath]);
            
            let dataString = '';
            let errorString = '';

            // Send data to python script
            pythonProcess.stdin.write(JSON.stringify({ imageBase64 }));
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorString += data.toString();
                console.error('Python Error:', data.toString());
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    resolve(NextResponse.json(
                        { error: `Process exited with code ${code}`, details: errorString },
                        { status: 500 }
                    ));
                    return;
                }

                try {
                    const result = JSON.parse(dataString);
                    if (result.error) {
                        resolve(NextResponse.json(
                            { error: result.error },
                            { status: 500 }
                        ));
                    } else {
                        resolve(NextResponse.json(result));
                    }
                } catch (e) {
                    resolve(NextResponse.json(
                        { error: 'Failed to parse python output', raw: dataString },
                        { status: 500 }
                    ));
                }
            });
        });

    } catch (error: any) {
        console.error('Segmentation error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to segment image' },
            { status: 500 }
        );
    }
}

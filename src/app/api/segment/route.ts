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

        // Path to the python script
        const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'segment.py');
        
        // Use the python executable from the conda environment
        // Note: This path is specific to the local machine setup. 
        // For production deployment (e.g. Vercel), this will FAIL unless the environment is set up exactly the same way (which is hard on Vercel serverless).
        // If deploying to Vercel, you cannot use local conda environments or spawn python scripts easily without custom build steps or using a separate backend.
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
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Undo, Eraser, Brush, Save, Loader2, Edit2 } from 'lucide-react';
import CanvasLayer, { CanvasLayerRef } from './CanvasLayer';
import { ChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { fal } from '@fal-ai/client';

// Configure FAL
fal.config({
  credentials: '90e9c562-fc27-474b-a672-d7f03da679f8:10858fb0c62da48c78d16d6f3e9aa7f1' // Security Notice: Exposed key for prototyping.
});

interface ImageEditorProps {
  imageUrl: string;
  initialDescription?: string;
  initialName?: string;
  sessionId: string;
  userId: string; // Needed for saving
  onClose: () => void;
  onSave: (newImageUrl: string, prompt: string) => void;
  onUpdateName?: (name: string) => void;
  onUpdateDescription?: (description: string) => void;
}

export default function ImageEditor({ 
    imageUrl, 
    initialDescription, 
    initialName, 
    sessionId, 
    userId, 
    onClose, 
    onSave, 
    onUpdateName, 
    onUpdateDescription 
}: ImageEditorProps) {
  // Canvas & Image State
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const canvasRef = useRef<CanvasLayerRef>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Welcome to the Studio. Draw on the image to mask an area, then tell me what to change.',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Metadata State
  const [name, setName] = useState(initialName || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Debounced Save for Metadata
  useEffect(() => {
    const timer = setTimeout(() => {
        if (name !== initialName && onUpdateName) {
            setIsSavingMeta(true);
            onUpdateName(name);
            setTimeout(() => setIsSavingMeta(false), 500);
        }
    }, 1000);
    return () => clearTimeout(timer);
  }, [name]); 

  useEffect(() => {
    const timer = setTimeout(() => {
        if (description !== initialDescription && onUpdateDescription) {
            setIsSavingMeta(true);
            onUpdateDescription(description);
            setTimeout(() => setIsSavingMeta(false), 500);
        }
    }, 1000);
    return () => clearTimeout(timer);
  }, [description]);

  // Initialize Image Size
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgDimensions({ width: naturalWidth, height: naturalHeight });
  };

  // Helper: Convert Data URL to Blob for upload
  const dataURLToBlob = (dataURL: string) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    
    const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: input,
        type: 'text'
    };
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);
    const currentPrompt = input;
    setInput('');

    try {
        const hasMask = canvasRef.current?.hasMask();
        const maskDataUrl = hasMask ? canvasRef.current?.getMask() : null;

        // 1. Upload Original Image to Fal Storage (if it's not already a public URL, but let's be safe)
        // Note: Fal can take direct URLs, but if it's a blob/local, we must upload. 
        // Assuming imageUrl is accessible. If it's a blob URL (from local state), we need to fetch and upload.
        
        let finalImageUrl = imageUrl;
        // Optimization: If imageUrl starts with http, send directly. If data:, upload.
        if (imageUrl.startsWith('data:')) {
             const file = dataURLToBlob(imageUrl);
             finalImageUrl = await fal.storage.upload(file);
        }

        let finalMaskUrl = null;
        if (maskDataUrl) {
            const maskFile = dataURLToBlob(maskDataUrl);
            finalMaskUrl = await fal.storage.upload(maskFile);
        }

        console.log("Calling Fal.AI with:", { finalImageUrl, finalMaskUrl, prompt: currentPrompt });

        // 2. Submit Request to Fal AI (Inpainting or regular Edit)
        // Using 'fal-ai/qwen-image-edit/inpaint' for both, assuming it handles no mask gracefully?
        // If no mask, maybe regular generation/edit? The prompt implies we use 'inpaint' endpoint per request.
        
        const result: any = await fal.subscribe("fal-ai/qwen-image-edit/inpaint", {
            input: {
                prompt: currentPrompt,
                image_url: finalImageUrl,
                mask_url: finalMaskUrl,
                image_size: "square_hd", // Or derive from aspect ratio
                num_inference_steps: 30,
                guidance_scale: 4,
                enable_safety_checker: true,
                output_format: "png"
            },
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    console.log(update.logs);
                }
            }
        });

        console.log("Fal Result:", result);
        
        // Handle result.data which contains images
        // Schema: { images: [{ url: "..." }] } (Check specific model output schema, typically standard)
        // Actually, Qwen model output might differ. Blueprint said `result.data`.
        // Let's assume standard Fal image output: { images: [{ url: "..." }] } or just { image: { url: "..." } }
        
        // Qwen Inpaint Output Schema usually: { images: [ { url: "", width: 0, height: 0 } ] }
        const outputUrl = result.data.images?.[0]?.url || result.data.image?.url;

        if (outputUrl) {
             const botMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "Here is the updated version:",
                type: 'image',
                imageUrl: outputUrl
            };
            setMessages(prev => [...prev, botMsg]);
        } else {
             throw new Error("No image returned from Fal AI");
        }

    } catch (error) {
        console.error("Edit failed:", error);
        const errorMsg: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: "Something went wrong generating the image. Please try again.",
            type: 'text'
        };
        setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="bg-white w-full max-w-[1600px] h-[90vh] rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl relative">
        
        {/* Close Button (Global) */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 bg-white/10 hover:bg-black/10 text-gray-500 hover:text-black rounded-full transition-colors"
            title="Close Studio"
        >
            <X size={24} />
        </button>

        {/* Column 1: Metadata (Left) */}
        <div className="w-full md:w-[300px] bg-gray-50 border-r border-gray-200 flex flex-col p-6 z-20">
            <div className="mb-8">
                <h2 className="text-xl font-bold tracking-tight mb-1">Studio</h2>
                <p className="text-xs text-gray-500">Metadata Editor</p>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            placeholder="Image Name"
                        />
                        <Edit2 size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                    <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={8}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none leading-relaxed"
                        placeholder="Detailed visual description..."
                    />
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                     <span className="text-xs text-gray-400">
                         {isSavingMeta ? 'Saving changes...' : 'Changes auto-saved'}
                     </span>
                </div>
            </div>
        </div>

        {/* Column 2: Workspace (Center) */}
        <div className="flex-1 bg-gray-900 relative flex flex-col overflow-hidden">
            
            {/* Toolbar */}
            <div className="absolute top-6 left-6 z-30 flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-xl">
                <button 
                    onClick={() => setIsDrawingMode(!isDrawingMode)}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${isDrawingMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                    title="Toggle Mask Brush"
                >
                    <Brush size={18} />
                    <span className="text-xs font-medium hidden sm:inline">Mask</span>
                </button>
                
                {isDrawingMode && (
                    <>
                        <div className="w-px h-6 bg-white/20 my-auto mx-1" />
                        <div className="flex items-center gap-3 px-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                             <input 
                                type="range" 
                                min="5" 
                                max="100" 
                                value={brushSize} 
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-blue-500"
                             />
                             <div className="w-3 h-3 rounded-full bg-white/50" />
                        </div>
                        <div className="w-px h-6 bg-white/20 my-auto mx-1" />
                        <button 
                            onClick={() => canvasRef.current?.clear()}
                            className="p-2 text-white/70 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                            title="Clear Mask"
                        >
                            <Eraser size={18} />
                        </button>
                    </>
                )}
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-[url('/globe.svg')] bg-center bg-no-repeat bg-opacity-5">
                <div className="relative shadow-2xl ring-1 ring-white/10 rounded-sm">
                    {/* Base Image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        ref={imageRef}
                        src={imageUrl} 
                        alt="Editing target"
                        onLoad={handleImageLoad}
                        className="max-w-full max-h-[75vh] object-contain select-none pointer-events-none" 
                        style={{ display: 'block' }} 
                    />
                    
                    {/* Canvas Layer (Absolute Overlay) */}
                    {imgDimensions && (
                        <CanvasLayer 
                            ref={canvasRef}
                            width={imgDimensions.width}
                            height={imgDimensions.height}
                            brushSize={brushSize * (imgDimensions.width / (imageRef.current?.clientWidth || 1))} // Scale brush to natural size
                            isDrawingMode={isDrawingMode}
                        />
                    )}
                </div>
            </div>
        </div>

        {/* Column 3: Chat / Control Panel (Right) */}
        <div className="w-full md:w-[380px] flex flex-col bg-white border-l border-gray-200 z-20">
            <div className="p-6 border-b border-gray-100 bg-white">
                <h3 className="font-bold text-gray-800">AI Assistant</h3>
                <p className="text-xs text-gray-500">Describe edits or request variations.</p>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
                 {messages.map((msg) => (
                     <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[90%] rounded-2xl p-4 text-sm shadow-sm ${
                             msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-br-sm' 
                                : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                         }`}>
                             {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                             {msg.type === 'image' && msg.imageUrl && (
                                 <div className="mt-3 rounded-lg overflow-hidden border border-gray-100 shadow-sm group relative">
                                     {/* eslint-disable-next-line @next/next/no-img-element */}
                                     <img src={msg.imageUrl} alt="Result" className="w-full h-auto bg-gray-100" />
                                     <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                         <button 
                                            onClick={() => onSave(msg.imageUrl!, "Edited Image")}
                                            className="bg-white text-black text-xs font-bold px-4 py-2 rounded-full hover:bg-gray-100 transform hover:scale-105 transition-all flex items-center gap-2"
                                         >
                                             <Save size={14} /> Save to Board
                                         </button>
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 ))}
                 {isGenerating && (
                     <div className="flex justify-start">
                         <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm p-4 flex items-center gap-3 text-gray-500 text-sm shadow-sm">
                             <Loader2 className="animate-spin text-blue-600" size={18} />
                             <span className="animate-pulse">Processing...</span>
                         </div>
                     </div>
                 )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <div className="relative flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isGenerating && handleSend()}
                        placeholder={isDrawingMode ? "What should fill the mask?" : "Describe your changes..."}
                        className="flex-1 bg-gray-50 border-gray-200 border rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm"
                        disabled={isGenerating}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isGenerating}
                        className="p-3 bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                </div>
                <div className="text-[10px] text-center text-gray-400 mt-3 font-medium">
                    {isDrawingMode ? 
                        <span className="text-blue-600 flex items-center justify-center gap-1"><Brush size={10} /> Mask Active</span> : 
                        "Global Edit Mode"
                    }
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

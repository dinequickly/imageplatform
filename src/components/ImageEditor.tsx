'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Undo, Eraser, Brush, Save, Loader2 } from 'lucide-react';
import CanvasLayer, { CanvasLayerRef } from './CanvasLayer';
import { ChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface ImageEditorProps {
  imageUrl: string;
  initialDescription?: string;
  sessionId: string;
  userId: string; // Needed for saving
  onClose: () => void;
  onSave: (newImageUrl: string, prompt: string) => void;
}

export default function ImageEditor({ imageUrl, initialDescription, sessionId, userId, onClose, onSave }: ImageEditorProps) {
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

  // Initialize Image Size
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgDimensions({ width: naturalWidth, height: naturalHeight });
  };

  const imageToBase64 = async (url: string): Promise<string> => {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
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
        let webhookUrl = 'https://maxipad.app.n8n.cloud/webhook/images';
        let body: any = {
            prompt: currentPrompt,
            userId,
            sessionId
        };

        // Get Base64 of Original Image
        // Note: We use the original URL. If it's a cross-origin issue, we might need a proxy, 
        // but usually Supabase URLs are fine if CORS is set.
        const baseImage = await imageToBase64(imageUrl);
        
        if (hasMask) {
            webhookUrl = 'https://maxipad.app.n8n.cloud/webhook/imagemask';
            const maskImage = canvasRef.current?.getMask();
            
            body = {
                ...body,
                originalImage: baseImage, // The API expects "originalImage" or "image"? 
                                          // The blueprint said "Accept image, mask...". 
                                          // I'll send clear keys.
                image: baseImage,         // Send both to be safe or rely on "image"
                mask: maskImage
            };
        } else {
            // No mask - standard edit or generation
            body = {
                ...body,
                image: baseImage
            };
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        // Assuming data returns an image URL or base64
        // Adjust based on actual API response structure. 
        // If n8n returns binary, we might need to handle blob.
        // For now, assume JSON with { outputImage: "..." } or similar.
        
        let resultImageUrl = data.outputImage || data.image || data.url;
        
        // If the webhook returns raw binary image directly (common in n8n)
        // We might need to check content-type if JSON parsing failed? 
        // But here we did response.json(). If it fails, we catch error.

        if (resultImageUrl) {
             const botMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "Here is the updated version:",
                type: 'image',
                imageUrl: resultImageUrl
            };
            setMessages(prev => [...prev, botMsg]);
        } else {
             throw new Error("No image returned from API");
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-6xl h-[85vh] rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl">
        
        {/* Left: Workspace (Image + Canvas) */}
        <div className="flex-1 bg-gray-900 relative flex flex-col">
            
            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-10 flex gap-2 bg-white/10 backdrop-blur-md p-2 rounded-lg border border-white/20">
                <button 
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                    title="Close"
                >
                    <X size={20} />
                </button>
                <div className="w-px h-6 bg-white/20 my-auto mx-1" />
                <button 
                    onClick={() => setIsDrawingMode(!isDrawingMode)}
                    className={`p-2 rounded-md transition-colors flex items-center gap-2 ${isDrawingMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-white/80 hover:bg-white/10'}`}
                    title="Toggle Mask Brush"
                >
                    <Brush size={20} />
                    <span className="text-xs font-medium hidden sm:inline">Mask</span>
                </button>
                
                {isDrawingMode && (
                    <>
                        <div className="flex items-center gap-2 px-2">
                             <div className="w-2 h-2 rounded-full bg-white/50" />
                             <input 
                                type="range" 
                                min="5" 
                                max="100" 
                                value={brushSize} 
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="w-24 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                             />
                             <div className="w-4 h-4 rounded-full bg-white/50" />
                        </div>
                        <button 
                            onClick={() => canvasRef.current?.clear()}
                            className="p-2 text-white/80 hover:text-red-400 hover:bg-white/10 rounded-md transition-colors"
                            title="Clear Mask"
                        >
                            <Eraser size={20} />
                        </button>
                    </>
                )}
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-[url('/globe.svg')] bg-center bg-no-repeat bg-opacity-5">
                <div className="relative shadow-2xl">
                    {/* Base Image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        ref={imageRef}
                        src={imageUrl} 
                        alt="Editing target"
                        onLoad={handleImageLoad}
                        className="max-w-full max-h-[70vh] object-contain select-none pointer-events-none" 
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

        {/* Right: Chat / Control Panel */}
        <div className="w-full md:w-[400px] flex flex-col bg-white border-l border-gray-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-bold text-gray-800">Studio Editor</h3>
                    <p className="text-xs text-gray-500">Refine your generation</p>
                </div>
                <button 
                    onClick={() => { /* TODO: Save logic if needed specifically here */ onClose(); }} 
                    className="text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                    Back to Board
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {messages.map((msg) => (
                     <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                             msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-gray-100 text-gray-800 rounded-tl-none'
                         }`}>
                             {msg.content && <p className="mb-2">{msg.content}</p>}
                             {msg.type === 'image' && msg.imageUrl && (
                                 <div className="mt-2 rounded-lg overflow-hidden border-2 border-white shadow-sm group relative">
                                     {/* eslint-disable-next-line @next/next/no-img-element */}
                                     <img src={msg.imageUrl} alt="Result" className="w-full h-auto" />
                                     <button 
                                        onClick={() => onSave(msg.imageUrl!, "Edited Image")}
                                        className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:bg-black"
                                     >
                                         <Save size={12} /> Save to Board
                                     </button>
                                 </div>
                             )}
                         </div>
                     </div>
                 ))}
                 {isGenerating && (
                     <div className="flex justify-start">
                         <div className="bg-gray-100 rounded-2xl rounded-tl-none p-4 flex items-center gap-2 text-gray-500 text-sm">
                             <Loader2 className="animate-spin" size={16} />
                             <span>Processing your edits...</span>
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
                        placeholder={isDrawingMode ? "Describe what to fill in the mask..." : "Describe changes..."}
                        className="flex-1 bg-gray-50 border-0 rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        disabled={isGenerating}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isGenerating}
                        className="p-3 bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                </div>
                <div className="text-[10px] text-center text-gray-400 mt-2">
                    {isDrawingMode ? "Mask mode active: AI will only change the highlighted area." : "Global mode: AI will edit the entire image."}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

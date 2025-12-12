'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Undo, Redo, Eraser, Brush, Save, Loader2, Edit2, Scan } from 'lucide-react';
import CanvasLayer, { CanvasLayerRef } from './CanvasLayer';
import { ChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

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
    imageUrl: initialImageUrl, // Rename prop to avoid confusion
    initialDescription, 
    initialName, 
    sessionId, 
    userId, 
    onClose, 
    onSave, 
    onUpdateName, 
    onUpdateDescription 
}: ImageEditorProps) {
  // --- History & Undo/Redo State ---
  const [history, setHistory] = useState<string[]>([initialImageUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const currentImageUrl = history[historyIndex];

  // Canvas & Image State
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const canvasRef = useRef<CanvasLayerRef>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Chat State (Text only now)
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
  const [isSegmenting, setIsSegmenting] = useState(false);

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

  // Undo / Redo Logic
  const handleUndo = () => {
    if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1);
        // Clear mask on undo to avoid misalignment
        canvasRef.current?.clear();
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
        setHistoryIndex(prev => prev + 1);
        canvasRef.current?.clear();
    }
  };

  const handleSegment = async () => {
      if (isSegmenting || !currentImageUrl) return;
      setIsSegmenting(true);
      
      try {
          // Get base64 of current image
          const imageBase64 = await imageToBase64(currentImageUrl);
          
          const response = await fetch('/api/segment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64 })
          });
          
          const data = await response.json();
          
          if (data.error) throw new Error(data.error);
          
          if (data.type === 'image') {
              canvasRef.current?.drawMask(data.data);
          } else if (data.type === 'masks' && Array.isArray(data.data)) {
              // Composite masks
              const canvas = document.createElement('canvas');
              if (imgDimensions) {
                  canvas.width = imgDimensions.width;
                  canvas.height = imgDimensions.height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                      // Draw each mask
                      for (const item of data.data) {
                          if (item.mask) { // item.mask is base64 string
                             const maskImg = new Image();
                             // Handle if mask is raw base64 or data uri
                             maskImg.src = item.mask.startsWith('data:') ? item.mask : `data:image/png;base64,${item.mask}`;
                             await new Promise((resolve) => { maskImg.onload = resolve; });
                             ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                          }
                      }
                      canvasRef.current?.drawMask(canvas.toDataURL('image/png'));
                  }
              }
          }
          
          const botMsg: ChatMessage = {
              id: uuidv4(),
              role: 'assistant',
              content: "I've automatically segmented the image for you.",
              type: 'text'
          };
          setMessages(prev => [...prev, botMsg]);

      } catch (error) {
          console.error("Segmentation failed:", error);
           const errorMsg: ChatMessage = {
              id: uuidv4(),
              role: 'assistant',
              content: "Could not auto-segment the image. Please try manually masking.",
              type: 'text'
          };
          setMessages(prev => [...prev, errorMsg]);
      } finally {
          setIsSegmenting(false);
      }
  };

  // Helper: Create Composite Image (Base Image + Mask Strokes)
  const getCompositeImage = async (baseImageUrl: string): Promise<string> => {
      return new Promise(async (resolve, reject) => {
          try {
              // 1. Load Base Image
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = baseImageUrl;
              await new Promise((r) => { img.onload = r; });

              // 2. Setup Canvas
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('No context');

              // 3. Draw Base Image
              ctx.drawImage(img, 0, 0);

              // 4. Draw Mask Layer (Green Strokes)
              if (canvasRef.current) {
                  const maskLayerData = canvasRef.current.getTransparentLayer(); // Needs implementation in CanvasLayer
                  if (maskLayerData) {
                      const maskImg = new Image();
                      maskImg.src = maskLayerData;
                      await new Promise((r) => { maskImg.onload = r; });
                      ctx.drawImage(maskImg, 0, 0);
                  }
              }

              resolve(canvas.toDataURL('image/png'));
          } catch (e) {
              reject(e);
          }
      });
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    
    // Add User Message
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
        // Get Composite Image (Single image with mask visually applied)
        const compositeImage = await getCompositeImage(currentImageUrl);
        
        // Strip Data URI prefix to send ONLY raw base64
        // e.g. "data:image/png;base64,iVBOR..." -> "iVBOR..."
        const rawBase64 = compositeImage.split(',')[1];

        // Use the single image endpoint (Visual Prompting)
        let webhookUrl = 'https://maxipad.app.n8n.cloud/webhook/images'; 
        
        let body: any = {
            prompt: currentPrompt,
            userId,
            sessionId,
            image: rawBase64 // Sends ONLY the raw base64 string
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        let resultImageUrl = data.outputImage || data.image || data.url;
        
        if (resultImageUrl) {
             // --- KEY CHANGE: Update Main Canvas instead of Chat ---
             
             // 1. Add to history stack
             // Remove any "future" history if we were in the middle of the stack
             const newHistory = history.slice(0, historyIndex + 1);
             newHistory.push(resultImageUrl);
             setHistory(newHistory);
             setHistoryIndex(newHistory.length - 1);

             // 2. Clear Mask
             canvasRef.current?.clear();

             // 3. Add success message to chat (text only)
             const botMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "Image updated based on your instructions.",
                type: 'text'
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

                {/* Main Save Action moved to sidebar bottom for clarity */}
                <div className="mt-auto pt-4">
                    <button 
                        onClick={() => onSave(currentImageUrl, "Studio Edit")}
                        className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <Save size={18} /> Save Changes to Board
                    </button>
                </div>
            </div>
        </div>

        {/* Column 2: Workspace (Center) */}
        <div className="flex-1 bg-gray-900 relative flex flex-col overflow-hidden">
            
            {/* Top Toolbar: Undo/Redo & Tools */}
            <div className="absolute top-6 left-6 right-6 z-30 flex justify-between items-start pointer-events-none">
                
                {/* Left: Drawing Tools */}
                <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-xl pointer-events-auto">
                    <button 
                        onClick={() => setIsDrawingMode(!isDrawingMode)}
                        className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${isDrawingMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                        title="Toggle Mask Brush"
                    >
                        <Brush size={18} />
                        <span className="text-xs font-medium hidden sm:inline">Mask</span>
                    </button>

                    <button 
                        onClick={handleSegment}
                        disabled={isSegmenting}
                        className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${isSegmenting ? 'bg-blue-600/50 cursor-not-allowed' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                        title="Auto Segment"
                    >
                        {isSegmenting ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} />}
                        <span className="text-xs font-medium hidden sm:inline">Segment</span>
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

                {/* Right: History Controls */}
                <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-xl pointer-events-auto">
                    <button 
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo"
                    >
                        <Undo size={18} />
                    </button>
                    <div className="w-px h-6 bg-white/20 my-auto mx-1" />
                    <button 
                        onClick={handleRedo}
                        disabled={historyIndex === history.length - 1}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo"
                    >
                        <Redo size={18} />
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-[url('/globe.svg')] bg-center bg-no-repeat bg-opacity-5">
                <div className="relative shadow-2xl ring-1 ring-white/10 rounded-sm">
                    {/* Base Image (Dynamic Source) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        ref={imageRef}
                        src={currentImageUrl} 
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
                             {/* Removed Image display here as it updates the main canvas now */}
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
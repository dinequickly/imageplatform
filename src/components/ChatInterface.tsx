'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Edit3, Check, Paperclip } from 'lucide-react';
import { ChatMessage, MoodBoardItem, FolderWithItems } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  messages: ChatMessage[];
  moodBoardItems: MoodBoardItem[];
  folders: FolderWithItems[];
  onSendMessage: (text: string, file?: File) => void;
  onProposalAccept: (id: string, prompt: string) => void;
  isGenerating: boolean;
}

export default function ChatInterface({ messages, moodBoardItems, folders, onSendMessage, onProposalAccept, isGenerating }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [activePreviews, setActivePreviews] = useState<Array<{
      type: 'single' | 'folder';
      item?: MoodBoardItem;
      folder?: FolderWithItems;
      match: string;
  }>>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Scan entire text for all valid mentions
  useEffect(() => {
    const text = inputValue;
    const mentionRegex = /@([a-zA-Z0-9_\/-]+)/g;
    const matches = [...text.matchAll(mentionRegex)];
    
    const foundPreviews: typeof activePreviews = [];
    const seenIds = new Set<string>();

    for (const match of matches) {
        const cleanMention = match[1]; // "1", "hero", "Folder/2"
        
        // 1. Specific Item Index (@1)
        if (/^\d+$/.test(cleanMention)) {
            const index = parseInt(cleanMention) - 1;
            const item = moodBoardItems.find(i => i.orderIndex === index);
            if (item && !seenIds.has(item.id)) {
                foundPreviews.push({ type: 'single', item, match: cleanMention });
                seenIds.add(item.id);
            }
            continue;
        }

        // 2. Folder/Index (@Folder/1)
        if (cleanMention.includes('/')) {
            const [folderName, indexStr] = cleanMention.split('/');
            const folder = folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
            if (folder && /^\d+$/.test(indexStr)) {
                const idx = parseInt(indexStr) - 1;
                const item = folder.items[idx];
                if (item && !seenIds.has(item.id)) {
                    foundPreviews.push({ type: 'single', item, match: cleanMention });
                    seenIds.add(item.id);
                }
            }
            continue;
        }

        // 3. Item Name (@hero-shot)
        const namedItem = moodBoardItems.find(i => i.name?.toLowerCase() === cleanMention.toLowerCase());
        if (namedItem && !seenIds.has(namedItem.id)) {
            foundPreviews.push({ type: 'single', item: namedItem, match: cleanMention });
            seenIds.add(namedItem.id);
            continue;
        }

        // 4. Folder Name (@Folder)
        const folder = folders.find(f => f.name.toLowerCase() === cleanMention.toLowerCase());
        if (folder && !seenIds.has(`folder-${folder.id}`)) {
            foundPreviews.push({ type: 'folder', folder, match: cleanMention });
            seenIds.add(`folder-${folder.id}`);
        }
    }

    setActivePreviews(foundPreviews);

  }, [inputValue, moodBoardItems, folders]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };
  
  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
    setActivePreviews([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSendMessage('', e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <span className="font-semibold text-gray-700 text-sm">Creative Assistant</span>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed",
                msg.role === 'user'
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              )}
            >
              {msg.type === 'text' ? (
                <p>{msg.content}</p>
              ) : msg.type === 'image' ? (
                <div className="space-y-2">
                    <img src={msg.imageUrl} alt="Uploaded" className="rounded-lg w-auto max-w-full max-h-[400px] object-contain" />
                    {msg.content && <p>{msg.content}</p>}
                </div>
              ) : (
                <ProposalBlock
                    message={msg}
                    onAccept={(prompt) => onProposalAccept(msg.id, prompt)}
                />
              )}
            </div>
          </div>
        ))}
        
        {isGenerating && (
           <div className="flex justify-start">
             <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-sm p-4 text-sm italic flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                Painting masterpieces...
             </div>
           </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-100 bg-white relative">
        {/* Floating Preview - Horizontal Stack */}
        {activePreviews.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 flex gap-2 overflow-x-auto p-2 pointer-events-none">
                {activePreviews.map((preview, idx) => (
                    <div key={idx} className="bg-white rounded-xl shadow-xl border border-gray-200 animate-in slide-in-from-bottom-2 duration-200 z-10 overflow-hidden shrink-0 pointer-events-auto">
                        {preview.type === 'single' && preview.item && (
                            <div className="p-2">
                                <div className="relative">
                                    <div className="absolute -top-2 -left-2 bg-black text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm z-10">
                                        @{preview.match}
                                    </div>
                                    <img 
                                        src={preview.item.imageUrl} 
                                        alt="Preview" 
                                        className="h-32 w-auto rounded-lg object-cover border border-gray-100"
                                    />
                                </div>
                            </div>
                        )}

                        {preview.type === 'folder' && preview.folder && (
                            <div className="w-48 max-h-36 p-3 flex flex-col">
                                <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-1">
                                    <span className="font-bold text-sm text-gray-700 truncate max-w-[100px]">{preview.folder.name}</span>
                                    <span className="text-[10px] text-gray-400">{preview.folder.items.length} items</span>
                                </div>
                                <div className="flex-1 overflow-hidden grid grid-cols-3 gap-1">
                                    {preview.folder.items.slice(0, 6).map((item, i) => (
                                        <div key={item.id} className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                                            <img src={item.imageUrl} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}

        <div className="relative flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            accept="image/*"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            title="Upload Image"
          >
            <Paperclip size={20} />
          </button>

          <input
            ref={textInputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your vision..."
            className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            disabled={isGenerating}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isGenerating}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="text-[10px] text-gray-400 mt-2 text-center">
            Tip: Use <span className="font-mono bg-gray-100 px-1 rounded">@1</span> to reference Vision Board items
        </div>
      </div>
    </div>
  );
}

function ProposalBlock({ message, onAccept }: { message: ChatMessage; onAccept: (p: string) => void }) {
    const [prompt, setPrompt] = useState(message.proposal?.prompt || '');
    const [isEditing, setIsEditing] = useState(false);
    const isAccepted = message.proposal?.status === 'accepted';
    const referenceImages = message.proposal?.referenceImages; // Changed to array

    if (!message.proposal) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-500">
                <div className="flex items-center gap-2">
                    <Sparkles size={12} />
                    Prompt Proposal
                </div>
                {referenceImages && referenceImages.length > 0 && (
                    <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                        <Paperclip size={10} />
                        {referenceImages.length} Reference{referenceImages.length > 1 ? 's' : ''} Attached
                    </div>
                )}
            </div>

            {referenceImages && referenceImages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 -mb-2">
                    {referenceImages.map((imgUrl, idx) => (
                        <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                            <img src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            )}
            
            {isAccepted ? (
                <div className="p-3 bg-white/50 rounded border border-gray-200 italic text-gray-600">
                    "{prompt}"
                </div>
            ) : (
                <div className="bg-white rounded border border-gray-200 p-3">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={!isEditing && !isAccepted}
                        className={cn(
                            "w-full bg-transparent outline-none text-gray-800 resize-none",
                            isEditing ? "border-b border-blue-300 pb-2 mb-2 focus:border-blue-500" : "cursor-default"
                        )}
                        rows={3}
                    />
                    
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                         <div className="flex gap-2">
                             {!isEditing ? (
                                 <button
                                    onClick={() => setIsEditing(true)}
                                    className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                                 >
                                    <Edit3 size={12} /> Edit
                                 </button>
                             ) : (
                                 <button
                                    onClick={() => setIsEditing(false)}
                                    className="text-xs text-blue-600 font-medium flex items-center gap-1"
                                 >
                                    <Check size={12} /> Done
                                 </button>
                             )}
                         </div>

                         <div className="flex gap-2">
                            <button
                                onClick={() => onAccept(prompt)}
                                className="px-3 py-1 bg-black text-white text-xs rounded-full hover:bg-gray-800 transition-colors"
                            >
                                Generate
                            </button>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
}

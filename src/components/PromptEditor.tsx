'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Loader } from 'lucide-react';
import { ChatMessage } from '@/types';

interface PromptEditorMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    type?: 'text' | 'prompt_preview';
    prompt?: string;
}

interface Props {
    originalProposal: ChatMessage;
    onClose: () => void;
    onGenerate: (prompt: string) => void;
    sessionId: string;
    userId: string;
}

export default function PromptEditor({ originalProposal, onClose, onGenerate, sessionId, userId }: Props) {
    const [messages, setMessages] = useState<PromptEditorMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(originalProposal.proposal?.prompt || '');
    const originalPrompt = originalProposal.proposal?.prompt || '';
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Initialize with the original prompt
        setMessages([{
            id: Date.now().toString(),
            role: 'assistant',
            content: 'I can help you refine this prompt. What would you like to change?',
            type: 'prompt_preview',
            prompt: originalProposal.proposal?.prompt || ''
        }]);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage: PromptEditorMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Call n8n webhook
            const response = await fetch('https://maxipad.app.n8n.cloud/webhook/88135877-36db-4be1-8bf2-e37d26c6f8ae', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userInput: inputValue,
                    originalPrompt: originalPrompt,
                    currentPrompt: currentPrompt,
                    sessionId: sessionId,
                    userId: userId,
                    conversationHistory: messages.map(m => ({ role: m.role, content: m.content }))
                })
            });

            const data = await response.json();

            // Handle different response types
            if (data.type === 'prompt_preview' || data.prompt) {
                // Show updated prompt
                const newPrompt = data.prompt || data.content;
                setCurrentPrompt(newPrompt);

                const assistantMessage: PromptEditorMessage = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: data.message || 'I\'ve updated the prompt:',
                    type: 'prompt_preview',
                    prompt: newPrompt
                };
                setMessages(prev => [...prev, assistantMessage]);

            } else if (data.type === 'generate') {
                // Trigger generation
                onGenerate(data.prompt || currentPrompt);

            } else {
                // Regular text response
                const assistantMessage: PromptEditorMessage = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: data.content || data.message || 'Got it!',
                    type: 'text'
                };
                setMessages(prev => [...prev, assistantMessage]);
            }

        } catch (error) {
            console.error('Webhook error:', error);
            const errorMessage: PromptEditorMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                type: 'text'
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-purple-600" size={20} />
                    <h2 className="text-lg font-bold">Prompt Editor</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                msg.role === 'user'
                                    ? 'bg-black text-white'
                                    : 'bg-gray-100 text-gray-900'
                            }`}
                        >
                            {msg.type === 'prompt_preview' ? (
                                <div className="space-y-3">
                                    <p className="text-sm">{msg.content}</p>
                                    <div className="bg-white/10 backdrop-blur p-4 rounded-lg border border-white/20">
                                        <div className="text-xs uppercase tracking-wider opacity-70 mb-2">Current Prompt</div>
                                        <p className="text-sm font-medium leading-relaxed">{msg.prompt}</p>
                                    </div>
                                    <button
                                        onClick={() => onGenerate(msg.prompt!)}
                                        className="w-full mt-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                                    >
                                        Generate Images
                                    </button>
                                </div>
                            ) : (
                                <p className="text-sm">{msg.content}</p>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-900 rounded-2xl px-4 py-3">
                            <Loader className="animate-spin" size={16} />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Ask me to adjust the prompt..."
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !inputValue.trim()}
                        className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    Try: "make it more cinematic", "add dramatic lighting", "less technical", or "run it"
                </p>
            </div>
        </div>
    );
}

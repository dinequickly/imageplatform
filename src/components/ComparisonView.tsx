'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Generation } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  generation: Generation;
  onComplete: (selected: 'A' | 'B', explanation: string) => void;
}

export default function ComparisonView({ generation, onComplete }: Props) {
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  const [explanation, setExplanation] = useState('');

  const handleSelect = (choice: 'A' | 'B') => {
    setSelected(choice);
  };

  const handleSubmit = () => {
    if (selected) {
      onComplete(selected, explanation);
    }
  };

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm mt-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Compare & Select</h3>
      <p className="text-sm text-gray-500 mb-6">Which image better matches your vision?</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Image A */}
        <div 
          className={cn(
            "cursor-pointer relative group rounded-lg overflow-hidden border-4 transition-all",
            selected === 'A' ? "border-blue-500 ring-4 ring-blue-100" : "border-transparent hover:border-gray-200"
          )}
          onClick={() => handleSelect('A')}
        >
          <img src={generation.imageA} alt="Option A" className="w-full h-auto" />
          <div className="absolute top-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-bold">
            Option A
          </div>
          <div className="absolute top-3 right-3 text-blue-500 bg-white rounded-full">
             {selected === 'A' ? <CheckCircle2 size={28} fill="currentColor" className="text-white" /> : <Circle size={28} className="text-white/80" />}
          </div>
        </div>

        {/* Image B */}
        <div 
          className={cn(
            "cursor-pointer relative group rounded-lg overflow-hidden border-4 transition-all",
            selected === 'B' ? "border-blue-500 ring-4 ring-blue-100" : "border-transparent hover:border-gray-200"
          )}
          onClick={() => handleSelect('B')}
        >
          <img src={generation.imageB} alt="Option B" className="w-full h-auto" />
           <div className="absolute top-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-bold">
            Option B
          </div>
          <div className="absolute top-3 right-3 text-blue-500 bg-white rounded-full">
             {selected === 'B' ? <CheckCircle2 size={28} fill="currentColor" className="text-white" /> : <Circle size={28} className="text-white/80" />}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
            Why did you choose {selected ? `Option ${selected}` : 'this one'}?
        </label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="E.g., The lighting is softer, the composition feels more balanced..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[80px]"
        />
        
        <div className="flex justify-end">
            <button
                disabled={!selected}
                onClick={handleSubmit}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            >
                Confirm Selection
            </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Profile } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onComplete: (data: Partial<Profile>) => Promise<void>;
}

export default function OnboardingModal({ isOpen, onComplete }: Props) {
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onComplete({ company_name: companyName, role });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Welcome to Pressed.</h2>
          <p className="text-gray-500 text-sm mt-2">Tell us a bit about yourself to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company / Brand Name</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Acme Co."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Role</label>
            <input
              type="text"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Creative Director"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-md font-medium hover:bg-gray-800 transition-colors flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Start Creating"}
          </button>
        </form>
      </div>
    </div>
  );
}

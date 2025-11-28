'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Folder as FolderIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Folder } from '@/types';

interface FolderWithCount extends Folder {
  folder_items: { count: number }[];
}

export default function FoldersPage() {
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('folders')
      .select('*, folder_items(count)')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      // @ts-ignore
      setFolders(data);
    }
    setLoading(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (newFolderName.includes(' ')) {
        alert("Folder names cannot contain spaces.");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('folders')
      .insert({ name: newFolderName, user_id: user.id })
      .select()
      .single();

    if (data) {
      // @ts-ignore
      setFolders([{ ...data, folder_items: [{ count: 0 }] }, ...folders]);
      setNewFolderName('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Your Folders</h1>
                <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">Back to Studio</button>
            </div>

            {/* Create Folder */}
            <form onSubmit={handleCreateFolder} className="flex gap-2 mb-10 max-w-md">
                <input 
                    type="text" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value.replace(/\s/g, ''))}
                    placeholder="NewFolder (No Spaces)"
                    className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button type="submit" className="bg-black text-white px-4 rounded-lg hover:bg-gray-800 transition-colors">
                    <Plus />
                </button>
            </form>

            {/* Folder Grid */}
            {loading ? (
                <div className="text-gray-500">Loading folders...</div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {folders.map(folder => (
                        <div 
                            key={folder.id} 
                            onClick={() => router.push(`/folders/${folder.id}`)}
                            className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group"
                        >
                            <FolderIcon className="w-10 h-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                            <h3 className="font-semibold text-lg">{folder.name}</h3>
                            <p className="text-sm text-gray-500">
                                {folder.folder_items?.[0]?.count || 0} items
                            </p>
                        </div>
                    ))}
                </div>
            )}

             {folders.length === 0 && !loading && (
                <div className="text-center py-20 text-gray-400">
                    No folders yet. Create one to get started!
                </div>
            )}
        </div>
    </div>
  );
}

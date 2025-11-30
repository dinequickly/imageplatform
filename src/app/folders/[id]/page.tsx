'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Upload, Image as ImageIcon, Edit3, Trash2, X } from 'lucide-react';
import { Folder, FolderItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export default function FolderDetailPage() {
  const { id } = useParams(); // folder id
  const router = useRouter();
  const supabase = createClient();
  
  const [folder, setFolder] = useState<Folder | null>(null);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Upload State
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit State
  const [editingItem, setEditingItem] = useState<FolderItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (id) {
      fetchFolderData();
    }
  }, [id]);

  // Revoke object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
        if (uploadPreviewUrl) {
            URL.revokeObjectURL(uploadPreviewUrl);
        }
    }
  }, [uploadPreviewUrl]);

  const fetchFolderData = async () => {
    setLoading(true);
    // Fetch Folder Details
    const { data: folderData } = await supabase
      .from('folders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (folderData) setFolder(folderData);

    // Fetch Items
    const { data: itemsData } = await supabase
      .from('folder_items')
      .select('*')
      .eq('folder_id', id)
      .order('created_at', { ascending: false });
      
    if (itemsData) setItems(itemsData);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadFile(file);
      const url = URL.createObjectURL(file);
      setUploadPreviewUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !id) return;
    setUploading(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Upload to Storage
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `folder_${id}/${uuidv4()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('uploads') // Using same bucket as main chat
            .upload(fileName, uploadFile);
            
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        // 2. Insert into DB
        const { data: newItem, error: dbError } = await supabase
            .from('folder_items')
            .insert({
                folder_id: id,
                image_url: publicUrl,
                title: uploadTitle,
                description: uploadDesc
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // 3. Send to image webhook
        await fetch('https://maxipad.app.n8n.cloud/webhook/7650610d-5a8d-41fe-b111-5f6bfa21d436', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl: publicUrl,
                userId: user.id,
                sessionId: null, // No session context for folder uploads
                fileName: uploadFile.name,
                context: 'folder_upload',
                folderId: id,
                folderName: folder?.name,
                folderItemId: newItem.id,
                title: uploadTitle,
                description: uploadDesc,
                timestamp: new Date().toISOString()
            })
        });

        // 4. Update State
        if (newItem) setItems([newItem, ...items]);
        
        // Reset Form
        setUploadFile(null);
        setUploadPreviewUrl(null);
        setUploadTitle('');
        setUploadDesc('');
        setShowUploadModal(false);

    } catch (error) {
        console.error('Error uploading:', error);
        alert('Failed to upload item.');
    } finally {
        setUploading(false);
    }
  };

  const handleEditClick = (item: FolderItem) => {
      setEditingItem(item);
      setEditTitle(item.title || '');
      setEditDesc(item.description || '');
  };

  const handleUpdateItem = async () => {
      if (!editingItem) return;
      setIsSavingEdit(true);

      const { data, error } = await supabase
          .from('folder_items')
          .update({ title: editTitle, description: editDesc })
          .eq('id', editingItem.id)
          .select()
          .single();
      
      if (error) {
          alert('Failed to update item');
          console.error(error);
      } else if (data) {
          setItems(items.map(i => i.id === data.id ? data : i));
          setEditingItem(null);
      }
      setIsSavingEdit(false);
  };

  const handleDeleteItem = async (itemId: string) => {
      if (!confirm('Are you sure you want to delete this item?')) return;

      const { error } = await supabase
          .from('folder_items')
          .delete()
          .eq('id', itemId);
      
      if (error) {
          alert('Failed to delete item');
          console.error(error);
      } else {
          setItems(items.filter(i => i.id !== itemId));
      }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!folder) return <div className="p-8 text-center">Folder not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/folders')} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{folder.name}</h1>
                        {folder.description && <p className="text-gray-500">{folder.description}</p>}
                    </div>
                </div>
                <button 
                    onClick={() => setShowUploadModal(true)}
                    className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                    <Plus size={18} /> Add Item
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {items.map(item => (
                    <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow flex flex-col">
                        <div className="aspect-square bg-gray-100 relative overflow-hidden group-hover:opacity-90 transition-opacity">
                            <img src={item.image_url} alt={item.title || 'Item'} className="w-full h-full object-cover" />
                            
                            {/* Overlay Actions */}
                            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(item); }}
                                    className="p-2 bg-white/90 rounded-full shadow-sm hover:bg-white text-gray-700"
                                    title="Edit"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                    className="p-2 bg-white/90 rounded-full shadow-sm hover:bg-red-50 text-red-500"
                                    title="Delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-semibold text-gray-900 truncate">{item.title || 'Untitled'}</h3>
                            {item.description && <p className="text-sm text-gray-500 line-clamp-2 mt-1">{item.description}</p>}
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-400">
                        This folder is empty. Add some items!
                    </div>
                )}
            </div>
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                    <h2 className="text-xl font-bold mb-4">Add to Folder</h2>
                    
                    <div className="space-y-4">
                        {/* File Input */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors relative overflow-hidden group"
                        >
                            {uploadPreviewUrl ? (
                                <div className="relative w-full h-48">
                                     <img src={uploadPreviewUrl} alt="Preview" className="w-full h-full object-contain" />
                                     <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <span className="bg-white px-3 py-1 rounded-full text-xs font-medium shadow-sm">Change Image</span>
                                     </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-gray-500 py-8">
                                    <Upload className="w-8 h-8 mb-2" />
                                    <span className="text-sm">Click to upload image</span>
                                </div>
                            )}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileSelect} 
                                className="hidden" 
                                accept="image/*"
                            />
                        </div>

                        {/* Metadata Inputs */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input 
                                type="text" 
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. Living Room Vibe"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea 
                                value={uploadDesc}
                                onChange={(e) => setUploadDesc(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                rows={3}
                                placeholder="Add some details..."
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={() => setShowUploadModal(false)}
                                className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleUpload}
                                disabled={!uploadFile || uploading}
                                className="flex-1 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploading ? 'Uploading...' : 'Save Item'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Edit Modal */}
        {editingItem && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold">Edit Item</h2>
                        <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
                            <img src={editingItem.image_url} alt="Preview" className="w-full h-full object-contain" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input 
                                type="text" 
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea 
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                rows={3}
                            />
                        </div>

                        <div className="flex gap-3 mt-6">
                             <button 
                                onClick={() => setEditingItem(null)}
                                className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleUpdateItem}
                                disabled={isSavingEdit}
                                className="flex-1 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {isSavingEdit ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
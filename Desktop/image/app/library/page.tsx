'use client'

import React, { useState, useEffect } from 'react'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'
import { supabase } from '@/lib/supabaseClient'
import FileUploader from '@/components/FileUploader'
import Link from 'next/link'
import { ArrowLeft, Search, Image as ImageIcon, Loader2, Upload } from 'lucide-react'
import { getOrCreateDefaultFolderId } from '@/lib/library'

interface LibraryItem {
  id: string
  image_url: string
  title: string | null
  created_at: string
}

export default function LibraryPage() {
  const { user, loading: userLoading, error: userError } = useSupabaseUser()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [fetching, setFetching] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null)

  async function fetchLibraryItems(userId: string) {
    setFetching(true)
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', userId)

    if (foldersError) {
      console.error('Error fetching folders:', foldersError)
      setFetching(false)
      return
    }

    const folderIds = (folders ?? [])
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        if (!('id' in row)) return null
        const id = (row as { id?: unknown }).id
        return typeof id === 'string' ? id : null
      })
      .filter((id): id is string => typeof id === 'string')

    if (folderIds.length === 0) {
      setItems([])
      setFetching(false)
      return
    }

    const { data, error } = await supabase
      .from('folder_items')
      .select('id, image_url, title, created_at')
      .in('folder_id', folderIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching library:', error)
    } else {
      setItems(data || [])
    }
    setFetching(false)
  }

  useEffect(() => {
    if (!user?.id) return
    ;(async () => {
      try {
        const folderId = await getOrCreateDefaultFolderId(user.id)
        setDefaultFolderId(folderId)
        await fetchLibraryItems(user.id)
      } catch (e) {
        console.error('Failed to initialize library folder:', e)
      }
    })()
  }, [user?.id])

  const filteredItems = items.filter(item => 
    item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    !searchQuery
  )

  if (userLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-gray-200 pb-6">
          <Link href="/" className="flex items-center text-sm text-gray-500 hover:text-gray-900 w-fit">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Vibe Board
          </Link>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Library</h1>
                <p className="text-gray-500">Manage your assets and uploads.</p>
            </div>
            
            {/* Search Bar */}
            <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-black focus:border-black sm:text-sm"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>
        </header>

        {/* Upload Section */}
        <section>
             <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Upload className="w-5 h-5" /> Upload New
             </h2>
             {user?.id && defaultFolderId && (
                <FileUploader 
                    folderId={defaultFolderId}
                    userId={user.id}
                    onUploadComplete={() => fetchLibraryItems(user.id)} 
                />
             )}
             {userError && (
               <p className="mt-2 text-sm text-red-600">{userError}</p>
             )}
        </section>

        {/* Folders (Placeholder for now) */}
        {/* 
        <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Folder className="w-5 h-5" /> Folders
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center justify-center h-32 cursor-pointer hover:bg-gray-50">
                    <Folder className="w-10 h-10 text-yellow-400 mb-2" />
                    <span className="text-sm font-medium">All Uploads</span>
                </div>
                 <div className="bg-white p-4 rounded-lg border border-2 border-dashed border-gray-300 shadow-sm flex flex-col items-center justify-center h-32 cursor-pointer hover:bg-gray-50 text-gray-400 hover:text-gray-600">
                    <Plus className="w-8 h-8 mb-1" />
                    <span className="text-xs font-medium">New Folder</span>
                </div>
            </div>
        </section>
        */}

        {/* Image Grid */}
        <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" /> Recent Uploads
            </h2>
            
            {fetching ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin h-8 w-8 text-gray-400" />
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
                    <p>{searchQuery ? 'No images match your search.' : 'No images in library yet.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {filteredItems.map((item) => (
                        <Link key={item.id} href={`/editor/${item.id}`} className="group block relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow">
                            <img
                                src={item.image_url}
                                alt={item.title || 'Library Item'}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-white text-xs truncate">{item.title || 'Untitled'}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </section>

      </div>
    </main>
  )
}

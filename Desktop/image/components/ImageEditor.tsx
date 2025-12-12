'use client'

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/hooks/useSession'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'
import { getOrCreateDefaultFolderId } from '@/lib/library'
import CanvasLayer, { CanvasLayerRef } from './CanvasLayer'
import { ArrowLeft, Eraser, Wand2, Save, Loader2, X, Plus, RefreshCw, Scissors, Paintbrush, Brain } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ImageEditorProps {
  imageId: string
}

type ImageSource = 'mood_board_items' | 'folder_items'

interface ImageDetails {
  id: string
  image_url: string
  name: string | null
  description: string | null
  source: ImageSource
  session_id?: string | null
  folder_id?: string | null
}

export default function ImageEditor({ imageId }: ImageEditorProps) {
  const router = useRouter()
  const { sessionId } = useSession()
  const { user } = useSupabaseUser()
  const [image, setImage] = useState<ImageDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingMeta, setSavingMeta] = useState(false)
  
  // Editor State
  const [toolMode, setToolMode] = useState<'brush' | 'lasso' | 'sam'>('brush')
  const [brushSize, setBrushSize] = useState(20)
  const [prompt, setPrompt] = useState('')
  const [samPrompt, setSamPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Metadata State
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const canvasRef = useRef<CanvasLayerRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 512, height: 512 })

  useEffect(() => {
    fetchImage()
  }, [imageId])

  async function fetchImage() {
    setLoading(true)
    const { data: boardData, error: boardError } = await supabase
      .from('mood_board_items')
      .select('id, image_url, name, description, session_id, folder_id')
      .eq('id', imageId)
      .maybeSingle()

    if (boardError) {
      console.error('Error fetching mood board item:', boardError)
    }

    if (boardData) {
      setImage({
        ...boardData,
        source: 'mood_board_items',
        session_id: boardData.session_id,
        folder_id: boardData.folder_id,
      })
      setName(boardData.name || '')
      setDescription(boardData.description || '')
      setLoading(false)
      return
    }

    const { data: libraryData, error: libraryError } = await supabase
      .from('folder_items')
      .select('id, image_url, title, description, folder_id')
      .eq('id', imageId)
      .maybeSingle()

    if (libraryError) {
      console.error('Error fetching folder item:', libraryError)
    } else if (libraryData) {
      setImage({
        id: libraryData.id,
        image_url: libraryData.image_url,
        name: libraryData.title,
        description: libraryData.description,
        source: 'folder_items',
        folder_id: libraryData.folder_id,
      })
      setName(libraryData.title || '')
      setDescription(libraryData.description || '')
    }
    setLoading(false)
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current
        setDimensions({ width: clientWidth, height: clientHeight })
    }
  }

  async function saveMetadata() {
    if (!imageId) return
    setSavingMeta(true)
    const table = image?.source === 'folder_items' ? 'folder_items' : 'mood_board_items'
    const update =
      table === 'folder_items'
        ? { title: name, description }
        : { name, description }
    const { error } = await supabase.from(table).update(update).eq('id', imageId)

    if (error) {
      console.error('Error updating metadata:', error)
      alert('Failed to save metadata.')
    } 
    setSavingMeta(false)
  }

  async function handleSAMSegment() {
    if (!samPrompt || !image) return
    setIsProcessing(true)
    
    try {
        // 1. Fetch Blob
        const res = await fetch(image.image_url)
        const blob = await res.blob()
        
        // 2. Prepare Form Data
        const formData = new FormData()
        formData.append('file', blob, 'image.png')
        formData.append('prompt', samPrompt)
        
        // 3. Call FastAPI
        const apiRes = await fetch('http://localhost:8000/segment', {
            method: 'POST',
            body: formData
        })
        
        const data = await apiRes.json()
        
        if (data.success && data.masks) {
            // 4. Draw masks
            data.masks.forEach((maskBase64: string) => {
                canvasRef.current?.drawBase64Mask(maskBase64)
            })
            setSamPrompt('') // Clear prompt on success
        } else {
            console.error('SAM Error:', data)
            alert('Failed to segment objects. Ensure backend is running.')
        }
        
    } catch (err) {
        console.error('SAM Request failed:', err)
        alert('Could not connect to SAM server at localhost:8000')
    } finally {
        setIsProcessing(false)
    }
  }

  async function handleGenerate(overridePrompt?: string) {
      const finalPrompt = overridePrompt || prompt
      if (!finalPrompt) return
      
      setIsProcessing(true)
      setGeneratedImage(null)

      try {
        const mask = canvasRef.current?.getMaskDataURL() || null
        
        let imageBase64 = null
        if (image?.image_url) {
            const response = await fetch(image.image_url)
            const blob = await response.blob()
            imageBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
            })
        }

        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: finalPrompt,
                mask,
                image: imageBase64,
                model: 'gemini-3-pro-image-preview'
            })
        })

        const data = await response.json()
        
        if (data.success && data.imageData) {
            setGeneratedImage(data.imageData)
        } else if (data.error) {
            alert(`Error: ${data.details || data.error}`)
        } else {
            alert('Unknown error occurred or no image returned.')
        }

      } catch (err) {
          console.error('Generation failed:', err)
          alert('Failed to generate edit.')
      } finally {
        setIsProcessing(false)
      }
  }

  const clearMask = () => {
    canvasRef.current?.clear()
  }

  async function uploadBase64Image(base64Data: string, pathPrefix: string) {
    const res = await fetch(base64Data)
    const blob = await res.blob()
    const fileExt = 'png'
    const fileName = `${pathPrefix}/${Math.random()}.${fileExt}`
    
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, blob)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName)
      
    return publicUrl
  }

  async function getTargetFolderId() {
    if (image?.folder_id) return image.folder_id
    if (!user?.id) return null
    return await getOrCreateDefaultFolderId(user.id)
  }

  async function getNextOrderIndex(targetSessionId: string) {
    const { data } = await supabase
      .from('mood_board_items')
      .select('order_index')
      .eq('session_id', targetSessionId)

    const orderIndexes = (data ?? [])
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        if (!('order_index' in row)) return null
        const value = (row as { order_index?: unknown }).order_index
        return typeof value === 'number' ? value : null
      })
      .filter((n): n is number => typeof n === 'number')

    return orderIndexes.length > 0 ? Math.max(...orderIndexes) + 1 : 0
  }

  async function handleAddToBoard() {
      if (!generatedImage || !image) return
      const targetSessionId = image.session_id ?? sessionId
      if (!targetSessionId) {
        alert('No active vibe board session.')
        return
      }
      setActionLoading(true)
      try {
          const folderId = await getTargetFolderId()
          const pathPrefix = user?.id && folderId ? `${user.id}/${folderId}` : targetSessionId
          const publicUrl = await uploadBase64Image(generatedImage, pathPrefix)

          if (folderId && user?.id) {
            const { error: libErr } = await supabase.from('folder_items').insert({
              folder_id: folderId,
              image_url: publicUrl,
              title: `${name} (Edit)`,
              description: `Edit of ${name}: ${prompt}`,
              added_by: user.id,
            })
            if (libErr) console.error('Failed to add edited image to library:', libErr)
          }
          
          const newOrder = await getNextOrderIndex(targetSessionId)

          const { error } = await supabase
            .from('mood_board_items')
            .insert({
                session_id: targetSessionId,
                image_url: publicUrl,
                order_index: newOrder,
                is_curated: false,
                name: `${name} (Edit)`,
                description: `Edit of ${name}: ${prompt}`,
                added_by: user?.id ?? null,
                folder_id: folderId,
            })

          if (error) throw error
          
          alert('Added to Vibe Board!')
          setGeneratedImage(null)
      } catch (err) {
          console.error('Failed to add to board', err)
          alert('Failed to add image to board.')
      } finally {
          setActionLoading(false)
      }
  }

  async function handleReplacePhoto() {
      if (!generatedImage || !image) return
      setActionLoading(true)
      try {
          const folderId = await getTargetFolderId()
          const pathPrefix = user?.id && folderId ? `${user.id}/${folderId}` : (image.session_id || sessionId || 'uploads')
          const publicUrl = await uploadBase64Image(generatedImage, pathPrefix)
          
          if (image.source === 'folder_items') {
            const { error } = await supabase
              .from('folder_items')
              .update({
                image_url: publicUrl,
                description: description ? `${description}\n\nLast Edit: ${prompt}` : `Edit: ${prompt}`,
              })
              .eq('id', image.id)
            if (error) throw error
          } else {
            const { error } = await supabase
              .from('mood_board_items')
              .update({
                  image_url: publicUrl,
                  description: description ? `${description}\n\nLast Edit: ${prompt}` : `Edit: ${prompt}`
              })
              .eq('id', image.id)
            if (error) throw error
          }

          alert('Photo Replaced!')
          setGeneratedImage(null)
          fetchImage()
          clearMask()
          setPrompt('')
      } catch (err) {
          console.error('Failed to replace photo', err)
          alert('Failed to replace photo.')
      } finally {
          setActionLoading(false)
      }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>
  if (!image) return <div className="p-8">Image not found</div>

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden relative">
      
      {/* Generated Image Modal */}
      {generatedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <div className="bg-white rounded-lg p-4 max-w-4xl w-full flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
                <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-lg font-semibold">Generated Result</h3>
                    <button onClick={() => setGeneratedImage(null)} className="text-gray-500 hover:text-black">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-hidden flex justify-center bg-gray-100 rounded border border-gray-200">
                    <img src={generatedImage} alt="Generated" className="max-h-[70vh] object-contain" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                     <button 
                        onClick={() => setGeneratedImage(null)}
                        disabled={actionLoading}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                        Discard
                    </button>
                    <button 
                        onClick={handleAddToBoard}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add to Board
                    </button>
                    <button 
                        onClick={handleReplacePhoto}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                         {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Replace Original
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* LEFT SIDEBAR: Metadata */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <Link href="/" className="flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Board
          </Link>
        </div>
        
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              placeholder="e.g. Summer Vibe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              placeholder="Add details about this image..."
            />
          </div>

          <button 
            onClick={saveMetadata}
            disabled={savingMeta}
            className="flex items-center justify-center w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {savingMeta ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Details
          </button>
        </div>
      </div>

      {/* CENTER: Image Canvas */}
      <div className="flex-1 bg-gray-100 flex items-center justify-center p-8 relative overflow-hidden">
        <div 
            ref={containerRef}
            className="relative shadow-2xl rounded-lg overflow-hidden bg-white max-h-[80vh] max-w-[80vw]"
            style={{ aspectRatio: 'auto' }} 
        > 
          {/* Base Image */}
          <img 
            src={image.image_url} 
            alt={image.name || 'Edit Target'} 
            crossOrigin="anonymous"
            className="block max-h-[80vh] w-auto h-auto object-contain pointer-events-none select-none"
            onLoad={handleImageLoad}
            ref={(el) => {
                if (el && containerRef.current && (el.width !== dimensions.width || el.height !== dimensions.height)) {
                    setDimensions({ width: el.width, height: el.height })
                }
            }}
          />
          
          {/* Drawing Layer */}
          <CanvasLayer 
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            brushSize={brushSize}
            mode={toolMode === 'sam' ? 'brush' : toolMode} // If in SAM mode, canvas interaction is disabled or regular cursor
            className={`absolute top-0 left-0 ${toolMode === 'sam' ? 'cursor-default' : 'cursor-crosshair'} opacity-70`}
          />
        </div>

        {/* Floating Controls for Canvas */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg flex items-center gap-4 border border-gray-200 z-20">
             
             {/* Tool Switcher */}
             <div className="flex bg-gray-200 rounded-full p-1">
                 <button
                    onClick={() => setToolMode('brush')}
                    className={`p-2 rounded-full transition-colors ${toolMode === 'brush' ? 'bg-white shadow' : 'text-gray-500 hover:text-black'}`}
                    title="Brush Tool"
                 >
                    <Paintbrush className="w-4 h-4" />
                 </button>
                 <button
                    onClick={() => setToolMode('lasso')}
                    className={`p-2 rounded-full transition-colors ${toolMode === 'lasso' ? 'bg-white shadow' : 'text-gray-500 hover:text-black'}`}
                    title="Lasso Selection"
                 >
                    <Scissors className="w-4 h-4" />
                 </button>
                 <button
                    onClick={() => setToolMode('sam')}
                    className={`p-2 rounded-full transition-colors ${toolMode === 'sam' ? 'bg-white shadow' : 'text-gray-500 hover:text-black'}`}
                    title="AI Segmentation (SAM)"
                 >
                    <Brain className="w-4 h-4" />
                 </button>
             </div>
             
             {/* Dynamic Content based on Tool */}
             {toolMode === 'brush' && (
                 <div className="flex items-center gap-3 border-l pl-4 border-gray-300">
                    <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={brushSize} 
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                 </div>
             )}

             {toolMode === 'sam' && (
                 <div className="flex items-center gap-2 border-l pl-4 border-gray-300">
                    <input 
                        type="text" 
                        placeholder="cat, dog, car..."
                        value={samPrompt}
                        onChange={(e) => setSamPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSAMSegment()}
                        className="w-48 px-2 py-1 text-sm border border-gray-300 rounded focus:border-black focus:outline-none bg-white"
                        autoFocus
                    />
                    <button 
                        onClick={handleSAMSegment}
                        disabled={isProcessing || !samPrompt}
                        className="bg-black text-white text-xs px-2 py-1.5 rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
                    </button>
                 </div>
             )}

             <div className="h-6 w-px bg-gray-300 mx-2"></div>
             
             <button 
                onClick={clearMask}
                className="text-gray-600 hover:text-red-600 transition-colors flex items-center gap-2 text-sm font-medium pr-4"
             >
                <Eraser className="w-4 h-4" /> Clear
             </button>
        </div>
      </div>

      {/* RIGHT SIDEBAR: Prompting */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col z-10 shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">Edit Instruction</h3>
        <p className="text-sm text-gray-500 mb-4">
            {toolMode === 'lasso' ? "Circle an object to select it." : 
             toolMode === 'sam' ? "Use AI to auto-segment objects by name." :
             "Paint over an area to mask it."}
        </p>

        <div className="flex-1">
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border resize-none"
                placeholder={toolMode === 'lasso' ? "Describe what to do with the selection..." : "e.g. Replace with a snowy mountain..."}
            />
        </div>

        <div className="space-y-3 mt-4">
            <button
                onClick={() => handleGenerate()}
                disabled={!prompt || isProcessing}
                className={`w-full py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all
                    ${!prompt || isProcessing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'}
                `}
            >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 className="w-5 h-5" />}
                Generate Edit
            </button>
            
            {toolMode === 'lasso' && (
                <button
                    onClick={() => {
                        const bgPrompt = "Remove the background of the masked object, keep the object on a transparent background"
                        setPrompt(bgPrompt)
                        handleGenerate(bgPrompt)
                    }}
                    disabled={isProcessing}
                    className="w-full py-3 px-4 rounded-lg border-2 border-black text-black font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                >
                    <Scissors className="w-4 h-4" />
                    Remove Background
                </button>
            )}
        </div>
      </div>
    </div>
  )
}

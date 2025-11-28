'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { MoodBoardItem } from '@/types';

interface Props {
  id: string;
  item: MoodBoardItem;
  folders?: { id: string; name: string }[]; // New prop
  onRemove: (id: string) => void;
  onUpdateName?: (id: string, name: string) => void;
  onMoveToFolder?: (id: string, folderId: string) => void; // New prop
}

export function SortableMoodItem({ id, item, folders, onRemove, onUpdateName, onMoveToFolder }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative group mb-4 break-inside-avoid bg-gray-200 rounded-lg overflow-hidden shadow-sm cursor-move touch-none"
    >
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
        @{item.orderIndex !== undefined ? item.orderIndex + 1 : '?'}
      </div>
      
      {/* Name Editor */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 translate-y-full group-hover:translate-y-0 transition-transform z-20 flex flex-col gap-1">
         <input 
            type="text"
            defaultValue={item.name || `image-${(item.orderIndex||0)+1}`}
            onBlur={(e) => onUpdateName?.(item.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-white text-xs outline-none border-b border-white/30 focus:border-white"
         />
         {/* Folder Selector */}
         {folders && folders.length > 0 && (
             <select
                defaultValue=""
                onChange={(e) => onMoveToFolder?.(item.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full bg-transparent text-white text-xs outline-none border-b border-white/30 focus:border-white mt-1"
             >
                 <option value="" className="text-black">Move to Folder...</option>
                 {folders.map(f => (
                     <option key={f.id} value={f.id} className="text-black">{f.name}</option>
                 ))}
             </select>
         )}
      </div>

      <img
        src={item.imageUrl}
        alt="Mood board item"
        className="w-full h-auto object-cover pointer-events-none"
      />
      <button
        onPointerDown={(e) => e.stopPropagation()} // specific for dnd-kit
        onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Deleting item:', item.id);
            onRemove(item.id);
        }}
        className="absolute top-2 right-2 z-50 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 cursor-pointer"
      >
        <X size={16} />
      </button>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableMoodItem } from './SortableMoodItem';
import { MoodBoardItem, FolderWithItems } from '@/types';

interface Props {
  items: MoodBoardItem[];
  folders?: FolderWithItems[];
  onItemsChange: (items: MoodBoardItem[]) => void;
  onUpdateName?: (id: string, name: string) => void;
  onMoveToFolder?: (id: string, folderId: string) => void;
  onFileUpload?: (file: File) => void;
  onEdit?: (item: MoodBoardItem) => void;
}

export default function MoodBoard({ items, folders, onItemsChange, onUpdateName, onMoveToFolder, onFileUpload, onEdit }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      onItemsChange(arrayMove(items, oldIndex, newIndex));
    }
  }

  const handleRemove = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
  };

  // File Drop Handlers
  const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/') && onFileUpload) {
              onFileUpload(file);
          }
      }
  };

  return (
    <div 
        className={`p-4 bg-gray-50 border-b border-gray-200 min-h-[200px] transition-colors ${isDragOver ? 'bg-blue-50 border-blue-300' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
    >
      <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">
        Vibe Anchor {isDragOver && <span className="text-blue-600 ml-2">- Drop to Upload</span>}
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="columns-2 md:columns-3 gap-4 space-y-4">
            {items.map((item) => (
              <SortableMoodItem
                key={item.id}
                id={item.id}
                item={item}
                folders={folders}
                onRemove={handleRemove}
                onUpdateName={onUpdateName}
                onMoveToFolder={onMoveToFolder}
                onEdit={onEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {items.length === 0 && !isDragOver && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            No mood board items yet. Drag images here or describe your brand.
        </div>
      )}
    </div>
  );
}

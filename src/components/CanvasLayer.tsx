'use client';

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

interface CanvasLayerProps {
  width: number;
  height: number;
  brushSize: number;
  isDrawingMode: boolean;
  onDrawStart?: () => void;
  onDrawEnd?: () => void;
}

export interface CanvasLayerRef {
  getMask: () => string | null; // Returns base64 data URL of Binary Mask (B&W)
  getTransparentLayer: () => string | null; // Returns base64 data URL of Visible Strokes (Transparent)
  clear: () => void;
  hasMask: () => boolean;
  drawMask: (maskDataUrl: string) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Path {
  points: Point[];
  brushSize: number;
}

const CanvasLayer = forwardRef<CanvasLayerRef, CanvasLayerProps>(
  ({ width, height, brushSize, isDrawingMode, onDrawStart, onDrawEnd }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [paths, setPaths] = useState<Path[]>([]);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);
    const [externalMask, setExternalMask] = useState<HTMLImageElement | null>(null);
    const isDrawingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getMask: () => {
        if (paths.length === 0 && !externalMask) return null;

        // Create an offscreen canvas to generate the binary mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return null;

        // 1. Fill background with Black
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        // 2. Draw external mask if exists (assume it's white or colored on transparent)
        if (externalMask) {
            ctx.drawImage(externalMask, 0, 0, width, height);
            // Ensure it's white for the mask
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
        }

        // 3. Draw paths with White
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'white';

        paths.forEach((path) => {
          if (path.points.length < 1) return;
          ctx.lineWidth = path.brushSize;
          ctx.beginPath();
          ctx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x, path.points[i].y);
          }
          ctx.stroke();
        });

        return maskCanvas.toDataURL('image/png');
      },
      getTransparentLayer: () => {
          // Returns the current canvas state (strokes on transparent bg)
          if (!canvasRef.current || (paths.length === 0 && !externalMask)) return null;
          return canvasRef.current.toDataURL('image/png');
      },
      clear: () => {
        setPaths([]);
        setExternalMask(null);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
      hasMask: () => paths.length > 0 || !!externalMask,
      drawMask: (maskDataUrl: string) => {
          const img = new Image();
          img.onload = () => {
              setExternalMask(img);
          };
          img.src = maskDataUrl;
      }
    }));

    // Re-draw visible canvas when paths change
    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, width, height);
      
      // Draw External Mask
      if (externalMask) {
          ctx.drawImage(externalMask, 0, 0, width, height);
      }

      // Visual Style: Semi-transparent Neon Green
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)'; // Neon Green 50% opacity

      // Draw saved paths
      paths.forEach((path) => {
        if (path.points.length < 1) return;
        ctx.lineWidth = path.brushSize;
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      });

      // Draw current path being drawn
      if (currentPath.length > 0) {
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        ctx.stroke();
      }

    }, [paths, currentPath, width, height, brushSize, externalMask]);

    const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        return {
            x: (clientX - rect.left) * (width / rect.width),
            y: (clientY - rect.top) * (height / rect.height)
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingMode) return;
      e.preventDefault(); // Prevent scrolling on touch
      isDrawingRef.current = true;
      const { x, y } = getCoords(e);
      setCurrentPath([{ x, y }]);
      if (onDrawStart) onDrawStart();
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingRef.current || !isDrawingMode) return;
      e.preventDefault();
      const { x, y } = getCoords(e);
      setCurrentPath((prev) => [...prev, { x, y }]);
    };

    const stopDrawing = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      if (currentPath.length > 0) {
        setPaths((prev) => [...prev, { points: currentPath, brushSize }]);
      }
      setCurrentPath([]);
      if (onDrawEnd) onDrawEnd();
    };

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`absolute inset-0 w-full h-full touch-none ${isDrawingMode ? 'cursor-crosshair' : 'cursor-default'}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    );
  }
);

CanvasLayer.displayName = 'CanvasLayer';

export default CanvasLayer;

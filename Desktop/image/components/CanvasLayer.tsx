'use client'

import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

interface CanvasLayerProps {
  width: number
  height: number
  brushSize: number
  mode: 'brush' | 'lasso'
  className?: string
}

export interface CanvasLayerRef {
  getMaskDataURL: () => string | null
  clear: () => void
  drawBase64Mask: (base64: string) => void
}

const CanvasLayer = forwardRef<CanvasLayerRef, CanvasLayerProps>(({ width, height, brushSize, mode, className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null)

  useImperativeHandle(ref, () => ({
    getMaskDataURL: () => {
      if (!canvasRef.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
    clear: () => {
      const ctx = ctxRef.current
      const canvas = canvasRef.current
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
    drawBase64Mask: (base64: string) => {
        const ctx = ctxRef.current
        const canvas = canvasRef.current
        if (!ctx || !canvas) return
        const img = new Image()
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
    }
  }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = 'rgba(255, 255, 255, 1)'
    context.fillStyle = 'rgba(255, 255, 255, 1)'
    
    ctxRef.current = context
  }, [])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.lineWidth = mode === 'lasso' ? 2 : brushSize
  }, [brushSize, mode])

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    let clientX, clientY

    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = (e as React.MouseEvent).clientX
      clientY = (e as React.MouseEvent).clientY
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    
    const ctx = ctxRef.current
    if (!ctx) return
    const { x, y } = getCoords(e)
    
    ctx.beginPath()
    ctx.moveTo(x, y)
    
    if (mode === 'brush') {
        ctx.lineTo(x, y)
        ctx.stroke()
    }
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    
    const ctx = ctxRef.current
    if (ctx) {
        if (mode === 'lasso') {
            ctx.closePath()
            ctx.fill() // Fill the lasso shape
            ctx.stroke() // Draw boundary
        }
        ctx.beginPath()
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current
    if (!isDrawing || !ctx) return

    const { x, y } = getCoords(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e)
    setMousePos({ x, y })
    if (isDrawing) draw(e)
  }

  return (
    <div className={`relative ${className}`} style={{ width, height, touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`w-full h-full ${mode === 'lasso' ? 'cursor-crosshair' : 'cursor-none'}`}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing} 
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setMousePos(null)}
        
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={draw}
      />
      {/* Only show brush cursor in brush mode */}
      {mousePos && mode === 'brush' && (
        <div 
          className="pointer-events-none absolute border border-white rounded-full bg-white/20 backdrop-invert"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            width: brushSize,
            height: brushSize,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  )
})

CanvasLayer.displayName = 'CanvasLayer'

export default CanvasLayer

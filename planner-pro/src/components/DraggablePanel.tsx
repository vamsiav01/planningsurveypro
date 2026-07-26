"use client";

import { useState, useEffect, useRef } from "react";

interface DraggablePanelProps {
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  className?: string;
}

export default function DraggablePanel({ children, initialPosition = { x: 0, y: 0 }, className = "" }: DraggablePanelProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow dragging if the target has the 'drag-handle' class or is a descendant of one
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle')) {
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
      if (panelRef.current) {
        panelRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (panelRef.current) {
      panelRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        position: 'absolute',
        touchAction: 'none'
      }}
      className={`pointer-events-auto ${className}`}
    >
      {children}
    </div>
  );
}

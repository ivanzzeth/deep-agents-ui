"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { createPortal } from "react-dom";

export interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  src,
  alt = "Image preview",
  open,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });

  // Reset state when opened
  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) resetView();
  }, [open, resetView]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Prevent background scrolling
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = src;
    link.download = alt || "image";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, alt]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      positionStart.current = { ...position };
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: positionStart.current.x + dx,
        y: positionStart.current.y + dy,
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta)));
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Toolbar */}
      <div className="fixed left-1/2 top-4 z-[10000] flex -translate-x-1/2 items-center gap-1 rounded-lg bg-gray-900/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
          onClick={handleZoomOut}
          disabled={scale <= MIN_SCALE}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs text-white/70">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
          onClick={handleZoomIn}
          disabled={scale >= MAX_SCALE}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <button
          type="button"
          className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={resetView}
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={handleDownload}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <button
          type="button"
          className="rounded p-1.5 text-white/80 hover:bg-red-500/80 hover:text-white"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image container */}
      <div
        className="flex h-full w-full items-center justify-center"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] select-none object-contain"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
          draggable={false}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

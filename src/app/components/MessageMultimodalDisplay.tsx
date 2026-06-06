"use client";

import React, { useState, useCallback } from "react";
import { File, Download } from "lucide-react";
import { ContentBlock } from "@langchain/core/messages";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ImagePreviewModal } from "./ImagePreviewModal";

export interface MessageMultimodalDisplayProps {
  block: ContentBlock.Multimodal.Data;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Download a base64-encoded PDF as a file.
 */
function downloadPdf(base64: string, filename: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * MessageMultimodalDisplay — interactive display for multimodal content in
 * rendered chat messages. Supports:
 * - Image: click to open full-size preview modal
 * - PDF: download button
 */
export const MessageMultimodalDisplay: React.FC<
  MessageMultimodalDisplayProps
> = ({ block, className, size = "md" }) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleImageClick = useCallback(() => {
    setPreviewOpen(true);
  }, []);

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  // Image block
  if (
    block.type === "image" &&
    typeof block.mimeType === "string" &&
    block.mimeType.startsWith("image/")
  ) {
    const url = `data:${block.mimeType};base64,${block.data}`;
    let imgClass = "rounded-md object-cover h-16 w-16";
    if (size === "sm") imgClass = "rounded-md object-cover h-10 w-10";
    if (size === "lg") imgClass = "rounded-md object-cover h-24 w-24";

    return (
      <>
        <button
          type="button"
          className={cn(
            "group/img relative inline-block cursor-pointer overflow-hidden rounded-md transition-shadow hover:shadow-md hover:ring-2 hover:ring-blue-400/50",
            className
          )}
          onClick={handleImageClick}
          aria-label={`View image: ${String(block.metadata?.name || "uploaded image")}`}
        >
          <Image
            src={url}
            alt={String(block.metadata?.name || "uploaded image")}
            className={cn(imgClass, "transition-transform group-hover/img:scale-105")}
            width={size === "sm" ? 40 : size === "md" ? 64 : 96}
            height={size === "sm" ? 40 : size === "md" ? 64 : 96}
            unoptimized
          />
          {/* Hover overlay with zoom hint */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/20">
            <svg
              className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/img:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
              />
            </svg>
          </div>
        </button>
        <ImagePreviewModal
          src={url}
          alt={String(block.metadata?.name || "Image preview")}
          open={previewOpen}
          onClose={handlePreviewClose}
        />
      </>
    );
  }

  // PDF block
  if (block.type === "file" && block.mimeType === "application/pdf") {
    const filename =
      (block.metadata?.filename as string) ||
      (block.metadata?.name as string) ||
      "PDF file";

    const handleDownload = () => {
      downloadPdf(block.data as string, filename);
    };

    return (
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-md border bg-gray-100 px-3 py-2",
          className
        )}
      >
        <div className="flex flex-shrink-0 items-center">
          <File
            className={cn(
              "text-teal-700",
              size === "sm" ? "h-5 w-5" : "h-7 w-7"
            )}
          />
        </div>
        <span
          className="min-w-0 flex-1 break-all text-sm text-gray-800"
          style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
        >
          {String(filename)}
        </span>
        <button
          type="button"
          className="ml-2 flex-shrink-0 rounded-md p-1.5 text-teal-700 transition-colors hover:bg-teal-100 hover:text-teal-900"
          onClick={handleDownload}
          aria-label={`Download ${filename}`}
          title="Download PDF"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-gray-100 px-3 py-2 text-gray-500",
        className
      )}
    >
      <File className="h-5 w-5 flex-shrink-0" />
      <span className="truncate text-xs">Unsupported file type</span>
    </div>
  );
};

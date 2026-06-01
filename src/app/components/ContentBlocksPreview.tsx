// Ported from langchain-ai/agent-chat-ui (src/components/thread/ContentBlocksPreview.tsx).
// Upstream is MIT-licensed; full attribution retained in repository LICENSE.
import React from "react";
import { ContentBlock } from "@langchain/core/messages";
import { cn } from "@/lib/utils";
import { MultimodalPreview } from "./MultimodalPreview";

interface ContentBlocksPreviewProps {
  blocks: ContentBlock.Multimodal.Data[];
  onRemove: (idx: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const ContentBlocksPreview: React.FC<ContentBlocksPreviewProps> = ({
  blocks,
  onRemove,
  size = "md",
  className,
}) => {
  if (!blocks.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2 p-3.5 pb-0", className)}>
      {blocks.map((block, idx) => (
        <MultimodalPreview
          key={idx}
          block={block}
          removable
          onRemove={() => onRemove(idx)}
          size={size}
        />
      ))}
    </div>
  );
};

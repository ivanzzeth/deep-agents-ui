"use client";

import React, { useMemo, useState, useCallback } from "react";
import type { ContentBlock } from "@langchain/core/messages";
import { GitBranch } from "lucide-react";
import { SubAgentIndicator } from "@/app/components/SubAgentIndicator";
import { ToolCallBox } from "@/app/components/ToolCallBox";
import { MarkdownContent } from "@/app/components/MarkdownContent";
import { MultimodalPreview } from "@/app/components/MultimodalPreview";
import type {
  SubAgent,
  ToolCall,
  ActionRequest,
  ReviewConfig,
} from "@/app/types/types";
import {
  type RichMessage,
  type RichContentBlock,
  isMultimodalBlock,
} from "@/app/types/chat";
import {
  extractSubAgentContent,
  extractStringFromMessageContent,
} from "@/app/utils/utils";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: RichMessage;
  toolCalls: ToolCall[];
  isLoading?: boolean;
  actionRequestsMap?: Map<string, ActionRequest>;
  reviewConfigsMap?: Map<string, ReviewConfig>;
  ui?: any[];
  stream?: any;
  onResumeInterrupt?: (value: any) => void;
  graphId?: string;
  /** Called when the user clicks the "fork from here" button next to this
   *  message. Undefined → no checkpoint resolves for this message, so the
   *  control is hidden. */
  onForkFromHere?: () => void;
}

function extractMediaBlocks(
  content: RichMessage["content"]
): ContentBlock.Multimodal.Data[] {
  if (typeof content === "string") return [];
  return content.filter((block: RichContentBlock) => isMultimodalBlock(block));
}

export const ChatMessage = React.memo<ChatMessageProps>(
  ({
    message,
    toolCalls,
    isLoading,
    actionRequestsMap,
    reviewConfigsMap,
    ui,
    stream,
    onResumeInterrupt,
    graphId,
    onForkFromHere,
  }) => {
    const isUser = message.type === "human";
    const messageContent = extractStringFromMessageContent(message);
    const hasTextContent = !!messageContent && messageContent.trim() !== "";
    const mediaBlocks = useMemo(
      () => (isUser ? extractMediaBlocks(message.content) : []),
      [isUser, message.content]
    );
    const hasMediaContent = mediaBlocks.length > 0;
    const showContent = hasTextContent || hasMediaContent;
    const hasToolCalls = toolCalls.length > 0;
    const subAgents = useMemo(() => {
      return toolCalls
        .filter((toolCall: ToolCall) => {
          return (
            toolCall.name === "task" &&
            toolCall.args["subagent_type"] &&
            toolCall.args["subagent_type"] !== "" &&
            toolCall.args["subagent_type"] !== null
          );
        })
        .map((toolCall: ToolCall) => {
          const subagentType = (toolCall.args as Record<string, unknown>)[
            "subagent_type"
          ] as string;
          return {
            id: toolCall.id,
            name: toolCall.name,
            subAgentName: subagentType,
            input: toolCall.args,
            output: toolCall.result ? { result: toolCall.result } : undefined,
            status: toolCall.status,
          } as SubAgent;
        });
    }, [toolCalls]);

    const [expandedSubAgents, setExpandedSubAgents] = useState<
      Record<string, boolean>
    >({});
    const isSubAgentExpanded = useCallback(
      (id: string) => expandedSubAgents[id] ?? true,
      [expandedSubAgents]
    );
    const toggleSubAgent = useCallback((id: string) => {
      setExpandedSubAgents((prev) => ({
        ...prev,
        [id]: prev[id] === undefined ? false : !prev[id],
      }));
    }, []);

    const forkButton = onForkFromHere ? (
      <button
        type="button"
        onClick={onForkFromHere}
        className={cn(
          "inline-flex items-center gap-1 self-center rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground",
          "opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/msg:opacity-100 focus-visible:opacity-100"
        )}
        title="Fork a new branch from this point and re-run the rest"
      >
        <GitBranch className="h-3 w-3" />
        <span className="hidden sm:inline">Fork from here</span>
      </button>
    ) : null;

    return (
      <div
        className={cn(
          "group/msg flex w-full max-w-full overflow-x-hidden",
          isUser && "flex-row-reverse"
        )}
      >
        <div
          className={cn(
            "min-w-0 max-w-full",
            isUser ? "max-w-[70%]" : "w-full"
          )}
        >
          {showContent && (
            <div
              className={cn(
                "relative flex gap-2",
                isUser ? "flex-col items-end" : "items-end"
              )}
            >
              {hasMediaContent && (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {mediaBlocks.map((block, idx) => (
                    <MultimodalPreview
                      key={idx}
                      block={block}
                      size="md"
                    />
                  ))}
                </div>
              )}
              {hasTextContent && (
                <div
                  className={cn(
                    "flex items-center gap-2",
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div
                    className={cn(
                      "overflow-hidden break-words text-sm font-normal leading-[150%]",
                      hasMediaContent ? "mt-0" : "mt-4",
                      isUser
                        ? "rounded-xl rounded-br-none border border-border px-3 py-2 text-foreground"
                        : "text-primary"
                    )}
                    style={
                      isUser
                        ? { backgroundColor: "var(--color-user-message-bg)" }
                        : undefined
                    }
                  >
                    {isUser ? (
                      <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {messageContent}
                      </p>
                    ) : (
                      <MarkdownContent content={messageContent} />
                    )}
                  </div>
                  {forkButton}
                </div>
              )}
            </div>
          )}
          {hasToolCalls && (
            <div className="mt-4 flex w-full flex-col">
              {toolCalls.map((toolCall: ToolCall) => {
                if (toolCall.name === "task") return null;
                const toolCallGenUiComponent = ui?.find(
                  (u) => u.metadata?.tool_call_id === toolCall.id
                );
                const actionRequest = actionRequestsMap?.get(toolCall.name);
                const reviewConfig = reviewConfigsMap?.get(toolCall.name);
                return (
                  <ToolCallBox
                    key={toolCall.id}
                    toolCall={toolCall}
                    uiComponent={toolCallGenUiComponent}
                    stream={stream}
                    graphId={graphId}
                    actionRequest={actionRequest}
                    reviewConfig={reviewConfig}
                    onResume={onResumeInterrupt}
                    isLoading={isLoading}
                  />
                );
              })}
            </div>
          )}
          {!isUser && subAgents.length > 0 && (
            <div className="flex w-fit max-w-full flex-col gap-4">
              {subAgents.map((subAgent) => (
                <div
                  key={subAgent.id}
                  className="flex w-full flex-col gap-2"
                >
                  <div className="flex items-end gap-2">
                    <div className="w-[calc(100%-100px)]">
                      <SubAgentIndicator
                        subAgent={subAgent}
                        onClick={() => toggleSubAgent(subAgent.id)}
                        isExpanded={isSubAgentExpanded(subAgent.id)}
                      />
                    </div>
                  </div>
                  {isSubAgentExpanded(subAgent.id) && (
                    <div className="w-full max-w-full">
                      <div className="bg-surface border-border-light rounded-md border p-4">
                        <h4 className="text-primary/70 mb-2 text-xs font-semibold uppercase tracking-wider">
                          Input
                        </h4>
                        <div className="mb-4">
                          <MarkdownContent
                            content={extractSubAgentContent(subAgent.input)}
                          />
                        </div>
                        {subAgent.output && (
                          <>
                            <h4 className="text-primary/70 mb-2 text-xs font-semibold uppercase tracking-wider">
                              Output
                            </h4>
                            <MarkdownContent
                              content={extractSubAgentContent(subAgent.output)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

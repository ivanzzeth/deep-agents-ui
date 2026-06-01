"use client";

import { useQueryState } from "nuqs";
import { Bot, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssistants } from "@/app/hooks/useAssistants";
import { cn } from "@/lib/utils";

/**
 * Dropdown to switch the active assistant. Backed by
 * `client.assistants.search()`; selection writes to the `?assistantId=`
 * URL query, which then flows into config via the page-level sync effects.
 *
 * Doesn't persist the choice — switching here is a transient session
 * override (matches our URL>localStorage>env precedence rule). Use the
 * Settings dialog to change the saved default.
 */
export function AgentPicker({
  currentAssistantId,
  className,
}: {
  currentAssistantId: string;
  className?: string;
}) {
  const [, setAssistantId] = useQueryState("assistantId");
  const { data: assistants, error, isLoading } = useAssistants();

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 text-xs text-destructive",
          className
        )}
      >
        <AlertCircle className="h-3 w-3" />
        <span>assistants error</span>
      </div>
    );
  }

  if (isLoading || !assistants) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className
        )}
      >
        <Bot className="h-4 w-4" />
        <span>{currentAssistantId}</span>
      </div>
    );
  }

  // Prefer the named match (graph_id / name); fallback to UUID assistant_id.
  const byName = new Map<string, string>();
  for (const a of assistants) {
    byName.set(a.name ?? a.graph_id, a.name ?? a.graph_id);
  }
  const options = Array.from(byName.keys()).sort();

  return (
    <Select
      value={currentAssistantId}
      onValueChange={(value) => setAssistantId(value)}
    >
      <SelectTrigger className={cn("h-9 w-[200px]", className)}>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Choose agent" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.map((name) => (
          <SelectItem
            key={name}
            value={name}
          >
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

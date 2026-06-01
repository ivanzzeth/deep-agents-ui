"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useQueryState } from "nuqs";
import { getConfig, saveConfig, StandaloneConfig } from "@/lib/config";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { History, MessagesSquare, Settings, SquarePen } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ThreadList } from "@/app/components/ThreadList";
import { AgentPicker } from "@/app/components/AgentPicker";
import { HistoryDialog } from "@/app/components/HistoryDialog";
import { ChatProvider } from "@/providers/ChatProvider";
import { ChatInterface } from "@/app/components/ChatInterface";

interface HomePageInnerProps {
  config: StandaloneConfig;
  configDialogOpen: boolean;
  setConfigDialogOpen: (open: boolean) => void;
  handleSaveConfig: (config: StandaloneConfig) => void;
}

function HomePageInner({
  config,
  configDialogOpen,
  setConfigDialogOpen,
  handleSaveConfig,
}: HomePageInnerProps) {
  const client = useClient();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [, setUrlAssistantId] = useQueryState("assistantId");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebar, setSidebar] = useQueryState("sidebar");

  const [mutateThreads, setMutateThreads] = useState<(() => void) | null>(null);
  const [interruptCount, setInterruptCount] = useState(0);
  const [assistant, setAssistant] = useState<Assistant | null>(null);

  const fetchAssistant = useCallback(async () => {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        config.assistantId
      );

    if (isUUID) {
      // We should try to fetch the assistant directly with this UUID
      try {
        const data = await client.assistants.get(config.assistantId);
        setAssistant(data);
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
        setAssistant({
          assistant_id: config.assistantId,
          graph_id: config.assistantId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          config: {},
          metadata: {},
          version: 1,
          name: "Assistant",
          context: {},
        });
      }
    } else {
      try {
        // We should try to list out the assistants for this graph, and then use the default one.
        // TODO: Paginate this search, but 100 should be enough for graph name
        const assistants = await client.assistants.search({
          graphId: config.assistantId,
          limit: 100,
        });
        const defaultAssistant = assistants.find(
          (assistant) => assistant.metadata?.["created_by"] === "system"
        );
        if (defaultAssistant === undefined) {
          throw new Error("No default assistant found");
        }
        setAssistant(defaultAssistant);
      } catch (error) {
        console.error(
          "Failed to find default assistant from graph_id: try setting the assistant_id directly:",
          error
        );
        setAssistant({
          assistant_id: config.assistantId,
          graph_id: config.assistantId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          config: {},
          metadata: {},
          version: 1,
          name: config.assistantId,
          context: {},
        });
      }
    }
  }, [client, config.assistantId]);

  useEffect(() => {
    fetchAssistant();
  }, [fetchAssistant]);

  return (
    <>
      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
        initialConfig={config}
      />
      <div className="flex h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Deep Agent UI</h1>
            {!sidebar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebar("1")}
                className="rounded-md border border-border bg-card p-3 text-foreground hover:bg-accent"
              >
                <MessagesSquare className="mr-2 h-4 w-4" />
                Threads
                {interruptCount > 0 && (
                  <span className="ml-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {interruptCount}
                  </span>
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AgentPicker currentAssistantId={config.assistantId} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              disabled={!threadId}
            >
              <History className="mr-2 h-4 w-4" />
              History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThreadId(null)}
              disabled={!threadId}
              className="border-[#2F6868] bg-[#2F6868] text-white hover:bg-[#2F6868]/80"
            >
              <SquarePen className="mr-2 h-4 w-4" />
              New Thread
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="standalone-chat"
          >
            {sidebar && (
              <>
                <ResizablePanel
                  id="thread-history"
                  order={1}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[380px]"
                >
                  <ThreadList
                    onThreadSelect={async (id, assistantId) => {
                      // Switch to the thread *and* the agent it was created
                      // with. Otherwise the active picker would keep driving
                      // a different agent on top of someone else's history.
                      if (assistantId) {
                        await setUrlAssistantId(assistantId);
                      }
                      await setThreadId(id);
                    }}
                    onMutateReady={(fn) => setMutateThreads(() => fn)}
                    onClose={() => setSidebar(null)}
                    onInterruptCountChange={setInterruptCount}
                  />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            <ResizablePanel
              id="chat"
              className="relative flex flex-col"
              order={2}
            >
              <ChatProvider
                activeAssistant={assistant}
                onHistoryRevalidate={() => mutateThreads?.()}
              >
                <ChatInterface assistant={assistant} />
                <HistoryDialog
                  open={historyOpen}
                  onOpenChange={setHistoryOpen}
                />
              </ChatProvider>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
}

function HomePageContent() {
  const [config, setConfig] = useState<StandaloneConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [assistantId, setAssistantId] = useQueryState("assistantId");

  // Resolution precedence: URL `assistantId` query > localStorage > env >
  // config dialog. The URL value is a transient session override — it drives
  // the current view but is NOT written back to localStorage. The Settings
  // dialog reflects whatever's currently active.
  //
  // localStorage > env precedence lives inside getConfig() so other hooks
  // (e.g. useThreads) see the same fallback chain.
  useEffect(() => {
    const base = getConfig();
    if (!base) {
      setConfigDialogOpen(true);
      return;
    }
    const effective: StandaloneConfig = assistantId
      ? { ...base, assistantId }
      : base;
    setConfig(effective);
    if (!assistantId) {
      setAssistantId(effective.assistantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If config changes, update the assistantId
  useEffect(() => {
    if (config && !assistantId) {
      setAssistantId(config.assistantId);
    }
  }, [config, assistantId, setAssistantId]);

  // Keep config.assistantId in sync with URL changes that happen *after* mount
  // (e.g. user clicks a link with a different ?assistantId). Without this the
  // initial-mount effect above would be the only place URL→config flows.
  useEffect(() => {
    if (!config || !assistantId || assistantId === config.assistantId) return;
    setConfig({ ...config, assistantId });
  }, [assistantId, config]);

  const handleSaveConfig = useCallback((newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const langsmithApiKey =
    config?.langsmithApiKey || process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";

  if (!config) {
    return (
      <>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveConfig}
        />
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to Standalone Chat</h1>
            <p className="mt-2 text-muted-foreground">
              Configure your deployment to get started
            </p>
            <Button
              onClick={() => setConfigDialogOpen(true)}
              className="mt-4"
            >
              Open Configuration
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <ClientProvider
      deploymentUrl={config.deploymentUrl}
      apiKey={langsmithApiKey}
    >
      <HomePageInner
        config={config}
        configDialogOpen={configDialogOpen}
        setConfigDialogOpen={setConfigDialogOpen}
        handleSaveConfig={handleSaveConfig}
      />
    </ClientProvider>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

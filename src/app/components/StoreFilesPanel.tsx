"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  HardDrive,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileViewDialog } from "@/app/components/FileViewDialog";
import { cn } from "@/lib/utils";
import type { StoreFile } from "@/app/hooks/useStoreFiles";
import type { FileItem } from "@/app/types/types";

// ===== Tree data structure =====

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  file?: StoreFile;
}

function buildTree(files: StoreFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "/", type: "folder", children: [] };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = "/" + parts.slice(0, i + 1).join("/");

      let child = current.children?.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
        };
        current.children!.push(child);
      }
      if (!isFile) current = child;
    }
  }

  const sortTree = (node: TreeNode) => {
    if (node.children) {
      node.children.sort((a, b) =>
        a.type !== b.type
          ? a.type === "folder" ? -1 : 1
          : a.name.localeCompare(b.name)
      );
      node.children.forEach(sortTree);
    }
  };
  sortTree(root);
  return root;
}

// ===== File icon color map =====

const EXT_COLORS: Record<string, string> = {
  py: "text-blue-400",
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  ts: "text-blue-500",
  tsx: "text-blue-500",
  json: "text-emerald-400",
  md: "text-zinc-400",
  txt: "text-zinc-400",
  yaml: "text-pink-400",
  yml: "text-pink-400",
  css: "text-purple-400",
  html: "text-orange-400",
  sh: "text-green-400",
};

function getFileColor(ext: string): string {
  return EXT_COLORS[ext] || "text-muted-foreground";
}

// ===== Tree Node Component =====

const TreeNodeRow = React.memo<{
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (node: TreeNode) => void;
  onToggle: (path: string) => void;
}>(({ node, depth, selectedPath, expandedPaths, onSelect, onToggle }) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const pl = depth * 14 + 6;

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
          style={{ paddingLeft: pl }}
        >
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-zinc-500 transition-transform duration-150",
              isExpanded && "rotate-90"
            )}
          />
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-amber-500/80" />
          ) : (
            <Folder size={14} className="shrink-0 text-amber-500/80" />
          )}
          <span className="ml-1 truncate text-xs font-medium text-foreground">
            {node.name}
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {node.children?.length}
          </span>
        </button>
        {isExpanded && node.children && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-border/50"
              style={{ marginLeft: pl + 17 }}
            />
            {node.children.map((child) => (
              <TreeNodeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const ext = node.name.includes(".") ? node.name.split(".").pop() || "" : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className={cn(
        "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left transition-colors",
        isSelected
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      style={{ paddingLeft: pl }}
    >
      <span className="w-3 shrink-0" />
      <FileText size={13} className={cn("shrink-0", getFileColor(ext))} />
      <span className="ml-1 truncate font-mono text-[11px]">{node.name}</span>
      {node.file && (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">
          {node.file.size > 1024
            ? `${(node.file.size / 1024).toFixed(1)}KB`
            : `${node.file.size}B`}
        </span>
      )}
    </button>
  );
});

TreeNodeRow.displayName = "TreeNodeRow";

// ===== Store Files Panel =====

export const StoreFilesPanel = React.memo<{
  files: StoreFile[];
  isLoading: boolean;
  error: Error | undefined;
  onRefresh: () => void;
  editDisabled: boolean;
}>(({ files, isLoading, error, onRefresh, editDisabled }) => {
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Filter files by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Auto-expand top-level folders on first render
  useMemo(() => {
    if (tree.children?.length && expandedPaths.size === 0) {
      const paths = new Set<string>();
      tree.children
        .filter((c) => c.type === "folder")
        .forEach((c) => paths.add(c.path));
      setExpandedPaths(paths);
    }
  }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: TreeNode) => {
    if (node.file) {
      setSelectedFile({ path: node.file.path, content: node.file.content });
    }
  }, []);

  const handleSaveFile = useCallback(
    async (_fileName: string, _content: string) => {
      // Store files are read-only from the UI perspective.
      // Editing store files would require a separate write API.
      // For now, just close the dialog.
    },
    []
  );

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  return (
    <>
      <div className="flex flex-col">
        {/* Header with breadcrumb + controls */}
        <div className="flex items-center gap-2 px-1 pb-2">
          <HardDrive size={12} className="shrink-0 text-amber-500" />
          <span className="font-mono text-[10px] text-zinc-500">
            workspace/files
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {files.length} files ·{" "}
            {totalSize > 1024
              ? `${(totalSize / 1024).toFixed(1)}KB`
              : `${totalSize}B`}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Search */}
        <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
          <Search size={12} className="shrink-0 text-zinc-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-zinc-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="shrink-0 text-zinc-500 hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Tree */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground">Loading store files…</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-4 text-center">
              <p className="text-xs text-destructive">
                Failed to load store files
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {searchQuery
                  ? "No files match search"
                  : "No files in store yet"}
              </p>
            </div>
          ) : (
            <div className="py-0.5">
              {tree.children?.map((child) => (
                <TreeNodeRow
                  key={child.path}
                  node={child}
                  depth={0}
                  selectedPath={selectedFile?.path ?? null}
                  expandedPaths={expandedPaths}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {selectedFile && (
        <FileViewDialog
          file={selectedFile}
          onSaveFile={handleSaveFile}
          onClose={() => setSelectedFile(null)}
          editDisabled={editDisabled || true}
        />
      )}
    </>
  );
});

StoreFilesPanel.displayName = "StoreFilesPanel";

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircleIcon, ArrowUpIcon, SquareIcon } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatStreamEvent } from "@/app/api/chat/route";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/definitions";
import { GREETING } from "@/lib/persona";
import { QUOTA_EXHAUSTED_MESSAGE, TOKEN_LIMIT } from "@/lib/quota";
import { cn } from "@/lib/utils";

type UIMessage = ChatMessage & { pending?: boolean };

// Shown at the top of every chat; the model is told it already said this (see SYSTEM_PROMPT).
const OPENING: UIMessage = { id: "opening", role: "assistant", content: GREETING, error: null };

const fmt = (n: number) => n.toLocaleString("en-US");

export function Chat({
  conversationId,
  initialMessages,
  initialTokensRemaining,
}: {
  conversationId?: string;
  initialMessages: ChatMessage[];
  initialTokensRemaining: number;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>(() => [OPENING, ...initialMessages]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [tokensLeft, setTokensLeft] = useState(initialTokensRemaining);
  const conversationIdRef = useRef(conversationId);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // True once the "New chat" page has turned into a saved conversation.
  const startedConversation = useRef(false);

  // Adopt fresh server values (e.g. after router.refresh()).
  const [prevInitialTokens, setPrevInitialTokens] = useState(initialTokensRemaining);
  if (initialTokensRemaining !== prevInitialTokens) {
    setPrevInitialTokens(initialTokensRemaining);
    setTokensLeft(initialTokensRemaining);
  }

  // Next.js keeps visited pages mounted but hidden (<Activity>). When the "New chat" page is
  // hidden after starting a conversation, reset it so returning to it shows a blank chat.
  useLayoutEffect(
    () => () => {
      if (!startedConversation.current) return;
      startedConversation.current = false;
      conversationIdRef.current = undefined;
      setMessages([OPENING]);
      setRequestError(null);
      setTokensLeft(TOKEN_LIMIT);
    },
    [],
  );

  const exhausted = tokensLeft <= 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const updateLast = (patch: (m: UIMessage) => Partial<UIMessage>) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, ...patch(last) }];
    });

  async function send() {
    const text = input.trim();
    if (!text || sending || exhausted) return;

    setInput("");
    setRequestError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: "user", content: text, error: null },
      { id: `local-assistant-${Date.now()}`, role: "assistant", content: "", error: null, pending: true },
    ]);

    // Rejected before the turn started (validation, quota, network): undo and show the reason.
    const rejectRequest = (message: string) => {
      setMessages((prev) => prev.slice(0, -2));
      setInput(text);
      setRequestError(message);
    };

    const controller = new AbortController();
    abortRef.current = controller;
    let interrupted = false;

    try {
      let res: Response;
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: conversationIdRef.current, message: text }),
          signal: controller.signal,
        });
      } catch {
        rejectRequest(
          controller.signal.aborted ? "Message cancelled." : "Couldn't reach the server. Check your connection and try again.",
        );
        return;
      }

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (data?.code === "quota_exhausted") setTokensLeft(0);
        if (data?.code === "unauthorized") {
          router.push("/login");
          return;
        }
        rejectRequest(data?.error ?? `Something went wrong (HTTP ${res.status}). Please try again.`);
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatStreamEvent;
            if (event.type === "conversation") {
              if (!conversationIdRef.current) {
                conversationIdRef.current = event.id;
                startedConversation.current = true;
                window.history.replaceState(null, "", `/c/${event.id}`);
              }
            } else if (event.type === "delta") {
              updateLast((m) => ({ content: m.content + event.text }));
            } else if (event.type === "done") {
              finished = true;
              setTokensLeft(event.tokensRemaining);
              updateLast(() => ({ id: event.messageId ?? `local-${Date.now()}`, error: event.error, pending: false }));
            }
          }
        }
      } catch {
        // Stream dropped mid-reply (e.g. the user pressed stop or the network failed).
      }
      if (!finished) {
        interrupted = true;
        updateLast(() => ({
          pending: false,
          error: controller.signal.aborted
            ? "Response stopped."
            : "The connection was interrupted before the reply finished. Please try again.",
        }));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      // Refresh the sidebar (new or reordered conversation) and the server-side token count.
      // After an interrupted reply, give the server a moment to save the partial turn first.
      if (interrupted) setTimeout(() => router.refresh(), 1000);
      else router.refresh();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t bg-background">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
          {exhausted ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>This chat is out of tokens</AlertTitle>
              <AlertDescription>
                <p>{QUOTA_EXHAUSTED_MESSAGE}</p>
                <Link href="/" className={buttonVariants({ size: "sm", className: "mt-2" })}>
                  Start a new chat
                </Link>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {requestError && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Message the assistant…"
                  aria-label="Message"
                  rows={1}
                  maxLength={8000}
                  className="max-h-48 min-h-10 resize-none"
                />
                {sending ? (
                  <Button type="button" size="icon" variant="outline" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                    <SquareIcon />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
                    <ArrowUpIcon />
                  </Button>
                )}
              </form>
            </>
          )}
          <TokenMeter tokensLeft={tokensLeft} />
        </div>
      </div>
    </div>
  );
}

// Assistant replies are Markdown. Raw HTML in them is not rendered (react-markdown's default).
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Wide tables (e.g. car comparisons) scroll inside the bubble instead of overflowing it.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
      {(message.content || message.pending) && (
        <div
          className={cn(
            "max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words",
            isUser ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-muted",
          )}
        >
          {!message.content ? (
            <span className="animate-pulse text-muted-foreground">Thinking…</span>
          ) : isUser ? (
            message.content
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-2 prose-table:my-2 first:prose-p:mt-0 last:prose-p:mb-0">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
      )}
      {message.error && (
        <div
          role="alert"
          className="flex max-w-[85%] items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{message.error}</span>
        </div>
      )}
    </div>
  );
}

function TokenMeter({ tokensLeft }: { tokensLeft: number }) {
  const used = TOKEN_LIMIT - tokensLeft;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <Progress value={(used / TOKEN_LIMIT) * 100} aria-label="Tokens used" className="flex-1" />
      <span className={cn("shrink-0 tabular-nums", tokensLeft < TOKEN_LIMIT * 0.1 && "text-destructive")}>
        {fmt(tokensLeft)} / {fmt(TOKEN_LIMIT)} tokens left
      </span>
    </div>
  );
}

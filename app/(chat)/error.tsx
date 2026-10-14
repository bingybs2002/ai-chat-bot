"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertCircleIcon className="size-8 text-destructive" />
      <h2 className="text-lg font-semibold">Something went wrong loading this chat</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your conversations are safe. Try again, or start a new chat from the sidebar.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}

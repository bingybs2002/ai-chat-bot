"use client";

import { useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { clearAllChats } from "@/app/actions/chat";
import { Button } from "@/components/ui/button";

export function ClearAllButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  const clear = () => {
    if (!window.confirm("Delete all chats? This can't be undone.")) return;
    startTransition(async () => {
      await clearAllChats();
      // Full reload: visited chat pages stay mounted in the background, so a client-side
      // navigation could keep showing deleted messages.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    });
  };

  return (
    <Button type="button" variant="ghost" size="sm" className={className} disabled={pending} onClick={clear}>
      <Trash2Icon />
      {pending ? "Clearing…" : "Clear all"}
    </Button>
  );
}

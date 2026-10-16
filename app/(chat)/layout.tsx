import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ClearAllButton } from "@/components/chat/clear-all-button";
import { ConversationLinks } from "@/components/chat/conversation-links";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/dal";
import { listConversations } from "@/lib/services/chat-service";

export default function ChatLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-svh min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="p-3">
          <Link href="/" className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
            <PlusIcon />
            New chat
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Conversations">
          <Suspense fallback={<ListSkeleton />}>
            <Conversations />
          </Suspense>
        </nav>
        <div className="space-y-2 border-t p-3">
          <ClearAllButton className="w-full justify-start" />
          <Suspense fallback={<div className="h-8 animate-pulse rounded-md bg-muted" />}>
            <Account />
          </Suspense>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b px-3 md:hidden">
          <span className="font-semibold">AI Chat</span>
          <div className="flex items-center gap-2">
            <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <PlusIcon />
              New
            </Link>
            <ClearAllButton />
            <LogoutButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

async function Conversations() {
  const user = await getCurrentUser();
  const conversations = await listConversations(user.id);
  if (conversations.length === 0) {
    return <p className="px-2 py-1 text-sm text-muted-foreground">No conversations yet.</p>;
  }
  return <ConversationLinks conversations={conversations} />;
}

async function Account() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-sm text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <LogoutButton />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

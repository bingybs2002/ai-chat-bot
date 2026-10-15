import { Suspense } from "react";
import { Chat } from "@/components/chat/chat";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { getCurrentUser } from "@/lib/dal";
import { TOKEN_LIMIT } from "@/lib/quota";

export default function NewChatPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <NewChat />
    </Suspense>
  );
}

async function NewChat() {
  await getCurrentUser(); // redirects to /login when signed out
  return <Chat initialMessages={[]} initialTokensRemaining={TOKEN_LIMIT} />;
}

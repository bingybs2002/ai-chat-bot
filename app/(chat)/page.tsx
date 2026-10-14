import { Suspense } from "react";
import { Chat } from "@/components/chat/chat";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { getCurrentUser } from "@/lib/dal";
import { tokensRemaining } from "@/lib/quota";

export default function NewChatPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <NewChat />
    </Suspense>
  );
}

async function NewChat() {
  const user = await getCurrentUser();
  return <Chat initialMessages={[]} initialTokensRemaining={tokensRemaining(user.tokensUsed)} />;
}

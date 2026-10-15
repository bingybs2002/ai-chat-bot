import { Suspense } from "react";
import { Chat } from "@/components/chat/chat";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { getConversation } from "@/lib/chat";
import { tokensRemaining } from "@/lib/quota";

export default function ConversationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: PageProps<"/c/[id]">["params"] }) {
  const { id } = await params;
  const conversation = await getConversation(id);
  return (
    <Chat
      key={conversation.id}
      conversationId={conversation.id}
      initialMessages={conversation.messages}
      initialTokensRemaining={tokensRemaining(conversation.tokensUsed)}
    />
  );
}

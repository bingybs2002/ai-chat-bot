import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { getCurrentUser } from "@/lib/dal";
import { tokensRemaining } from "@/lib/quota";
import { getConversation } from "@/lib/services/chat-service";

export default function ConversationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: PageProps<"/c/[id]">["params"] }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const conversation = await getConversation(user.id, id);
  if (!conversation) notFound();
  return (
    <Chat
      key={conversation.id}
      conversationId={conversation.id}
      initialMessages={conversation.messages}
      initialTokensRemaining={tokensRemaining(conversation.tokensUsed)}
    />
  );
}

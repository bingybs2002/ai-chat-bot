import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function ConversationNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold">Conversation not found</h2>
      <p className="text-sm text-muted-foreground">It may have been deleted, or it belongs to another account.</p>
      <Link href="/" className={buttonVariants()}>
        Start a new chat
      </Link>
    </div>
  );
}

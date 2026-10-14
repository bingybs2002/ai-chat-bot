"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ConversationLinks({ conversations }: { conversations: { id: string; title: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => {
        const href = `/c/${c.id}`;
        const active = pathname === href;
        return (
          <li key={c.id}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block truncate rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
              title={c.title}
            >
              {c.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

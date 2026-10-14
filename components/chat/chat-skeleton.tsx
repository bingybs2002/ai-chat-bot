export function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

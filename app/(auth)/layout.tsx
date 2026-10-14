export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

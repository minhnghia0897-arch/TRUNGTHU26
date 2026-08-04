// Skeleton loaders (shimmer) — hiển thị khi server component đang nạp dữ liệu.

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-white shadow-card">
      <div className="skeleton h-40 rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton mx-auto h-4 w-2/3" />
        <div className="skeleton mx-auto h-3 w-4/5" />
        <div className="skeleton mx-auto mt-3 h-5 w-24" />
        <div className="skeleton mt-3 h-9 w-full rounded-full" />
      </div>
    </div>
  );
}

export function StorefrontSkeleton() {
  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24">
      <div className="skeleton h-9 rounded-none" />
      <div className="skeleton mx-auto mt-4 h-6 w-40" />
      <div className="skeleton mx-auto mt-3 h-44 rounded-none" />
      <div className="grid gap-4 px-5 py-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </main>
  );
}

export function CatalogSkeleton() {
  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24">
      <div className="skeleton h-12 rounded-none" />
      <div className="skeleton mx-auto mt-5 h-7 w-32" />
      <div className="mt-4 flex justify-center gap-2 px-4">
        <div className="skeleton h-9 w-32 rounded-full" />
        <div className="skeleton h-9 w-32 rounded-full" />
      </div>
      <div className="grid gap-4 px-4 py-5">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </main>
  );
}

export function DashboardSkeleton() {
  return (
    <main className="mx-auto min-h-screen bg-cream">
      <div className="skeleton h-14 rounded-none" />
      <div className="mx-auto max-w-[1080px] px-4">
        <div className="my-4 flex gap-2">
          <div className="skeleton h-9 w-40 rounded" />
          <div className="skeleton h-9 w-32 rounded" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="skeleton h-80 rounded" />
          <div className="skeleton h-80 rounded" />
        </div>
      </div>
    </main>
  );
}

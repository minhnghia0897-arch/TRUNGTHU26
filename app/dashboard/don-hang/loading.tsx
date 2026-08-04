export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="skeleton h-12 rounded-none" />
      <div className="skeleton h-10 rounded-none" />
      <div className="space-y-2 p-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded-md" />
        ))}
      </div>
    </main>
  );
}

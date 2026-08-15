import LookupFlow from "@/components/LookupFlow";

export const metadata = { title: "Doran King — Tra cứu đơn" };

// Tra cứu đơn theo SĐT (demo đọc localStorage; bản thật nối Supabase + rate-limit).
export default function TraCuuPage() {
  return <LookupFlow />;
}

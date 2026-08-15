import { getDashboard } from "@/lib/dashboard";
import Dashboard from "@/components/Dashboard";

// Bảng điều hành (§15) — server nạp dữ liệu web-native + mirror.
export const metadata = { title: "Doran King — Bảng điều hành" };

export default async function DashboardPage() {
  const data = await getDashboard();
  return <Dashboard data={data} />;
}

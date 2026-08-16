import { requireCommissioner } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCommissioner();

  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}

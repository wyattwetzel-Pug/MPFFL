import { CsvUpload } from "@/components/admin/csv-upload";

export default function CsvUpdatePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">CSV Player Update</h1>
      <CsvUpload />
    </div>
  );
}

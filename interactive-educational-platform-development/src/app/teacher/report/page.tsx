import { Suspense } from "react";
import type { Metadata } from "next";
import ReportView from "@/components/teacher/ReportView";

export const metadata: Metadata = {
  title: "تقرير PDF | أئمة الدولة السعودية الثانية",
};

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-bold text-saudi">جارٍ التحميل...</div>}>
      <ReportView />
    </Suspense>
  );
}

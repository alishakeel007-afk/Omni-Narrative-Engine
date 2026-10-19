import { Suspense } from "react";
import AccountScreen from "@/screens/AccountScreen";

export default function AccountPage() {
  return <Suspense fallback={<p className="p-6">Opening account…</p>}><AccountScreen /></Suspense>;
}

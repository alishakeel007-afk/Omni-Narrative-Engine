import { Suspense } from "react";
import ResetPasswordScreen from "@/screens/ResetPasswordScreen";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordScreen />
    </Suspense>
  );
}

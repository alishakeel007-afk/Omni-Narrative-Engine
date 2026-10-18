"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ScreenLayout from "@/screens/ScreenLayout";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (currentUser) {
      router.replace("/studio");
      return;
    }
  }, [currentUser, loading, router]);

  return (
    <ScreenLayout
      eyebrow="One last step"
      title="Check your inbox."
      description="Confirm your email to open your studio."
      maxWidth="max-w-lg"
    >
      <div>
        <p className="public-form-eyebrow">One last step</p>
        <h1>Check your inbox.</h1>
        <p className="public-form-intro">
          Open the confirmation link in your email to finish setting up your
          studio. If you can't find it, check your spam folder.
        </p>
        <div className="public-auth-form">
          <Link href="/auth" className="public-button">
            Continue to log in
          </Link>
        </div>
        <p className="public-auth-switch">
          Used a different email? <Link href="/signup">Start again</Link>
        </p>
      </div>
    </ScreenLayout>
  );
}

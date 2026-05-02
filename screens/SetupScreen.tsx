"use client";

import { StorySetupForm } from "@/components/story-setup-form";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";

export default function SetupScreen() {
  return (
    <ProtectedRoute>
      <ScreenLayout eyebrow="Setup" title="Story Setup" description="Create protagonist, genre and mode" maxWidth="max-w-3xl">
        <StorySetupForm />
      </ScreenLayout>
    </ProtectedRoute>
  );
}

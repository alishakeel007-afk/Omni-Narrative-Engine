"use client";

import { StorySetupForm } from "@/components/story-setup-form";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";

export default function SetupScreen() {
  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="Story Setup Pipeline"
        title="Build the Run"
        description="Follow the workflow: choose mode, scenario, tone, difficulty, character identity, and starting direction."
        maxWidth="max-w-6xl"
      >
        <StorySetupForm />
      </ScreenLayout>
    </ProtectedRoute>
  );
}

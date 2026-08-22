"use client";

import { StorySetupForm } from "@/components/story-setup-form";
import { ProtectedRoute } from "@/components/protected-route";
import { useStory } from "@/context/StoryContext";
import ScreenLayout from "@/screens/ScreenLayout";
import { AiStoryStudioStepper } from "@/components/ai-story-studio-stepper";

export default function SetupScreen() {
  return (
    <ProtectedRoute>
      <SetupContent />
    </ProtectedRoute>
  );
}

function SetupContent() {
  const { setup } = useStory();
  const isCreateStoryMode = setup.mode === "custom";

  return (
      <ScreenLayout
        eyebrow={isCreateStoryMode ? "AI Story Studio" : "Story Setup"}
        title={isCreateStoryMode ? "AI Story Studio Setup" : "Build the Run"}
        description={
          isCreateStoryMode
            ? "Set the foundation of your story before building scenes and dialogues."
            : "Follow the workflow: choose mode, scenario, tone, difficulty, character identity, and starting direction."
        }
        maxWidth="max-w-6xl"
      >
        {isCreateStoryMode ? <AiStoryStudioStepper currentStep={1} /> : null}
        <StorySetupForm />
      </ScreenLayout>
  );
}

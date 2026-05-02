import type { ChoiceType, MemoryItem, StoryScene } from "@/types/story";

export function createMemoryItem({
  choiceType,
  result,
  scene,
  update,
  userChoice
}: {
  choiceType: ChoiceType;
  result: string;
  scene: StoryScene;
  update: string;
  userChoice: string;
}): MemoryItem {
  return {
    choiceType,
    location: scene.location,
    mood: scene.mood,
    result,
    sceneNumber: scene.sceneNumber,
    timestamp: new Date().toLocaleString(),
    update,
    userChoice
  };
}

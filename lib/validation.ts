// Validation utilities for story setup and user inputs

export type ValidationError = {
  field: string;
  message: string;
};

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates character name
 */
export function validateCharacterName(name: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof name !== "string") {
    errors.push({
      field: "characterName",
      message: "Character name must be a string"
    });
    return { isValid: false, errors };
  }

  if (name.trim().length === 0) {
    errors.push({
      field: "characterName",
      message: "Character name cannot be empty"
    });
  }

  if (name.length > 50) {
    errors.push({
      field: "characterName",
      message: "Character name cannot exceed 50 characters"
    });
  }

  if (name.length < 2) {
    errors.push({
      field: "characterName",
      message: "Character name must be at least 2 characters"
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates story title
 */
export function validateStoryTitle(title: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof title !== "string") {
    errors.push({
      field: "storyTitle",
      message: "Story title must be a string"
    });
    return { isValid: false, errors };
  }

  if (title.trim().length === 0) {
    errors.push({
      field: "storyTitle",
      message: "Story title cannot be empty"
    });
  }

  if (title.length > 100) {
    errors.push({
      field: "storyTitle",
      message: "Story title cannot exceed 100 characters"
    });
  }

  if (title.length < 3) {
    errors.push({
      field: "storyTitle",
      message: "Story title must be at least 3 characters"
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates genre selection
 */
export function validateGenre(
  genre: unknown,
  validGenres: string[]
): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof genre !== "string") {
    errors.push({
      field: "genre",
      message: "Genre must be selected"
    });
    return { isValid: false, errors };
  }

  if (!validGenres.includes(genre)) {
    errors.push({
      field: "genre",
      message: `Invalid genre. Must be one of: ${validGenres.join(", ")}`
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates mood/tone selection
 */
export function validateMood(mood: unknown, validMoods: string[]): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof mood !== "string") {
    errors.push({
      field: "mood",
      message: "Mood must be selected"
    });
    return { isValid: false, errors };
  }

  if (!validMoods.includes(mood)) {
    errors.push({
      field: "mood",
      message: `Invalid mood. Must be one of: ${validMoods.join(", ")}`
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates scene description
 */
export function validateSceneDescription(description: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof description !== "string") {
    errors.push({
      field: "description",
      message: "Scene description must be text"
    });
    return { isValid: false, errors };
  }

  if (description.trim().length === 0) {
    errors.push({
      field: "description",
      message: "Scene description cannot be empty"
    });
  }

  if (description.length > 1000) {
    errors.push({
      field: "description",
      message: "Scene description cannot exceed 1000 characters"
    });
  }

  if (description.length < 10) {
    errors.push({
      field: "description",
      message: "Scene description must be at least 10 characters"
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates user choice input
 */
export function validateChoiceInput(choice: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof choice !== "string") {
    errors.push({
      field: "choice",
      message: "Choice must be text"
    });
    return { isValid: false, errors };
  }

  if (choice.trim().length === 0) {
    errors.push({
      field: "choice",
      message: "Your choice cannot be empty"
    });
  }

  if (choice.length > 300) {
    errors.push({
      field: "choice",
      message: "Your choice cannot exceed 300 characters"
    });
  }

  if (choice.length < 3) {
    errors.push({
      field: "choice",
      message: "Your choice must be at least 3 characters"
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates entire story setup
 */
export function validateStorySetup(setup: any): ValidationResult {
  const allErrors: ValidationError[] = [];

  // Validate title
  const titleValidation = validateStoryTitle(setup?.storyTitle);
  allErrors.push(...titleValidation.errors);

  // Validate character name
  const characterValidation = validateCharacterName(setup?.characterName);
  allErrors.push(...characterValidation.errors);

  // Validate genre
  const genreValidation = validateGenre(setup?.genre, [
    "Fantasy",
    "Mystery",
    "Sci-Fi",
    "Horror",
    "Adventure",
    "Romance",
    "Custom Genre"
  ]);
  allErrors.push(...genreValidation.errors);

  // Validate mood
  const moodValidation = validateMood(setup?.mood, [
    "Calm",
    "Dark",
    "Emotional",
    "Suspenseful",
    "Epic",
    "Funny"
  ]);
  allErrors.push(...moodValidation.errors);

  // Validate difficulty is selected
  if (!["Easy", "Normal", "Hard", "Adaptive"].includes(setup?.difficulty)) {
    allErrors.push({
      field: "difficulty",
      message: "Please select a difficulty level"
    });
  }

  // Validate at least one character
  if (!Array.isArray(setup?.characters) || setup.characters.length === 0) {
    allErrors.push({
      field: "characters",
      message: "At least one character is required"
    });
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors
  };
}

/**
 * Formats validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `${e.field}: ${e.message}`).join("\n");
}

/**
 * Gets first error message
 */
export function getFirstErrorMessage(errors: ValidationError[]): string | null {
  return errors[0]?.message ?? null;
}

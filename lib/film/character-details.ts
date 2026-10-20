import type { CharacterDetails, StudioCharacter } from "@/types/studio";

export const CHARACTER_DETAIL_FIELDS = [
  { key: "gender", label: "Gender", choices: ["Female", "Male", "Nonbinary"] },
  { key: "ageRange", label: "Age", choices: ["Child (0–12)", "Teenager (13–17)", "Young adult (18–25)", "Adult (26–39)", "Middle-aged adult (40–59)", "Older adult (60+)"] },
  { key: "nationality", label: "Nationality", choices: ["Pakistani", "British", "American", "Canadian", "Afghan", "Indian", "Bangladeshi", "Saudi", "Emirati"] },
  { key: "ethnicity", label: "Ethnicity / community", choices: ["Punjabi", "Sindhi", "Pashtun", "Baloch", "Saraiki", "Muhajir", "Kashmiri", "Balti", "Burusho", "Wakhi", "Hazara"] },
  { key: "religion", label: "Religion", choices: ["Muslim", "Christian", "Hindu", "Sikh", "Buddhist", "No religion"] },
] as const;

export function normalizedCharacterDetails(details?: CharacterDetails): CharacterDetails {
  const values: CharacterDetails = {};
  for (const key of [...CHARACTER_DETAIL_FIELDS.map(field => field.key), "clothing"] as const) {
    const value = details?.[key]?.trim();
    if (value) values[key] = value;
  }
  return values;
}

export function characterDetailsText(details?: CharacterDetails) {
  const values = normalizedCharacterDetails(details);
  return [...CHARACTER_DETAIL_FIELDS.map(field => values[field.key] ? `${field.label}: ${values[field.key]}` : ""),
    values.clothing ? `Clothing preference: ${values.clothing}` : ""].filter(Boolean).join("; ");
}

export function characterAppearanceText(character: Pick<StudioCharacter, "appearance" | "details">) {
  const details = characterDetailsText(character.details);
  return [character.appearance, details ? `Writer-specified character details: ${details}. Scene-specific wardrobe overrides baseline clothing only; never infer visible features or dress rules from ethnicity or religion.` : ""].filter(Boolean).join("\n");
}

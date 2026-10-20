# Character choices and Pakistan-focused creative direction

## What the writer controls

In Script & Characters → a character → Identity, **Character details (optional)**
offers gender, age, nationality, ethnicity/community, religion and clothing
preferences. Every choice starts unspecified. Presets include Pakistani and
regional communities, and every dropdown also accepts a custom value. These are
fictional character details supplied by the writer, not demographic predictions.

Use **Save character details** to apply them. Appearance can remain blank; saved
details can guide a concept portrait or direct video. Uploaded reference faces
remain the visual identity source. A locked identity must be unlocked before its
details can change. Changes invalidate takes in that character's scenes, without
invalidating unrelated scenes. Clearing a field removes that constraint.

For example, a writer can explicitly choose Female, Young adult, Pakistani,
Muslim and “blue cotton kurta, straight trousers, no headscarf” for Aleeza.
The app carries those choices into assistance, the script director, concept
portraits, scene images and video prompts. A name on its own does not establish
religion, nationality, ethnicity or a dress code.

## Requirements and assumptions

- Explicit current creative instructions and exclusions take priority over
  defaults. Saved character details and scene direction follow, then established
  continuity. Scene wardrobe can override baseline clothing; a supplied face and
  stable visual identity are preserved.
- Creative commands inside a script, such as “no dupatta,” remain actionable.
  Requests to change system rules, reveal secrets or perform app actions are not
  treated as creative directions.
- When no place or cultural setting is supplied or implied, contemporary
  Pakistani everyday life is an editable product default. Explicit foreign,
  diaspora, historical, fantasy and science-fiction settings take precedence.
- Only missing details are invented. The “Let Omni do it” response must include
  one reusable visual profile for each blank character without photo references.
  That description is saved in the existing Appearance field for review/editing.
  Existing nonempty descriptions and reference profiles are preserved.
- Cultural identity does not prescribe one skin tone, face, hairstyle, head
  covering, occupation or religious practice. A dupatta is not automatically a
  hijab. Honour both requested head coverings and requested uncovered hair.
- Region, period, weather, occasion and profession guide clothing and props.
  Ordinary scenes should remain ordinary: no automatic flags, mosques, weddings,
  adhan, conflict, mountains or ceremonial clothing. Regional context does not
  change dialogue language or enable the unvalidated Urdu generation route.

## Regional reference material

The implementation distinguishes Punjab/Lahore, Sindh/Karachi/Thatta, Khyber
Pakhtunkhwa/Peshawar/Chitral, Balochistan, Gilgit-Baltistan and Islamabad. Notes
provide relevant options; they do not put every regional detail into every shot.
An explicit current scene location takes priority over the broader story locale.

Pakistan's Ministry of Foreign Affairs describes regional variations in
shalwar-kameez, ajrak block printing, and copper/brass craft. These inform optional
clothing and prop suggestions. [Official cultural overview](https://mofa.gov.pk/mazar-e-sharif-culture).

Lahore Fort and Shalamar Gardens are specific Mughal heritage sites in Lahore;
they should not replace a modern campus or an unrelated city.
[UNESCO: Fort and Shalamar Gardens](https://whc.unesco.org/en/list/171/).

Makli is associated with Thatta and the heritage of Sindh, rather than being a
generic backdrop for Karachi. [UNESCO: Makli, Thatta](https://whc.unesco.org/en/list/143/).

Gilgit-Baltistan's official tourism department describes distinct local languages,
crafts, food and regional dress. The implementation uses this diversity as context,
without applying demographic or behavioural generalizations to every character.
[Government of Gilgit-Baltistan: Culture](https://www.visitgilgitbaltistan.gov.pk/categories/posts/3/8).

## Validation

`tests/studio-character-details.cjs` checks persistence, validation, scoped
invalidation, prompt propagation, explicit instruction priority, saved fictional
profiles, foreign scene precedence and reference-profile preservation.
`tests/studio-character-details-browser.cjs` exercises the real character panel:
presets/custom values, clearing religion, delayed-save preservation, retry after
a failed save, saved-state reload, trait-only portraits, locking and mobile layout.
These checks use mocked providers and do not generate paid media.

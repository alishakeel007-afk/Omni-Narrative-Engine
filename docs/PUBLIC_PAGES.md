# Public pages

The landing page and account screens share a white, near-black, and green design. The homepage explains the product through Plan → Scenes → Assemble, shows an illustrative workspace, and introduces the two starting points without requiring visitors to learn the editor first.

The positioning is “Your creative director partner.” The components are in `components/public`, with scoped styles in `app/public.css`. Studio styles and functionality stay separate. Signup and login retain their existing authentication and password rules.

## Starting a conversation

The homepage chat icon opens `/try` for guests and `/studio` for signed-in users. The Plan preview accepts a visitor's own message, and its example story cards are clickable. Enter sends; Shift+Enter adds a line. The preview tabs are clickable too.

Guests can chat in Plan, Scenes, and Assemble. Three successful user messages are shared across all tabs; the third response leads to signup with an option to log in. Switching tabs, refreshing, and retrying the same completed request do not reset or spend extra turns. Failed model replies do not spend a turn. The limit is per guest session, backed by the database and a random HTTP-only cookie, rather than per person or a client-only counter. Trial chat does not invoke media generation, uploads, or export.

The existing `FilmWorkspace` table stores the guest transcript under an anonymous capability owner, separate from authenticated users' project listings. No additional database migration is needed. Guest access expires after 24 hours; expiry blocks access but is not an automatic deletion policy. Add a scheduled cleanup of unclaimed expired guest workspaces for a production deployment. Anonymous trials should also have deployment-level rate limits/budget monitoring; a cookie quota alone cannot identify a person who clears cookies.

After authentication, `/api/studio/guest/claim` checks the private guest capability and atomically transfers the existing workspace to the authenticated owner. All messages, tabs, choices, and proposed plans remain; the app does not resend three prompts or create a duplicate workspace. A resumed browser session can also recover the trial when the user follows a generic login link. Signup displays the third reply so it remains readable after redirection.

`lib/studio/entry.ts` stores a new message or a trial-workspace reference in this browser's local storage for up to 24 hours. The `start` query parameter contains only a random ID. Authentication redirects, including the signup confirmation link, preserve that ID. The account pages show a short preview. A new signed-in homepage message creates a project and submits once; a guest trial transfers its existing workspace without replaying messages. The saved browser reference is removed on success. Failed new-message requests keep their text available for retry. Saved responses recovered after a reload are displayed without resending. Expired or unavailable entries show a recovery message rather than inventing or submitting text.

This handoff is local to the browser; an email link opened on another device cannot retrieve the original message. Browser storage must be available. Keep the existing Supabase redirect allowlist configured for your application's studio URLs, including query parameters.

`node tests/studio-entry.cjs` checks storage and auth redirect handling. `npm run test:studio:guest` checks the real guest quota, reservations, request replay, expiry, and transfer logic with local database/model fixtures. `npm run test:studio:entry` exercises the real homepage, trial, login, signup, AuthProvider, and studio components using local fake authentication and chat services, including three replies across tabs, confirmation in a second tab, failed-message retry, and reload recovery. These checks do not create real accounts, send email, or make AI calls.

## Background films

Two original fictional landscape films were generated through the configured Magic Hour account. Files and provenance are in `public/films`.

The account rejected native 4K generation because of its subscription tier. Its supported LTX 2.5 model generated silent 854 × 480 clips. The delivered 3840 × 2160 files are **upscaled**, not native 4K detail. The current provider watermark remains visible. Native 4K or unwatermarked originals require an appropriate provider plan and replacement assets.

Responsive delivery uses smaller H.264 MP4 files for ordinary screens. The 4K versions are selected on screens at least 2000 CSS pixels wide with eight or more logical CPU cores. Videos load only when visible; offscreen and background-tab videos pause. Reduced-motion and data-saving preferences initially show still posters without requesting video. Visitors can pause motion, and that choice persists across visits. Autoplay is muted and falls back to a poster if unavailable.

`scripts/prepare-public-media.cjs --account` checks account capabilities. Running the script without flags polls already-recorded jobs; generation flags create paid jobs. `scripts/encode-public-media.py` encodes the downloaded sources locally and records the resolution details in the manifest. It requires Python and `imageio_ffmpeg`.

## Verification

Start the local Next.js server, then run `npm run test:public:browser`. The browser suite checks desktop and mobile layouts, real video playback, pause controls, reduced motion, workflow navigation, FAQ behavior, password visibility, and invalid account forms. It never creates accounts, sends emails, or requests generated media. Screenshots go to the ignored `.run-screenshots` directory. Set `STUDIO_CHROME_PATH` if Chrome is installed elsewhere, or `PUBLIC_PREVIEW_URL` for a different local preview URL.

# Supabase PostgreSQL Authentication Setup

This project uses a custom authentication system built with Prisma, Supabase PostgreSQL, bcryptjs, and Next.js App Router API routes.

## Tech Stack

- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage for character images, voice samples, generated audio, images, and short MVP videos
- **ORM**: Prisma
- **Hashing**: bcryptjs
- **Sessions**: JWT tokens via `jose`, stored in HTTP-only cookies
- **Validation**: zod

## Database Schema (`prisma/schema.prisma`)

The authentication system is part of the wider story database:

1. `User`: Stores `id`, `name`, `email`, and securely hashed `passwordHash`.
2. `PasswordResetToken`: Stores hashed reset tokens with expiry and usage state.
3. `UserActivity`: Stores JSON activity metadata for login/signup/story actions.
4. `StoryProject`, `StoryDraft`, `Character`, `Scene`, `Dialogue`, `Choice`, `StoryMemory`, `MediaAsset`, and `VideoGenerationJob`: Store the narrative/video MVP domain.

Passwords and reset tokens are never stored in plain text.

## Authentication Flows

### 1. Signup (`/api/auth/signup`)

- Validates the name, email, and password strength.
- Hashes the password using bcrypt.
- Creates a `User` record in Supabase PostgreSQL through Prisma.
- Logs a `user_signup` activity with JSON metadata.

### 2. Login (`/api/auth/login`)

- Retrieves the user by email.
- Verifies the password against `passwordHash`.
- Creates a signed JWT session that expires in 7 days.
- Sets a secure HTTP-only `session` cookie.
- Logs a `user_login` activity with JSON metadata.

### 3. Session Validation (`/api/auth/me`)

- Reads the `session` cookie.
- Verifies the JWT signature.
- Retrieves and returns the user without the password hash.

### 4. Logout (`/api/auth/logout`)

- Clears the `session` cookie.

### 5. Forgot And Reset Password

- `/api/auth/request-password-reset`: Generates a reset token, hashes it, and stores it with a 15-minute expiry.
- `/api/auth/reset-password`: Compares the submitted token to hashed token records, updates `passwordHash`, and marks the token as used.

## Supabase Setup

1. Create a Supabase project.
2. Copy the PostgreSQL connection string into `.env.local` as `DATABASE_URL`.
3. Add `DIRECT_URL` for Prisma migrations.
4. Add `JWT_SECRET` for signing auth session cookies.
5. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for storage.
4. Run:

```bash
npm run prisma:generate
npm run prisma:migrate
```

For production deployment, use:

```bash
npm run prisma:deploy
```

## Protected Routes

Route protection is implemented in `middleware.ts` at the Edge level. It checks for the `session` cookie on protected paths such as:

- `/dashboard`
- `/setup`
- `/story`
- `/audio-generation`
- `/video`
- `/video-preview`

# SQLite Authentication Setup

This project uses a custom SQLite authentication system built with Prisma, bcryptjs, and Next.js App Router API Routes. It replaces the previous mocked `localStorage` authentication.

## Tech Stack
- **Database**: SQLite
- **ORM**: Prisma
- **Hashing**: bcryptjs
- **Sessions**: JWT tokens (via `jose`) stored in HTTP-Only cookies
- **Validation**: zod

## Database Schema (`prisma/schema.prisma`)
The system consists of two primary models:
1. `User`: Stores `id`, `name`, `email`, and securely hashed `passwordHash`.
2. `PasswordResetToken`: Stores a hashed token for password resets with an expiration date.

*Note*: We NEVER store passwords or reset tokens in plain text. Both are stored as securely generated hashes.

## Authentication Flows

### 1. Signup (`/api/auth/signup`)
- Validates the name, email, and password strength (requires 8+ chars, upper, lower, number, special char).
- Hashes the password using bcrypt.
- Creates a new `User` record in SQLite.

### 2. Login (`/api/auth/login`)
- Retrieves the user by email.
- Verifies the password against `passwordHash` using `bcrypt.compare`.
- Creates a signed JWT session (expires in 7 days).
- Sets a secure, HTTP-only cookie (`session`).

### 3. Session Validation (`/api/auth/me`)
- Reads the `session` cookie.
- Verifies the JWT signature.
- Retrieves and returns the user without the password hash.

### 4. Logout (`/api/auth/logout`)
- Clears the `session` cookie.

### 5. Forgot & Reset Password
- `/api/auth/request-password-reset`: Generates a reset token, hashes it, stores it in the database with a 15-minute expiry. Logs the reset URL to the terminal (for development).
- `/api/auth/reset-password`: Takes the token from the URL, compares it to the hashed tokens in the database, updates the `passwordHash`, and marks the token as used.

## Protected Routes
Route protection is implemented in `middleware.ts` at the Edge level. It checks for the existence of the `session` cookie on paths like:
- `/dashboard`
- `/setup`
- `/story`
- `/audio-generation`
- `/video` (AI Story Studio)
- `/video-preview`

## Useful Commands
- `npm run prisma:generate` - Generates the Prisma Client.
- `npm run prisma:migrate` - Runs migrations and syncs the schema with `dev.db`.
- `npm run prisma:studio` - Opens the Prisma Studio GUI to view database records.

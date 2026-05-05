import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string(),
  userId: z.string(),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(/[a-z]/, "Password must contain at least 1 lowercase letter")
    .regex(/[0-9]/, "Password must contain at least 1 number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 special character"),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid reset password data" }, { status: 400 });
    }

    const { token, userId, newPassword } = result.data;

    // Find valid tokens for this user
    const tokens = await prisma.passwordResetToken.findMany({
      where: {
        userId,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    let validTokenRecord = null;
    for (const record of tokens) {
      const isValid = await bcrypt.compare(token, record.tokenHash);
      if (isValid) {
        validTokenRecord = record;
        break;
      }
    }

    if (!validTokenRecord) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: validTokenRecord.id },
        data: { used: true }
      })
    ]);

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

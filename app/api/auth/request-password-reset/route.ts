import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = await bcrypt.hash(resetToken, 10);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        }
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${resetToken}&id=${user.id}`;
      await sendPasswordResetEmail({ email: user.email, resetUrl });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ 
      message: "If an account exists for this email, a reset link has been sent." 
    });
  } catch (error) {
    console.error("Request reset error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

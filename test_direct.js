require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function runTest() {
  try {
    console.log("1. Starting direct backend test...");
    
    const email = `testuser_${Date.now()}@example.com`;
    const password = "SecurePassword123!";

    console.log(`2. Hashing password for ${email}...`);
    const passwordHash = await bcrypt.hash(password, 10);

    console.log("3. Inserting user into SQLite database (dev.db)...");
    const newUser = await prisma.user.create({
      data: {
        name: "Backend Test User",
        email: email,
        passwordHash: passwordHash
      }
    });

    console.log("   -> User inserted successfully!");
    console.log("   -> ID:", newUser.id);
    console.log("   -> Email:", newUser.email);
    console.log("   -> Hashed Password:", newUser.passwordHash);

    console.log("\n4. Simulating Login (comparing passwords)...");
    const retrievedUser = await prisma.user.findUnique({
      where: { email: email }
    });

    if (!retrievedUser) {
      throw new Error("User not found in database.");
    }

    const isValid = await bcrypt.compare(password, retrievedUser.passwordHash);
    
    if (isValid) {
      console.log("   -> Password match SUCCESS. Login verified.");
    } else {
      console.log("   -> Password match FAILED.");
    }

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await prisma.$disconnect();
    console.log("\nDone. Please check DB Browser to see the new row in the User table!");
    process.exit(0);
  }
}

runTest();

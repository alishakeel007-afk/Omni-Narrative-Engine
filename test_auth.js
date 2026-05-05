async function runTests() {
  console.log("Waiting for Next.js to be ready...");
  
  let retries = 30;
  while (retries > 0) {
    try {
      await fetch("http://localhost:3000");
      break;
    } catch (e) {
      retries--;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("Next.js is up. Testing Signup...");
  try {
    const signupRes = await fetch("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "autotest2@example.com",
        password: "SecurePassword123!",
        confirmPassword: "SecurePassword123!"
      })
    });
    
    console.log("Signup Response Status:", signupRes.status);
    const signupData = await signupRes.json();
    console.log("Signup Response:", signupData);

    console.log("\nTesting Login...");
    const loginRes = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "autotest2@example.com",
        password: "SecurePassword123!"
      })
    });

    console.log("Login Response Status:", loginRes.status);
    const loginData = await loginRes.json();
    console.log("Login Response:", loginData);
    console.log("Set-Cookie header:", loginRes.headers.get("set-cookie"));
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTests();

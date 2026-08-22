import { getEnvValue } from "../lib/env";
import * as fs from "fs";

async function testStabilityAudio() {
  // Try STABILITY_API_KEY first, fallback to BACKGROUND_MUSIC_API_KEY
  let apiKey = getEnvValue(["STABILITY_API_KEY", "BACKGROUND_MUSIC_API_KEY"]);

  if (!apiKey) {
    console.error("Missing API key. Check .env.local");
    process.exit(1);
  }

  console.log("Found API key. Starting generation...");

  const formData = new FormData();
  formData.append("prompt", "mysterious cinematic ambient background score, instrumental");
  formData.append("seconds_total", "10");

  const generateRes = await fetch("https://api.stability.ai/v2beta/stable-audio/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!generateRes.ok) {
    console.error("Generate failed:", generateRes.status, await generateRes.text());
    process.exit(1);
  }

  const generateData = await generateRes.json();
  const id = generateData.id;
  console.log("Generation started. ID:", id);

  while (true) {
    console.log("Polling...");
    await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(`https://api.stability.ai/v2beta/stable-audio/result/${id}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "audio/*"
      }
    });

    if (pollRes.status === 202) {
      console.log("Still running...");
      continue;
    }

    if (!pollRes.ok) {
      console.error("Poll failed:", pollRes.status, await pollRes.text());
      process.exit(1);
    }

    console.log("Generation complete!");
    
    // It usually returns a file
    const buffer = await pollRes.arrayBuffer();
    const contentType = pollRes.headers.get("content-type") || "audio/mpeg";
    console.log(`Received ${buffer.byteLength} bytes of type ${contentType}`);
    
    // Save it
    const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("wav") ? "wav" : "mp3";
    fs.writeFileSync(`test-audio.${ext}`, Buffer.from(buffer));
    console.log(`Saved as test-audio.${ext}`);
    break;
  }
}

testStabilityAudio().catch(console.error);

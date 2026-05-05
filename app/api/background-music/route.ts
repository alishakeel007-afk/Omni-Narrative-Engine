import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sceneMood, sceneTitle, audioPrompt } = body || {};

    // Lookup env keys (support poorly-named example key)
    const apiKey = process.env.BACKGROUND_SOUND_API_KEY || process.env.BG_MUSIC_API_KEY || process.env.NEXT_PUBLIC_BG_MUSIC_KEY;
    const apiUrl = process.env.BG_MUSIC_API_URL || process.env.NEXT_PUBLIC_BG_MUSIC_URL;

    if (!apiKey || !apiUrl) {
      // Return mocked response when no provider is configured
      return NextResponse.json({
        trackUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        title: `Ambient ${sceneMood ?? 'Score'}`,
        mood: sceneMood ?? 'ambient'
      });
    }

    // If configured, proxy to the external background music API
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ sceneMood, sceneTitle, audioPrompt })
    });

    if (!resp.ok) {
      return NextResponse.json({
        trackUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        title: `Ambient ${sceneMood ?? 'Score'}`,
        mood: sceneMood ?? 'ambient'
      });
    }

    const data = await resp.json();
    // Expecting data.trackUrl, data.title, data.mood
    return NextResponse.json({
      trackUrl: data.trackUrl,
      title: data.title ?? `Ambient ${sceneMood ?? 'Score'}`,
      mood: data.mood ?? sceneMood
    });
  } catch (err) {
    return NextResponse.json({
      trackUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      title: 'Ambient Mock',
      mood: 'ambient'
    });
  }
}

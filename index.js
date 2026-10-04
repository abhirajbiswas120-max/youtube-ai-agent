// index.js — Main Agent Orchestrator
'use strict';

require('dotenv').config();

const { fetchTopAIVideos } = require('./services/youtube');
const { sendDigestEmail } = require('./services/mail');

async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       YouTube AI Agent — Starting        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    // ── Step 1: Fetch top 10 AI videos (6 queries, 48h window, deduped) ──
    console.log('[Agent] Fetching top AI videos from YouTube (6 topics, last 48h)...');
    const videos = await fetchTopAIVideos();

    if (!videos || videos.length === 0) {
      console.warn('[Agent] No videos found. The email will not be sent.');
      process.exit(0);
    }

    console.log(`[Agent] Successfully fetched ${videos.length} videos.`);
    console.log('');

    // Print a quick summary table to the console
    console.log('📊 Video Summary:');
    console.log('─'.repeat(72));
    videos.forEach((v, i) => {
      const views = Number(v.viewCount).toLocaleString('en-US');
      const title = v.title.length > 45 ? v.title.slice(0, 44) + '…' : v.title;
      console.log(`  ${String(i + 1).padStart(2, ' ')}. [${views.padStart(12)} views]  ${title}`);
    });
    console.log('─'.repeat(72));
    console.log('');

    // ── Step 2: Send the digest email ────────────────────────────────────
    console.log('[Agent] Building and sending email digest...');
    await sendDigestEmail(videos);

    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     ✅  Digest sent successfully!        ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    console.error('');
    console.error('╔══════════════════════════════════════════╗');
    console.error('║     ❌  Agent encountered an error       ║');
    console.error('╚══════════════════════════════════════════╝');
    console.error('');
    console.error('[Error]', err.message);

    if (err.response?.data) {
      console.error('[YouTube API Error]', JSON.stringify(err.response.data, null, 2));
    }

    process.exit(1);
  }
}

run();

# 🤖 YouTube AI Agent

A Node.js agent that **automatically fetches the top 10 AI-related YouTube videos** from the past 48 hours across 6 topic categories and **emails you a beautiful HTML digest** every day at **6:00 AM IST** via GitHub Actions.

---

## ✨ What It Does

1. Searches YouTube Data API v3 across **6 specific AI topics** simultaneously:
   - `AI agent tutorial`
   - `AI app development`
   - `AI game development`
   - `AI automation tools`
   - `build app using AI`
   - `no code AI agent`
2. Fetches videos from the **last 48 hours** (50 results per topic = up to 300 raw results)
3. **Merges + deduplicates** all results by video ID
4. **Sorts by view count** (descending) and picks the **top 10**
5. Sends a **stunning dark-themed HTML email** with:
   - Video thumbnail
   - Clickable title
   - Channel name
   - View count
   - Upload date
   - "Watch on YouTube" button

---

## 🚀 Quick Start (Local)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Your `.env`
Copy `.env.example` to `.env` and fill in your credentials:

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_16_character_app_password
MAIL_TO=recipient@gmail.com
```

### 3. Run the Agent
```bash
node index.js
```

---

## ☁️ Automated Daily Run via GitHub Actions

The agent runs **automatically every day at 6:00 AM IST** using GitHub Actions.

### Setup Steps:
1. Push this repo to GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Add these 4 secrets:

| Secret Name | Description |
|-------------|-------------|
| `YOUTUBE_API_KEY` | Your YouTube Data API v3 key |
| `GMAIL_USER` | Your Gmail address |
| `GMAIL_PASS` | Your 16-character Gmail App Password |
| `MAIL_TO` | Recipient email address(es) |

That's it — GitHub handles everything from there. ✅

---

## 📁 Project Structure

```
youtube-ai-agent/
├── index.js                      ← Main orchestrator
├── services/
│   ├── youtube.js                ← YouTube API (6 queries, 48h, dedupe, top 10)
│   └── mail.js                   ← HTML email builder + Gmail sender
├── .github/
│   └── workflows/
│       └── daily.yml             ← GitHub Actions (6AM IST daily cron)
├── run-agent.bat                 ← One-click Windows launcher
├── .env                          ← Your secrets (never committed)
├── .env.example                  ← Template
├── package.json
└── .gitignore
```

---

## 🔒 Security Notes

- **`.env` is in `.gitignore`** — your secrets are never committed
- GitHub Actions uses **encrypted Secrets** — never exposed in logs
- Uses Gmail **App Password** (not your real password)

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `axios` | HTTP requests to YouTube Data API |
| `nodemailer` | Sending emails via Gmail SMTP |
| `dotenv` | Loading `.env` environment variables |

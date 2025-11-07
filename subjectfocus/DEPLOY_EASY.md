# Deploy Canvas API (Super Easy for Mac Users)

## Option 1: Railway.app (Recommended - 5 minutes) ⭐

**Why Railway?** Zero configuration, free tier, automatic HTTPS, just click buttons!

### Step 1: Sign Up
1. Go to **railway.app**
2. Click "Start a New Project"
3. Sign up with GitHub (click "Login with GitHub")

### Step 2: Push Your Code to GitHub
1. Open GitHub.com
2. Create a new repository called `canvas-api` (can be private)
3. On your Mac, open Terminal and run:
   ```bash
   cd /Users/maxwellmoroz/subjectfocus
   git add appcanvas.py canvas_dump_lib.py canvas_dump_utils.py requirements-canvas-api.txt
   git commit -m "Add Canvas API"
   git push
   ```

### Step 3: Deploy on Railway
1. Back in Railway, click **"Deploy from GitHub repo"**
2. Select your `canvas-api` repository
3. Railway will automatically detect it's a Python app and deploy it!

### Step 4: Add Your Secrets
1. In Railway, click on your deployed service
2. Click the **"Variables"** tab
3. Add these variables:
   - Click **"New Variable"**
   - Name: `SUBJECTFOCUS_API_KEY`
   - Value: Make up a secure password (like `MySecretKey12345`)
   - Click "Add"

4. Add your Canvas token:
   - Click **"New Variable"** again
   - Name: `CANVAS_TOKEN`
   - Value: (paste your Canvas API token from token.txt)
   - Click "Add"

### Step 5: Get Your URL
1. Click the **"Settings"** tab
2. Scroll to **"Domains"**
3. Click **"Generate Domain"**
4. Copy your URL! It will look like: `https://canvas-api-production.up.railway.app`

### Step 6: Test It!
Open this in your browser (replace with your URL):
```
https://your-app.up.railway.app/health
```

You should see: `{"ok": true, ...}`

**Done!** 🎉

### How to Use It from n8n or anywhere:
```
URL: https://your-app.up.railway.app/dump/async?course_id=12345
Header: X-API-Key: MySecretKey12345
```

---

## Option 2: Ngrok (2 minutes, but requires your Mac to stay on)

**Why Ngrok?** Super fast setup, but your Mac needs to stay running.

### Step 1: Install Ngrok
1. Go to **ngrok.com**
2. Sign up (free)
3. Download ngrok for Mac
4. Unzip it and move `ngrok` to your Desktop

### Step 2: Start Your API Locally
1. Open Terminal
2. Run:
   ```bash
   cd /Users/maxwellmoroz/subjectfocus
   ./start-canvas-api.sh --dev
   ```
3. Keep this Terminal window open!

### Step 3: Create Tunnel
1. Open a NEW Terminal window
2. Run:
   ```bash
   cd ~/Desktop
   ./ngrok http 8000
   ```

### Step 4: Get Your URL
You'll see something like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:8000
```

Copy that `https://abc123.ngrok.io` URL!

### Step 5: Test It
Open in browser:
```
https://abc123.ngrok.io/health
```

**Done!** 🎉

⚠️ **Important:**
- Your Mac must stay on and connected to internet
- The URL changes every time you restart ngrok (unless you pay for a static URL)
- Free tier has request limits

---

## Option 3: Render.com (Also Easy, 5 minutes)

Very similar to Railway:

1. Go to **render.com**
2. Sign up with GitHub
3. Click **"New +" → "Web Service"**
4. Connect your GitHub repository
5. Render auto-detects Python
6. Add environment variables:
   - `SUBJECTFOCUS_API_KEY`
   - `CANVAS_TOKEN`
7. Click **"Create Web Service"**
8. Wait 2-3 minutes for deployment
9. Get your URL from the dashboard

**Done!** 🎉

---

## Recommended for You: Railway

For most people, **Railway** is the best choice because:
- ✅ Always online (don't need to keep Mac running)
- ✅ Free tier (500 hours/month)
- ✅ Automatic HTTPS
- ✅ Static URL (doesn't change)
- ✅ Easy to update (just `git push`)
- ✅ Automatic restarts if it crashes

---

## Troubleshooting

### "Cannot read token.txt"
The `token.txt` file won't work on Railway/Render. That's why you need to add `CANVAS_TOKEN` as an environment variable instead.

**Fix needed:** Update `canvas_dump_lib.py` to read from environment variable.

### "Unauthorized"
Make sure you're sending the `X-API-Key` header with every request.

### "App crashed"
Check the logs in Railway/Render dashboard. Most common issue is missing the Canvas token.

---

## Cost

All three options have generous free tiers:
- **Railway:** $5 free credit/month (enough for this app)
- **Ngrok:** Free (with limits)
- **Render:** 750 free hours/month

You won't pay anything unless you get massive traffic! 💰

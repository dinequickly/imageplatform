# 🔧 Fix Railway Deployment Failure

## The Problem

Railway is failing because your repo has **both**:
- ✅ React/Vite frontend app (`package.json`, `src/`, etc.)
- ✅ Python Canvas API (`appcanvas.py`, etc.)

Railway sees `package.json` and tries to build the Node.js app instead of the Python API! 😅

---

## ⭐ THE FIX (Super Easy - 3 minutes)

### Run This ONE Command:

```bash
cd /Users/maxwellmoroz/subjectfocus
./package-for-deploy.sh
```

This creates a clean folder on your Desktop with **only** the Canvas API files!

### Then Follow These Steps:

```bash
# 1. Go to the new folder
cd ~/Desktop/canvas-api-deploy

# 2. Set up git
git init
git add .
git commit -m "Canvas API"

# 3. Create a GitHub repo
# Go to: https://github.com/new
# Name it: canvas-api
# Keep it PUBLIC (or private if you have paid GitHub)
# DON'T initialize with README

# 4. Push to GitHub (replace YOUR-USERNAME!)
git remote add origin https://github.com/YOUR-USERNAME/canvas-api.git
git branch -M main
git push -u origin main
```

### Now Deploy on Railway:

1. Go to **railway.app**
2. Click **"Deploy from GitHub repo"**
3. Select your **NEW** repo: `canvas-api` (NOT subjectfocus!)
4. Railway will auto-deploy ✅

### Add Environment Variables:

In Railway dashboard:
- Click your service
- Go to **Variables** tab
- Add these:
  - `CANVAS_TOKEN` = (paste your Canvas token)
  - `SUBJECTFOCUS_API_KEY` = (make up a password like `MySecret123`)

### Done! 🎉

Get your URL from: **Settings** → **Domains** → **Generate Domain**

---

## Alternative: Keep Your Current Deployment Attempt

If you want to fix the existing Railway deployment in your main repo:

1. Delete the failed deployment in Railway
2. In your `subjectfocus` repo, commit these files:
   ```bash
   git add .railwayignore railway.json
   git commit -m "Fix Railway deployment"
   git push
   ```
3. Try deploying again

**BUT** I recommend the separate repo approach above - it's cleaner! ✨

---

## Why Does This Happen?

Railway auto-detects your project type. When it sees:
- `package.json` → "This is Node.js!"
- `requirements.txt` → "This is Python!"

Your repo has both, so Railway gets confused and picks Node.js (wrong!). By creating a separate repo with only Python files, Railway correctly detects it as a Python project.

---

## Quick Reference

**Your main app (already on Vercel):**
- Repo: `subjectfocus`
- Platform: Vercel
- Stack: React + Vite + Supabase
- URL: reasonable-renewal (production)

**Your new Canvas API (deploy on Railway):**
- Repo: `canvas-api` (new, separate)
- Platform: Railway
- Stack: Python + FastAPI
- URL: (will get from Railway)

Both can coexist perfectly! 🚀

---

## Need Help?

**"How do I create a GitHub repo?"**
1. Go to github.com
2. Click the **+** icon (top right)
3. Click **"New repository"**
4. Name: `canvas-api`
5. Click **"Create repository"**
6. Copy the commands shown and paste them in Terminal

**"How do I get my Canvas token?"**
1. Go to: https://nulondon.instructure.com/profile/settings
2. Scroll to "Approved Integrations"
3. Click "+ New Access Token"
4. Copy the token that appears

**"Still failing?"**
Check Railway logs:
- Click your deployment
- Go to **"Build Logs"** tab
- Look for the error message
- Share it with me!

---

## Success Looks Like This:

```
✅ Build succeeded
✅ Deploy succeeded
✅ Service is live at: https://canvas-api-xxx.railway.app
```

Visit `https://your-url.railway.app/health` and you should see:
```json
{"ok": true, "user": "Your Name", ...}
```

🎉 **You're deployed!**

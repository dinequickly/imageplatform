# 🚀 Canvas API - Start Here!

## Super Quick Start (Choose ONE option)

---

### ⭐ EASIEST: Railway (Recommended)
**Always online, no Mac needed, 100% free**

#### 1. Install Dependencies (one time only)
```bash
pip install -r requirements-canvas-api.txt
```

#### 2. Push to GitHub
```bash
git add .
git commit -m "Add Canvas API"
git push
```

#### 3. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Login with GitHub
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Done! Railway auto-deploys 🎉

#### 4. Add Your Secrets
In Railway dashboard:
- Click your service → **Variables** tab
- Add: `CANVAS_TOKEN` = (your Canvas API token)
- Add: `SUBJECTFOCUS_API_KEY` = (make up a password like `MySecret123`)

#### 5. Get Your URL
- Click **Settings** → **Domains**
- Click **Generate Domain**
- Copy your URL! (like `https://canvas-api-xxx.railway.app`)

**Test it:**
```
https://your-url.railway.app/health
```

---

### ⚡ FASTEST: Ngrok (2 minutes)
**Requires your Mac to stay on, but super fast setup**

#### 1. Install Ngrok
```bash
brew install ngrok/ngrok/ngrok
```
(Don't have Homebrew? Download from [ngrok.com/download](https://ngrok.com/download))

#### 2. Run This ONE Command
```bash
./deploy-ngrok-simple.sh
```

That's it! You'll get a public URL instantly! 🎉

---

## Which Should I Choose?

| Option | Best For | Pros | Cons |
|--------|----------|------|------|
| **Railway** | Production use, n8n webhooks | Always online, free, easy updates | Initial setup (5 min) |
| **Ngrok** | Quick testing | Super fast (2 min) | Mac must stay on, URL changes |

---

## Using Your API

Once deployed, use it from anywhere:

### From n8n:
```
URL: https://your-url/dump/async?course_id=12345
Method: GET
Headers:
  X-API-Key: MySecret123
```

### From browser:
```
https://your-url/dump/async?course_id=12345
```
(Add `?x_api_key=MySecret123` if you get "unauthorized")

### Check job status:
```
https://your-url/status/job_12345_abc123
```

---

## Help!

### "pip: command not found"
Install Python first:
```bash
brew install python
```

### "ngrok: command not found"
Install Homebrew first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install ngrok:
```bash
brew install ngrok/ngrok/ngrok
```

### "token.txt not found"
1. Go to https://nulondon.instructure.com/profile/settings
2. Scroll to "Approved Integrations"
3. Click "+ New Access Token"
4. Copy the token
5. Create a file called `token.txt` and paste it in

### Still stuck?
Read the full guide: [DEPLOY_EASY.md](DEPLOY_EASY.md)

---

## What's Next?

Once deployed, your API has these endpoints:

- `GET /health` - Check if it's working
- `GET /dump?course_id=X` - Download course (waits for completion)
- `GET /dump/async?course_id=X` - Download course (returns immediately)
- `GET /status/{job_id}` - Check job status
- `GET /jobs` - List all jobs

Full docs: http://your-url/docs

🎉 **You're all set!**

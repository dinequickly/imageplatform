#!/bin/bash

echo "📦 Packaging Canvas API for Deployment"
echo "======================================"
echo ""

# Create deployment directory
DEPLOY_DIR="$HOME/Desktop/canvas-api-deploy"

if [ -d "$DEPLOY_DIR" ]; then
    echo "⚠️  $DEPLOY_DIR already exists. Removing..."
    rm -rf "$DEPLOY_DIR"
fi

mkdir -p "$DEPLOY_DIR"

echo "✅ Created deployment directory: $DEPLOY_DIR"
echo ""

# Copy only the files we need
echo "📋 Copying files..."
cp appcanvas.py "$DEPLOY_DIR/"
cp canvas_dump_lib.py "$DEPLOY_DIR/"
cp canvas_dump_utils.py "$DEPLOY_DIR/"
cp requirements-canvas-api.txt "$DEPLOY_DIR/"
cp Procfile "$DEPLOY_DIR/"
cp railway.json "$DEPLOY_DIR/"

echo "✅ Files copied!"
echo ""

# Create README
cat > "$DEPLOY_DIR/README.md" << 'EOF'
# Canvas Dump API

Minimal deployment package for the Canvas course dump API.

## Deploy to Railway

1. Initialize git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create GitHub repo at https://github.com/new

3. Push code:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/canvas-api.git
   git branch -M main
   git push -u origin main
   ```

4. Deploy on Railway:
   - Go to railway.app
   - Click "Deploy from GitHub repo"
   - Select your new repo
   - Add environment variables:
     - `CANVAS_TOKEN` (your Canvas API token)
     - `SUBJECTFOCUS_API_KEY` (your secret key)

## Environment Variables

- `CANVAS_TOKEN` - Your Canvas LMS API token (required)
- `SUBJECTFOCUS_API_KEY` - API key for authentication (optional but recommended)

## Endpoints

- `GET /health` - Health check
- `GET /dump?course_id=X` - Dump course (blocking)
- `GET /dump/async?course_id=X` - Dump course (async, recommended)
- `GET /status/{job_id}` - Check job status
- `GET /jobs` - List all jobs

Full docs at: `/docs`
EOF

echo "✅ Created README.md"
echo ""

# Create .gitignore
cat > "$DEPLOY_DIR/.gitignore" << 'EOF'
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
*.env
.env.local
token.txt
output/
*.log
.DS_Store
EOF

echo "✅ Created .gitignore"
echo ""

echo "🎉 Package complete!"
echo ""
echo "Next steps:"
echo "==========="
echo "1. cd $DEPLOY_DIR"
echo "2. git init"
echo "3. git add ."
echo "4. git commit -m 'Canvas API'"
echo "5. Create repo on GitHub: https://github.com/new"
echo "6. git remote add origin https://github.com/YOUR-USERNAME/canvas-api.git"
echo "7. git push -u origin main"
echo "8. Deploy on Railway: https://railway.app"
echo ""
echo "📁 Files are ready in: $DEPLOY_DIR"

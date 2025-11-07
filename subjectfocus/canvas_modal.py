import modal
from datetime import datetime, timedelta
import requests
import json

# Create Modal app
app = modal.App("canvas-sync")

# Define image with dependencies
image = modal.Image.debian_slim().pip_install(
    "canvasapi",
    "requests",
    "fastapi"  # If you want to run LLM in Modal too
)

# Secrets for API keys
canvas_secret = modal.Secret.from_name("canvas-credentials")
n8n_secret = modal.Secret.from_name("n8n-webhook")

# ============================================
# FULL COURSE SYNC (Run once per course)
# ============================================

@app.function(
    image=image,
    secrets=[canvas_secret, n8n_secret],
    timeout=900  # 15 minutes for large courses
)
def sync_full_course(course_id: int, user_id: str):
    """Fetch complete course structure and content"""
    from canvasapi import Canvas
    import os
    
    canvas = Canvas(
        os.environ["CANVAS_URL"],
        os.environ["CANVAS_TOKEN"]
    )
    
    course = canvas.get_course(course_id)
    
    course_data = {
        "course_id": course.id,
        "course_name": course.name,
        "course_code": course.course_code,
        "modules": []
    }
    
    print(f"📚 Syncing: {course.name}")
    
    # Get all modules
    modules = course.get_modules()
    
    for module in modules:
        print(f"  📂 Module: {module.name} ({module.items_count} items)")
        
        module_data = {
            "module_id": module.id,
            "module_name": module.name,
            "position": module.position,
            "items": []
        }
        
        # Get all items in module
        items = module.get_module_items()
        
        for item in items:
            item_data = {
                "item_id": item.id,
                "title": item.title,
                "type": item.type,
                "position": item.position,
                "html_url": getattr(item, 'html_url', None),
                "url": getattr(item, 'url', None),
                "content": None
            }
            
            # Fetch content based on type
            try:
                if item.type == "Page":
                    page = course.get_page(item.page_url)
                    item_data["content"] = page.body
                    item_data["updated_at"] = str(page.updated_at)
                    print(f"    ✓ Page: {item.title}")
                
                elif item.type == "Assignment":
                    assignment = course.get_assignment(item.content_id)
                    item_data["content"] = assignment.description
                    item_data["due_at"] = str(getattr(assignment, 'due_at', None))
                    item_data["points_possible"] = assignment.points_possible
                    print(f"    ✓ Assignment: {item.title}")
                
                elif item.type == "Quiz":
                    quiz = course.get_quiz(item.content_id)
                    item_data["content"] = quiz.description
                    item_data["due_at"] = str(getattr(quiz, 'due_at', None))
                    print(f"    ✓ Quiz: {item.title}")
                
            except Exception as e:
                print(f"    ✗ Could not fetch {item.title}: {str(e)}")
            
            module_data["items"].append(item_data)
        
        course_data["modules"].append(module_data)
    
    # Send to n8n
    response = requests.post(
        os.environ["N8N_WEBHOOK_URL"],
        json={
            "user_id": user_id,
            "course_data": course_data,
            "synced_at": datetime.utcnow().isoformat(),
            "sync_type": "full"
        }
    )
    
    print(f"✅ Synced {course.name}: {response.status_code}")
    return {"status": "success", "course_name": course.name}


# ============================================
# INCREMENTAL UPDATES (Run every 4 hours)
# ============================================

@app.function(
    image=image,
    secrets=[canvas_secret, n8n_secret],
    timeout=300,
    schedule=modal.Cron("0 */4 * * *")  # Every 4 hours
)
def sync_incremental_updates():
    """Check for new/updated content across all courses"""
    from canvasapi import Canvas
    import os
    
    canvas = Canvas(
        os.environ["CANVAS_URL"],
        os.environ["CANVAS_TOKEN"]
    )
    
    user = canvas.get_current_user()
    courses = user.get_courses(enrollment_state='active')
    
    # Check last 24 hours
    since = datetime.utcnow() - timedelta(hours=24)
    
    all_updates = []
    
    for course in courses:
        print(f"🔍 Checking: {course.name}")
        
        try:
            modules = course.get_modules()
            
            for module in modules:
                items = module.get_module_items()
                
                for item in items:
                    if item.type == "Page":
                        try:
                            page = course.get_page(item.page_url)
                            if page.updated_at > since:
                                all_updates.append({
                                    "course_id": course.id,
                                    "course_name": course.name,
                                    "module_id": module.id,
                                    "item_id": item.id,
                                    "title": item.title,
                                    "type": item.type,
                                    "content": page.body,
                                    "updated_at": str(page.updated_at)
                                })
                                print(f"  📝 Update: {item.title}")
                        except:
                            pass
        except Exception as e:
            print(f"  ✗ Error checking {course.name}: {str(e)}")
    
    if all_updates:
        print(f"✅ Found {len(all_updates)} updates")
        requests.post(
            os.environ["N8N_WEBHOOK_INCREMENTAL"],
            json={
                "user_id": user.id,
                "updates": all_updates,
                "synced_at": datetime.utcnow().isoformat(),
                "sync_type": "incremental"
            }
        )
    else:
        print("✅ No updates found")
    
    return {"updates_found": len(all_updates)}


# ============================================
# ON-DEMAND SYNC (Webhook endpoint)
# ============================================

@app.function(
    image=image,
    secrets=[canvas_secret, n8n_secret],
    timeout=900
)
@modal.web_endpoint(method="POST")
def webhook_sync(data: dict):
    """
    Webhook endpoint that your frontend can call
    POST https://your-modal-app.modal.run/webhook-sync
    {
      "course_id": 6536,
      "user_id": "uuid",
      "sync_type": "full"
    }
    """
    course_id = data.get("course_id")
    user_id = data.get("user_id")
    sync_type = data.get("sync_type", "full")
    
    if sync_type == "full":
        result = sync_full_course.remote(course_id, user_id)
    else:
        result = sync_incremental_updates.remote()
    
    return {"status": "success", "result": result}
@app.function(
    image=image,
    secrets=[canvas_secret],
    timeout=60
)
def list_my_courses():
    """Debug function to see what courses your token can access"""
    from canvasapi import Canvas
    import os
    
    canvas = Canvas(
        os.environ["CANVAS_URL"],
        os.environ["CANVAS_TOKEN"]
    )
    
    try:
        user = canvas.get_current_user()
        print(f"✅ Authenticated as: {user.name}")
        
        courses = list(user.get_courses(enrollment_state='active'))
        
        print(f"\n📚 Found {len(courses)} courses:\n")
        for course in courses:
            print(f"  ID: {course.id}")
            print(f"  Name: {course.name}")
            print(f"  Code: {course.course_code}")
            print(f"  ---")
        
        return {
            "user": user.name,
            "courses": [
                {
                    "id": c.id,
                    "name": c.name,
                    "code": c.course_code
                }
                for c in courses
            ]
        }
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {"error": str(e)}
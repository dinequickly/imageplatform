from canvasapi import Canvas

CANVAS_URL = "https://nulondon.instructure.com"
CANVAS_TOKEN = "16764~UEY7ctBEXJGeh6FHZ2BVW3KazEecJ74wyDff8TvGzrrTwEUvJhUDQcNTE8aQmJzf"

canvas = Canvas(CANVAS_URL, CANVAS_TOKEN)

# Test 1: Get current user
user = canvas.get_current_user()
print(f"✅ Authenticated as: {user.name}")

# Test 2: List all courses
courses = list(user.get_courses(enrollment_state='active'))

print(f"\n📚 Found {len(courses)} courses:\n")
for course in courses:
    print(f"ID: {course.id}")
    print(f"Name: {course.name}")
    print(f"Code: {course.course_code}")
    print("---")

# Test 3: Try to access course 6536
try:
    test_course = canvas.get_course(6536)
    print(f"\n✅ Can access course: {test_course.name}")
except Exception as e:
    print(f"\n❌ Cannot access course 6536: {e}")
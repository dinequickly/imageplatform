import os

file_path = '/opt/miniconda3/envs/sam3_env/lib/python3.11/site-packages/sam3/train/data/sam3_image_dataset.py'

with open(file_path, 'r') as f:
    content = f.read()

target_import = 'from decord import cpu, VideoReader'
replacement = '''try:
    from decord import cpu, VideoReader
except ImportError:
    def cpu(x): return x
    class VideoReader:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("VideoReader not available")
'''

if target_import in content:
    new_content = content.replace(target_import, replacement)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Successfully patched sam3_image_dataset.py")
else:
    print("Target import not found in sam3_image_dataset.py")

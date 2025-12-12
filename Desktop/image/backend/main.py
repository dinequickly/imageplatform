import os
import io
import base64
import time
from typing import List, Optional

from fastapi import FastAPI, UploadFile, Form, File
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np
import torch

# Initialize FastAPI
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model state
model = None
processor = None
MOCK_MODE = False

def init_sam3():
    global model, processor, MOCK_MODE
    try:
        import sam3
        from sam3 import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor
        
        print("Initializing SAM 3...")
        sam3_root = os.path.join(os.path.dirname(sam3.__file__), "..")
        bpe_path = f"{sam3_root}/assets/bpe_simple_vocab_16e6.txt.gz"
        
        # Check if assets exist, if not warn
        if not os.path.exists(bpe_path):
            print(f"Warning: SAM 3 BPE file not found at {bpe_path}")
        
        model = build_sam3_image_model(bpe_path=bpe_path)
        processor = Sam3Processor(model, confidence_threshold=0.5)
        print("SAM 3 Initialized successfully.")
        
    except ImportError as e:
        print(f"SAM 3 not found or failed to load: {e}")
        print("Running in MOCK MODE.")
        MOCK_MODE = True
    except Exception as e:
        print(f"Error initializing SAM 3: {e}")
        print("Running in MOCK MODE.")
        MOCK_MODE = True

# Initialize on startup (or lazy load)
# init_sam3() # Uncomment to load on start, but better to do it safely

@app.on_event("startup")
async def startup_event():
    init_sam3()

def mask_to_base64(mask_np):
    """Convert boolean numpy mask to base64 PNG"""
    # Create an RGBA image: white pixels where mask is True, transparent where False
    h, w = mask_np.shape
    img_data = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Set Alpha channel: 255 if mask, 0 if not
    img_data[..., 3] = (mask_np * 255).astype(np.uint8)
    # Set RGB to White (or any color)
    img_data[..., 0] = 255
    img_data[..., 1] = 255
    img_data[..., 2] = 255
    
    img = Image.fromarray(img_data)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

@app.post("/segment")
async def segment_image(
    file: UploadFile = File(...),
    prompt: str = Form(...)
):
    global processor, model, MOCK_MODE
    
    print(f"Received segmentation request for prompt: {prompt}")
    
    # Read Image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    width, height = image.size
    
    masks_b64 = []
    
    if MOCK_MODE:
        # Generate a fake circular mask in the center
        print("Generating MOCK masks...")
        time.sleep(1) # Simulate inference
        
        mask = np.zeros((height, width), dtype=bool)
        y, x = np.ogrid[:height, :width]
        center_y, center_x = height // 2, width // 2
        radius = min(height, width) // 4
        mask_area = (x - center_x)**2 + (y - center_y)**2 <= radius**2
        mask[mask_area] = True
        
        masks_b64.append(mask_to_base64(mask))
        
        return {
            "success": True,
            "masks": masks_b64,
            "message": "Mock SAM 3 result returned."
        }

    try:
        # 1. Set Image
        inference_state = processor.set_image(image)
        
        # 2. Reset Prompts
        processor.reset_all_prompts(inference_state)
        
        # 3. Set Text Prompt
        prompts = [p.strip() for p in prompt.split(',') if p.strip()]
        
        all_masks = []
        
        for p in prompts:
            print(f"Running SAM 3 for prompt: '{p}'")
            
            # Reset prompts for each new query if we want distinct segments
            processor.reset_all_prompts(inference_state)
            
            # Run Inference
            output = processor.set_text_prompt(state=inference_state, prompt=p)
            
            # Extract Masks
            # Output structure: {"masks": Tensor, "boxes": Tensor, "scores": Tensor}
            if "masks" in output:
                masks_tensor = output["masks"]
                # masks_tensor shape is likely [N, H, W] or [N, 1, H, W]
                # We need to convert to numpy boolean
                
                # Move to CPU and numpy
                masks_np = masks_tensor.cpu().numpy()
                
                # If shape is [N, 1, H, W], squeeze it
                if masks_np.ndim == 4:
                    masks_np = masks_np.squeeze(1)
                
                # Iterate over detected instances
                for i in range(masks_np.shape[0]):
                    # Check score if needed (output["scores"][i])
                    mask_bool = masks_np[i] > 0 # Threshold usually 0 or 0.5 depending on logits
                    
                    # Convert to Base64
                    b64 = mask_to_base64(mask_bool)
                    all_masks.append(b64)
            else:
                print(f"No masks found for prompt: {p}")

        return {
            "success": True,
            "masks": all_masks,
            "message": f"Segmented {len(all_masks)} objects."
        }
        
    except Exception as e:
        print(f"Inference Error: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

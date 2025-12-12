import sys
import json
import base64
import io
import os
import numpy as np

# Ensure standard output uses UTF-8
sys.stdout.reconfigure(encoding='utf-8')

try:
    from PIL import Image
    import torch
    # Import SAM3 directly
    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {str(e)}. Please run: pip install git+https://github.com/facebookresearch/sam3.git torch pillow"}))
    sys.exit(0)

def main():
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data:
            return

        try:
            request = json.loads(input_data)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON input"}))
            return

        image_b64 = request.get('imageBase64')
        
        if not image_b64:
            print(json.dumps({"error": "No image data provided"}))
            return

        # Clean base64 string
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        # Decode image
        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")

        # Determine device
        device = "cpu"
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        
        # Load Model
        # This will download the checkpoint on first run if not present
        model = build_sam3_image_model() 
        model.to(device)
        processor = Sam3Processor(model)

        # Prepare Inference
        inference_state = processor.set_image(image)

        # Prompt the model - "segment everything" equivalent or just find all objects?
        # SAM3 "segment everything" often implies prompting with a grid of points or similar
        # But here we can use a generic text prompt like "object" or "thing" if we want general segmentation,
        # OR we can try to find an API in processor that does automatic mask generation.
        # However, the user snippet showed: output = processor.set_text_prompt(state=inference_state, prompt="<YOUR_TEXT_PROMPT>")
        
        # For "segment everything" behavior without a specific prompt, standard SAM uses grid points.
        # SAM3 might be different. Let's try a generic prompt "everything" or "object".
        # Better yet, let's see if we can just return all candidate masks.
        
        # Since the user UI expects "segmentation" often implying "auto-segment",
        # we will use a generic prompt "all objects" or similar if no prompt is provided.
        # BUT, the current API request from the frontend doesn't pass a prompt for 'segment' action, it just sends the image.
        # So we default to "objects".
        
        output = processor.set_text_prompt(state=inference_state, prompt="objects")

        # output contains "masks", "boxes", "scores"
        masks = output["masks"] # list of tensors? or tensor?
        scores = output["scores"]
        
        # Process outputs
        masks_data = []
        
        # masks is likely a list or tensor of shape (N, H, W)
        if isinstance(masks, torch.Tensor):
            masks_cpu = masks.cpu().numpy()
            scores_cpu = scores.cpu().numpy()
        else:
            # If it's a list
             masks_cpu = [m.cpu().numpy() for m in masks]
             scores_cpu = [s.cpu().numpy() for s in scores]

        # Iterate
        for i in range(len(masks_cpu)):
            mask_array = masks_cpu[i]
            score = float(scores_cpu[i])
            
            # mask_array is likely boolean or float 0..1. 
            # Convert to uint8 0..255
            if mask_array.dtype == bool:
                mask_uint8 = (mask_array * 255).astype(np.uint8)
            else:
                 mask_uint8 = (mask_array * 255).astype(np.uint8)

            # Squeeze if necessary (H, W)
            if mask_uint8.ndim > 2:
                mask_uint8 = mask_uint8.squeeze()

            mask_img = Image.fromarray(mask_uint8)
            
            # Convert to base64 PNG
            buffered = io.BytesIO()
            mask_img.save(buffered, format="PNG")
            mask_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            masks_data.append({
                "mask": mask_b64,
                "score": score,
                "label": "object"
            })

        print(json.dumps({
            "type": "masks",
            "data": masks_data
        }))

    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
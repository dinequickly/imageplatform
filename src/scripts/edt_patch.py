# Copyright (c) Meta Platforms, Inc. and affiliates. All Rights Reserved

"""
CPU-compatible replacement for Triton kernel for euclidean distance transform (EDT).
Uses OpenCV instead of Triton/CUDA.
"""

import torch
import cv2
import numpy as np

def edt_triton(data: torch.Tensor):
    """
    Computes the Euclidean Distance Transform (EDT) of a batch of binary images.
    CPU fallback implementation using OpenCV.
    
    Args:
        data: A tensor of shape (B, H, W) representing a batch of binary images.
              Expects data to be boolean or 0/1, where 0 is background (target) and 1 is foreground.

    Returns:
        A tensor of the same shape as data containing the EDT.
    """
    device = data.device
    B, H, W = data.shape
    
    # Move to CPU for cv2 processing
    # Ensure data is uint8 (0 and 1)
    if data.dtype == torch.bool:
        data_uint8 = data.to(torch.uint8)
    else:
        data_uint8 = (data > 0).to(torch.uint8)
        
    data_cpu = data_uint8.cpu().numpy()
    
    outputs = []
    for i in range(B):
        img = data_cpu[i]
        # cv2.distanceTransform calculates distance to nearest zero pixel.
        # We need to ensure that the "background" (what we want distance to) is 0.
        # If input has 1 for object and 0 for background, this works correctly.
        
        # maskSize=5 is standard for L2
        dist = cv2.distanceTransform(img, cv2.DIST_L2, 5)
        outputs.append(torch.from_numpy(dist))
        
    result = torch.stack(outputs).to(device)
    return result

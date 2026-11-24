import cv2
from ultralytics import YOLO
import os

# Load the lightweight YOLOv8 nano model
# (It will do a quick one-time download of a 6MB weights file on the very first upload)
model = YOLO("yolov8n.pt")

def blur_sensitive_data(image_path):
    """
    Scans the image for people and vehicles, applies a heavy Gaussian blur 
    to faces/license plates for data privacy compliance, and overwrites the file.
    """
    try:
        # 1. Read the image into memory using OpenCV
        img = cv2.imread(image_path)
        if img is None:
            print(f"[Privacy Shield] Error: Could not read image at {image_path}")
            return False

        # 2. Run the detection model (verbose=False keeps our FastAPI logs clean)
        results = model(img, verbose=False)
        blurred_any = False

        # 3. Step through everything the model detected
        for box in results[0].boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            
            # COCO Dataset IDs: 0 = person, 2 = car, 3 = motorcycle, 5 = bus, 7 = truck
            if class_id in [0, 2, 3, 5, 7] and confidence > 0.25:
                # Grab the bounding box pixel coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                # Image frame safety constraints
                h, w, _ = img.shape
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                
                # Isolate the target section (Face, body, or vehicle)
                roi = img[y1:y2, x1:x2]
                
                if roi.size > 0:
                    # Apply a thick 99x99 pixel Gaussian blur
                    blurred_roi = cv2.GaussianBlur(roi, (99, 99), 0)
                    # Stitch the blurred block back into the original photo matrix
                    img[y1:y2, x1:x2] = blurred_roi
                    blurred_any = True

        # 4. If we blurred anything, overwrite the temporary file with the safe version
        if blurred_any:
            cv2.imwrite(image_path, img)
            print(f"[Privacy Shield] Redacted identities successfully in {os.path.basename(image_path)}.")
        else:
            print(f"[Privacy Shield] Scan clear. No human or vehicle indicators flagged.")
            
        return True

    except Exception as e:
        print(f"[Privacy Shield] Critical error during processing: {e}")
        return False
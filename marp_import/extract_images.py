import fitz
import os

pdf_dir = "doc_source_gss"
output_dir = "extracted_images_from_pdf"

os.makedirs(output_dir, exist_ok=True)

pdf_file = None
for f in os.listdir(pdf_dir):
    if f.lower().endswith(".pdf"):
        pdf_file = os.path.join(pdf_dir, f)
        break

if not pdf_file:
    print("No PDF found.")
    exit(1)

doc = fitz.open(pdf_file)
img_count = 0
for page_index in range(len(doc)):
    page = doc[page_index]
    image_list = page.get_images(full=True)
    
    for img_index, img in enumerate(image_list, start=1):
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        # Skip very small images that might be icons or lines
        if len(image_bytes) < 5000:
            continue
            
        image_name = f"extracted_image_{page_index+1}_{img_index}.{image_ext}"
        image_path = os.path.join(output_dir, image_name)
        with open(image_path, "wb") as f:
            f.write(image_bytes)
        img_count += 1
        
print(f"Extracted {img_count} images to {output_dir}")

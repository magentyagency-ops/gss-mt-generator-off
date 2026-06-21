import fitz  # PyMuPDF

pdf_path = "/Users/clarencegomis/Desktop/Mémoire_Technique_GSS_Template_1781996235461.pdf"
doc = fitz.open(pdf_path)

found = False
for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    text = page.get_text()
    if "ENCADREMENT ET ORGANIGRAMME" in text.upper():
        print(f"Match found on page: {page_num + 1}")
        found = True

if not found:
    print("Not found in the PDF text.")

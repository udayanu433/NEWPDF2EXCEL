import json
import io
import re
import pandas as pd
import pdfplumber
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor
from openpyxl.styles import Font, Alignment, PatternFill

app = FastAPI()

# --- 1. CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-project-name.vercel.app" # Add your Vercel URL here
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Processed-Data"]
)

GRADE_POINTS = {
    'S': 10, 'A+': 9, 'A': 8.5, 'B+': 8, 'B': 7.5, 'C+': 7, 'C': 6.5, 'D': 6, 
    'P': 5.5, 'PASS': 5.5, 'F': 0, 'FE': 0, 'I': 0, 'ABSENT': 0, 'WITHHELD': 0
}

REG_NO_PATTERN = re.compile(r'(PKD\d{2}([A-Z]{2})\d{3})')
COURSE_GRADE_PATTERN = re.compile(r"([A-Z]{3,}\d{3})\s*\(([^)]+)\)")

# --- 2. LOGIC HELPERS ---

def detect_metadata(text):
    """Detects Semester, Scheme, and Exam Name from PDF text."""
    sem_match = re.search(r'\b(S[1-8])\b|SEMESTER\s+([I|V|X]+|[1-8])', text, re.IGNORECASE)
    semester = "S1"
    if sem_match:
        if sem_match.group(1):
            semester = sem_match.group(1).upper()
        else:
            found = sem_match.group(2).upper()
            roman_map = {"I": "S1", "II": "S2", "III": "S3", "IV": "S4", "V": "S5", "VI": "S6", "VII": "S7", "VIII": "S8"}
            semester = roman_map.get(found, f"S{found}")

    scheme = "2019"
    if "2024" in text: 
        scheme = "2024"
    
    exam_name = "B.Tech Degree Examination" if "B.Tech" in text else "University Examination"
    return semester, scheme, exam_name

def get_course_credits(code, lookup):
    """Matches codes like PCCST205 to JSON templates like PCXXT205."""
    clean = code.replace(" ", "")
    if clean in lookup:
        return lookup[clean]
    
    # Check for wildcards (XX or X) in the lookup patterns
    for pattern, val in lookup.items():
        if 'X' in pattern:
            # Create regex: replace X with a dot (match any character)
            regex = "^" + pattern.replace('X', '.') + "$"
            if re.match(regex, clean):
                return val
    return 0

# --- 3. API ENDPOINT ---

@app.post("/generate-excel/")
async def generate_excel(file: UploadFile = File(...)):
    try:
        content = await file.read()
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            with ThreadPoolExecutor() as executor:
                page_texts = list(executor.map(lambda p: (p.extract_text() or "") + "\n", pdf.pages))
            
        full_text = "".join(page_texts)
        header_text = "".join(page_texts[:2])
        detected_semester, detected_scheme, exam_name = detect_metadata(header_text)
        
        # Load JSON config
        json_filename = f'credits_{detected_scheme}.json'
        with open(json_filename, 'r') as f:
            full_json_data = json.load(f)
        
        semester_totals = full_json_data.get("semester_total_credits", {})
        
        # Build Credit Lookup
        credit_lookup = {}
        for dept in full_json_data.get("curricula", []):
            for sem in dept.get("semesters", []):
                for course in sem.get("courses", []):
                    credit_lookup[course["code"].replace(" ", "")] = course["credits"]

        raw_students = []
        reg_iter = list(REG_NO_PATTERN.finditer(full_text))

        for i in range(len(reg_iter)):
            match = reg_iter[i]
            reg_no = match.group(1).upper()
            start_pos = match.start()
            end_pos = reg_iter[i+1].start() if i+1 < len(reg_iter) else len(full_text)
            block = full_text[start_pos:end_pos].replace('\n', ' ')
            grades = {m[0]: m[1].strip().upper() for m in COURSE_GRADE_PATTERN.findall(block)}
            
            if grades:
                total_weighted_points = 0
                total_creds = 0
                
                # Denominator setup (Force 24 for 2024 S2)
                official_denom = 24 if (detected_scheme == "2024" and detected_semester == "S2") else semester_totals.get(detected_semester, 21)
                
                # Check for any failing grades
                is_pass = not any(g in ['F', 'FE', 'I', 'ABSENT', 'WITHHELD'] for g in grades.values())

                for code, grade in grades.items():
                    creds = get_course_credits(code, credit_lookup)
                    gp = GRADE_POINTS.get(grade, 0)
                    total_weighted_points += (creds * gp)
                    if gp > 0:
                        total_creds += creds

                # --- 2024 S2 ABSOLUTE PASS CREDIT INJECTION ---
                if detected_scheme == "2024" and detected_semester == "S2":
                    total_creds += 1
                    total_weighted_points += (1 * 5.5)

                sgpa = round(total_weighted_points / official_denom, 2) if official_denom > 0 else 0.0
                
                raw_students.append({
                    "register_no": reg_no, "dept": reg_no[5:7], "grades": grades,
                    "sgpa": sgpa, "total_credits": total_creds, "is_pass": is_pass
                })

        # Group by Dept and Generate Excel
        dept_buckets = {}
        for s in raw_students:
            dept_buckets.setdefault(s["dept"], []).append(s)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for dept_code, student_list in sorted(dept_buckets.items()):
                dept_courses = sorted(list(set(c for s in student_list for c in s["grades"].keys())))
                
                # Statistics
                total_s = len(student_list)
                pass_s = sum(1 for s in student_list if s["is_pass"])
                fail_s = total_s - pass_s
                pass_perc = round((pass_s / total_s * 100), 2) if total_s > 0 else 0

                rows = []
                for s in student_list:
                    row = {"Register No": s["register_no"]}
                    row.update({c: s["grades"].get(c, "") for c in dept_courses})
                    row["Total Credits"] = s["total_credits"]
                    row["SGPA"] = s["sgpa"]
                    row["Result"] = "PASS" if s["is_pass"] else "FAIL"
                    rows.append(row)
                
                df = pd.DataFrame(rows)
                sheet_name = f"{dept_code}_Analysis"
                df.to_excel(writer, index=False, sheet_name=sheet_name, startrow=8)
                
                ws = writer.sheets[sheet_name]
                
                # Metadata Headers
                ws["A1"] = f"EXAMINATION: {exam_name}"
                ws["A2"] = f"SEMESTER: {detected_semester} | SCHEME: {detected_scheme}"
                ws["A3"] = f"DEPARTMENT: {dept_code}"
                ws["A5"] = "OVERALL PERFORMANCE ANALYSIS"
                ws["A6"] = f"Total Students: {total_s} | Pass: {pass_s} | Fail: {fail_s} | Pass%: {pass_perc}%"
                
                bold_font = Font(bold=True, size=11)
                for cell in ["A1", "A2", "A3", "A5", "A6"]: ws[cell].font = bold_font

                # Toppers Analysis (Bottom)
                current_row = ws.max_row + 3
                ws.cell(row=current_row, column=1, value="TOP 10 PERFORMERS").font = Font(bold=True, color="0000FF")
                toppers = sorted([s for s in student_list if s["is_pass"]], key=lambda x: x['sgpa'], reverse=True)[:10]
                for i, t in enumerate(toppers, 1):
                    ws.cell(row=current_row + i, column=1, value=f"{i}. {t['register_no']}")
                    ws.cell(row=current_row + i, column=2, value=f"SGPA: {t['sgpa']}")

                # Subject wise Fail Count (Bottom)
                current_row = ws.max_row + 2
                ws.cell(row=current_row, column=1, value="SUBJECT-WISE FAILURE ANALYSIS").font = Font(bold=True, color="FF0000")
                for i, course in enumerate(dept_courses, 1):
                    f_count = sum(1 for s in student_list if s["grades"].get(course) in ['F', 'FE', 'I', 'ABSENT'])
                    ws.cell(row=current_row + i, column=1, value=course)
                    ws.cell(row=current_row + i, column=2, value=f"{f_count} Failed")

        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Analysis_Final.xlsx"}
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, detail=str(e))

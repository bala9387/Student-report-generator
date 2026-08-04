from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(29, 78, 216)
        self.cell(0, 10, "KSR Akshara Academy", new_x="LMARGIN", new_y="NEXT", align="L")
        self.set_font("Helvetica", "I", 10)
        self.set_text_color(100, 116, 139)
        self.cell(0, 6, "Staff & Teacher Portal Access Credentials - Academic Year 2026-27", new_x="LMARGIN", new_y="NEXT", align="L")
        self.set_draw_color(29, 78, 216)
        self.set_line_width(0.8)
        self.line(10, self.get_y() + 2, 200, self.get_y() + 2)
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 10, f"Confidential - For Internal School Use Only - Page {self.page_no()}", align="C")

pdf = PDF("P", "mm", "A4")
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()

# Admin Section
pdf.set_fill_color(239, 246, 255)
pdf.set_draw_color(191, 219, 254)
pdf.rect(10, pdf.get_y(), 190, 22, style="DF")

pdf.set_xy(14, pdf.get_y() + 3)
pdf.set_font("Helvetica", "B", 11)
pdf.set_text_color(30, 64, 175)
pdf.cell(0, 6, "Master Administrator Account", new_x="LMARGIN", new_y="NEXT")

pdf.set_x(14)
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(15, 23, 42)
pdf.cell(90, 6, "Username: aksharaacademy@ksrakshara.org")
pdf.cell(90, 6, "Password: aksharaacademy@98?", new_x="LMARGIN", new_y="NEXT")

pdf.ln(10)

# Section Header
pdf.set_font("Helvetica", "B", 12)
pdf.set_text_color(15, 23, 42)
pdf.cell(0, 8, "Staff & Teacher Accounts (Default Password: Akshara@123)", new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

# Table Header
pdf.set_font("Helvetica", "B", 9)
pdf.set_fill_color(248, 250, 252)
pdf.set_text_color(51, 65, 85)
pdf.set_draw_color(226, 232, 240)

col_widths = [48, 56, 30, 56]
headers = ["Teacher Name", "Username / Email", "Password", "Assigned Subjects"]

for i, h in enumerate(headers):
    pdf.cell(col_widths[i], 8, h, border=1, fill=True, align="L")
pdf.ln()

# Table Data
teachers = [
    ("Mr. Jay Ganesan", "jayganesan@ksrakshara.org", "Akshara@123", "English (XII Harmony, XII Melody 2)"),
    ("Mr. Anthony Polanki", "anthony@ksrakshara.org", "Akshara@123", "Physics (XII Harmony, XII Melody 1)"),
    ("Mr. Shaik Bhavaji", "bhavaji@ksrakshara.org", "Akshara@123", "Chemistry (XII Harmony, XII Melody 1)"),
    ("Mr. Anil Kumar", "anilkumar@ksrakshara.org", "Akshara@123", "Math (XII Harmony, XII Melody 1, Class 10)"),
    ("Ms. Akhila", "akhila@ksrakshara.org", "Akshara@123", "Biology (XII Harmony, XII Melody 1)"),
    ("Mr. Dhisoun Prabu D", "dhisounprabu@ksrakshara.org", "Akshara@123", "CS (XII Harmony)"),
    ("Ms. Deepa B", "deepaeng@ksrakshara.org", "Akshara@123", "Phy. Edu & English (XII Melody 1, XII Symphony)"),
    ("Ms. Sivakami V", "sivakami@ksrakshara.org", "Akshara@123", "CS (XII Melody 1, XII Melody 2, XII Symphony)"),
    ("Mr. Naresh G", "nareshg@ksrakshara.org", "Akshara@123", "Physics (XII Melody 2)"),
    ("Mr. Rajendra Reddy", "rajendrareddy@ksrakshara.org", "Akshara@123", "Chemistry (XII Melody 2)"),
    ("Mr. Giri Kumar", "girikumar@ksrakshara.org", "Akshara@123", "Math (XII Melody 2, Class 10)"),
    ("Ms. Saranya S", "saranyasped@ksrakshara.org", "Akshara@123", "Phy. Edu (XII Melody 2, XII Symphony)"),
    ("Mr. Sakthisundaravadivel A", "sakthisundaravadivel@ksrakshara.org", "Akshara@123", "App. Math (XII Symphony)"),
    ("Mr. Dhanesh Kumar M", "dhaneshkumarm@ksrakshara.org", "Akshara@123", "Accountancy & Business (XII Symphony)"),
    ("Mr. Shareef A", "shareefa@ksrakshara.org", "Akshara@123", "Economics (XII Symphony)")
]

pdf.set_font("Helvetica", "", 8.5)
pdf.set_text_color(15, 23, 42)

for row in teachers:
    pdf.cell(col_widths[0], 7.5, row[0], border=1)
    pdf.cell(col_widths[1], 7.5, row[1], border=1)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(55, 48, 163)
    pdf.cell(col_widths[2], 7.5, row[2], border=1)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(col_widths[3], 7.5, row[3], border=1, new_x="LMARGIN", new_y="NEXT")

pdf.output("Teacher_Credentials_KSR_Akshara.pdf")
pdf.output("public/Teacher_Credentials_KSR_Akshara.pdf")
print("PDF generated successfully!")

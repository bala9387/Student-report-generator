const { jsPDF } = require('../public/vendor/jspdf.umd.min.js');

function domainLabel(dom) {
  const DOMAIN_LABELS = {
    "Bio-Math": "Bio - Maths", "Math-CS": "Maths - CS", "Bio-CS": "Bio - CS",
    "Applied Math": "Applied Maths", "CS": "Computer Science",
    "X Harmony": "Harmony", "X Melody": "Melody", "X Symphony": "Symphony",
    "10 H": "Harmony", "10 M": "Melody", "10 S": "Symphony"
  };
  return DOMAIN_LABELS[dom] || dom;
}

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function generateSectionLandscapePdf(data) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const isG10 = (data.grade === "10" || data.grade === "X");
  const isG11 = (data.grade === "11" || data.grade === "XI");
  const bannerText = isG10 ? "Grade X · Academic Session 2026-27" : (isG11 ? "Grade XI · Academic Session 2026-27" : "Grade XII · Team Elevate 2027");
  const gradeDisplay = isG10 ? "Class 10" : (isG11 ? "Class 11" : "Class 12");
  const gradeStr = isG10 ? "Class_10" : (isG11 ? "Class_11" : "Class_12");

  function drawLandscapeHeader() {
    doc.setFillColor(209, 213, 219); doc.rect(0, 0, pageW, 8, "F");
    doc.setFillColor(183, 22, 28); doc.rect(0, 0, pageW, 6, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(20, 30, 48);
    doc.text(bannerText, pageW / 2, 26, { align: "center" });

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(183, 22, 28);
    doc.text(gradeDisplay + " — " + (data.sectionName || "Section") + " Mark Sheet", pageW / 2, 44, { align: "center" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90);
    const subText = "Academic Year 2026 - 2027  ·  Exam: " + (data.exam || "Exam") + "  ·  Total Students: " + (data.students ? data.students.length : 0) + "  ·  Generated: " + today();
    doc.text(subText, pageW / 2, 58, { align: "center" });
  }

  const startY = 70;
  const x0 = 35;
  const usableW = pageW - x0 * 2;

  const hasPed = !!data.hasPed;
  const subs = data.subjects || [];
  const nSubs = subs.length || 1;
  const trailingW = hasPed ? 164 : 65;
  const subColW = Math.floor((usableW - 300 - trailingW) / nSubs);

  const colWidths = [24, 56, 135, 85];
  const aligns = ["center", "center", "left", "left"];
  const headRow = ["#", "Roll No", "Student Name", "Stream"];

  subs.forEach(function (s) {
    colWidths.push(subColW);
    aligns.push("center");
    headRow.push(s);
  });

  if (hasPed) {
    colWidths.push(62, 40, 62);
    aligns.push("center", "center", "center");
    headRow.push("Total (500)", "PED", "Grand Total");
  } else {
    colWidths.push(65);
    aligns.push("center");
    headRow.push("Total");
  }

  const sumColW = colWidths.reduce(function (a, b) { return a + b; }, 0);
  const diff = usableW - sumColW;
  if (diff !== 0) {
    colWidths[2] += diff;
  }

  const headH = 20;
  const rowH = 15.5;
  let y = startY;

  function renderTableRow(cells, h, isHeader, isEven) {
    let x = x0;
    cells.forEach(function (cellData, i) {
      const w = colWidths[i];
      const text = (typeof cellData === "object" && cellData !== null) ? cellData.text : cellData;
      const isFail = (typeof cellData === "object" && cellData !== null) ? cellData.isFail : false;

      if (isHeader) {
        doc.setFillColor(241, 245, 249);
      } else if (isEven) {
        doc.setFillColor(248, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(x, y, w, h, "F");

      doc.setDrawColor(218, 222, 230);
      doc.setLineWidth(0.5);
      doc.rect(x, y, w, h, "S");

      const bold = isHeader || isFail || (i === 0);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(isHeader ? 8 : 7.5);
      const textColor = isHeader ? [30, 41, 59] : (isFail ? [220, 38, 38] : [30, 35, 45]);
      doc.setTextColor.apply(doc, textColor);

      const align = isHeader ? "center" : aligns[i];
      const pad = 4;
      const tx = align === "left" ? x + pad : (align === "right" ? x + w - pad : x + w / 2);
      doc.text(String(text != null ? text : "-"), tx, y + h / 2 + 0.5, { align: align, baseline: "middle" });
      x += w;
    });
    y += h;
  }

  drawLandscapeHeader();
  renderTableRow(headRow, headH, true, false);

  const failCutoff = (data.exam === "CU 1") ? 35 : ((data.grade === "12") ? 45 : 30);
  (data.students || []).forEach(function (st, idx) {
    if (y + rowH > pageH - 28) {
      doc.addPage();
      y = 70;
      drawLandscapeHeader();
      renderTableRow(headRow, headH, true, false);
    }

    const rowCells = [
      String(idx + 1),
      st.rollNo || "-",
      st.name || "-",
      domainLabel(st.stream || "")
    ];

    subs.forEach(function (sub) {
      const raw = (st.marks && st.marks[sub] != null && st.marks[sub] !== "") ? st.marks[sub] : "-";
      let isFail = false;
      const numV = parseFloat(raw);
      if (!isNaN(numV) && raw !== "-" && String(raw).toUpperCase() !== "AB") {
        if (numV < failCutoff) isFail = true;
      }
      rowCells.push(isFail ? { text: String(raw), isFail: true } : String(raw));
    });

    if (hasPed) {
      const tot500 = st.total500 != null ? String(st.total500) : "-";
      const ped = st.ped != null ? String(st.ped) : "-";
      const grandTot = st.total != null ? String(st.total) : "-";
      rowCells.push(tot500, ped, grandTot);
    } else {
      const tot = st.total != null ? String(st.total) : "-";
      rowCells.push(tot);
    }

    renderTableRow(rowCells, rowH, false, idx % 2 === 1);
  });

  const stats = data.stats || null;
  if (stats) {
    const statRowsConfig = [
      { label: "No. of Student Present", key: "present" },
      { label: "No. of Student Absent", key: "absent" },
      { label: "No. of Student Failure", key: "failure" },
      { label: "Subject Average", key: "average" },
      { label: "Maximum Mark", key: "max" },
      { label: "Minimum Mark", key: "min" }
    ];

    const labelW = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];

    statRowsConfig.forEach(function (cfg) {
      if (y + rowH > pageH - 28) {
        doc.addPage();
        y = 70;
        drawLandscapeHeader();
        renderTableRow(headRow, headH, true, false);
      }

      let x = x0;

      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, labelW, rowH, "F");
      doc.setDrawColor(218, 222, 230);
      doc.setLineWidth(0.5);
      doc.rect(x, y, labelW, rowH, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(192, 0, 0);
      doc.text(cfg.label, x + labelW - 6, y + rowH / 2 + 0.5, { align: "right", baseline: "middle" });
      x += labelW;

      subs.forEach(function (sub, sIdx) {
        const w = colWidths[4 + sIdx];
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, w, rowH, "F");
        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, w, rowH, "S");

        const val = stats[cfg.key] && stats[cfg.key][sub] != null ? stats[cfg.key][sub] : "-";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(40, 45, 55);
        doc.text(String(val), x + w / 2, y + rowH / 2 + 0.5, { align: "center", baseline: "middle" });
        x += w;
      });

      if (hasPed) {
        const wTot500 = colWidths[4 + subs.length];
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, wTot500, rowH, "F");
        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, wTot500, rowH, "S");
        x += wTot500;

        const wPed = colWidths[5 + subs.length];
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, wPed, rowH, "F");
        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, wPed, rowH, "S");

        const pedVal = stats[cfg.key] && stats[cfg.key]["PED"] != null ? stats[cfg.key]["PED"] : "-";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(40, 45, 55);
        doc.text(String(pedVal), x + wPed / 2, y + rowH / 2 + 0.5, { align: "center", baseline: "middle" });
        x += wPed;

        const wGrandTot = colWidths[6 + subs.length];
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, wGrandTot, rowH, "F");
        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, wGrandTot, rowH, "S");
        x += wGrandTot;
      } else {
        const wTot = colWidths[4 + subs.length];
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, wTot, rowH, "F");
        doc.setDrawColor(218, 222, 230);
        doc.setLineWidth(0.5);
        doc.rect(x, y, wTot, rowH, "S");
        x += wTot;
      }

      y += rowH;
    });
  }

  if (y + 20 <= pageH - 15) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    const note = hasPed
      ? "* Red indicates mark < " + failCutoff + ". Total (500) excludes Physical Education (PED). Grand Total includes all evaluated subjects."
      : "* Red indicates mark < " + failCutoff + ". Total includes all evaluated subjects.";
    doc.text(note, x0, y + 14);
  }

  const fileName = gradeStr + "_" + (data.sectionName || "Section").replace(/\s+/g, "_") + "_" + (data.exam || "Exam").replace(/\s+/g, "") + "_MarkSheet_Landscape.pdf";
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return { buffer: pdfBuffer, fileName: fileName };
}

module.exports = {
  generateSectionLandscapePdf
};

const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = `<!DOCTYPE html><html><body>
  <div class="page">
    <header>
      <div class="header-titles">
        <h1>Student Performance Report</h1>
        <p>Grade XII &middot; Team Elevate 2027 &middot; Parent Portal</p>
      </div>
      <button id="statusPill" class="status-pill loading" type="button" title="Data source" style="display: none;">
        <span class="dot"></span><span id="statusText">Connecting&hellip;</span>
      </button>
    </header>

    <div class="card lookup-card" id="lookupCard">
      <h2>View Report</h2>
      <form id="lookupForm">
        <label for="roll">Student Roll Number</label>
        <input type="text" id="roll" name="roll" required autocomplete="off" placeholder="e.g. 26s2456" />
        
        <label for="mode">Select Exam</label>
        <div class="select-wrapper">
          <select id="mode" name="mode">
            <option value="PE - Analysis">PE - Analysis (Consolidated)</option>
            <option value="CU 1">CU 1</option>
            <option value="TE 1">TE 1</option>
            <option value="CU 2">CU 2</option>
            <option value="TE 2">TE 2</option>
          </select>
        </div>

        <button type="submit" id="submitBtn" disabled>Generate Report</button>
      </form>
      <div id="message" class="message hidden"></div>
    </div>

    <div id="reportWrap" hidden>
      <div class="actions">
        <button id="backBtn" type="button" class="btn btn-secondary">
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
          Back
        </button>
        <div class="actions-right">
          <button id="printBtn" type="button" class="btn btn-secondary">
            <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"></path></svg>
            Print
          </button>
          <button id="downloadBtn" type="button" class="btn btn-primary">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>
            Download PDF
          </button>
        </div>
      </div>
      <div id="report" class="report-content"></div>
    </div>
  </div>
  <script>
    window.jspdf = { jsPDF: class {
        constructor() {
            this.internal = { pageSize: { getWidth: () => 600 } };
        }
        setFillColor() {}
        setDrawColor() {}
        rect() {}
        roundedRect() {}
        setFont() {}
        setFontSize() {}
        setTextColor() {}
        text() {}
        save(fn) { console.log("Saved PDF:", fn); }
    }};
  </script>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;

try {
  window.eval(fs.readFileSync('data.js', 'utf8'));
  
  let appCode = fs.readFileSync('app.js', 'utf8');
  // Inject DATA inside IIFE by replacing `var DATA = null;`
  appCode = appCode.replace('var DATA = null;', 'var DATA = window.REPORT_DATA;');
  appCode = appCode.replace('load(false);', '');
  appCode = appCode.replace('})();', 'window.currentPDF = () => currentPDF; window.renderReport = renderReport; window.renderExamReport = renderExamReport; window.buildExamPDF = buildExamPDF; window.buildPDF = buildPDF; })();');
  window.eval(appCode);

  const document = window.document;

  document.getElementById("roll").value = "26H2315";
  document.getElementById("mode").value = "CU 1";
  
  document.getElementById("lookupForm").dispatchEvent(new window.Event("submit", { cancelable: true }));

  console.log("currentPDF after form submit:", window.currentPDF());
  console.log("Form submitted. Now triggering download...");
  document.getElementById("downloadBtn").dispatchEvent(new window.Event("click"));

} catch (e) {
  console.error("Error in test script:", e);
}

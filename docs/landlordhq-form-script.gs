/**
 * LandlordHQ — Access Request Form Handler
 * Google Apps Script Web App
 *
 * SETUP INSTRUCTIONS (do this once):
 * 1. Go to https://script.google.com
 * 2. Click "New Project" — name it "LandlordHQ Access Form"
 * 3. Delete the default code and paste this entire file
 * 4. Click Deploy → New Deployment
 *    - Type: Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy → copy the Web App URL
 * 6. Paste that URL into landing.html where it says PASTE_YOUR_SCRIPT_URL_HERE
 * 7. Done — every access request sends you an email
 */

// ── Change this to whichever email you want to receive leads on
var NOTIFY_EMAIL = Session.getEffectiveUser().getEmail(); // uses your Google account by default
// Or hardcode it: var NOTIFY_EMAIL = "you@gmail.com";

// ── Called when the form submits (POST request from the landing page)
function doPost(e) {
  try {
    var name        = e.parameter.name         || "Not provided";
    var email       = e.parameter.email        || "Not provided";
    var units       = e.parameter.units        || "Not specified";
    var currentTool = e.parameter.current_tool || "Not specified";
    var timestamp   = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });

    // ── Send notification email
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: "\uD83C\uDFE0 New Access Request \u2014 " + name,
      htmlBody: buildEmailBody(name, email, units, currentTool, timestamp)
    });

    // ── Log to spreadsheet (auto-created in your Drive on first submission)
    logToSheet(name, email, units, currentTool, timestamp);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Still return ok so the user sees the success screen
    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", note: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Handles direct browser visits (GET) — just returns a confirmation
function doGet(e) {
  return ContentService
    .createTextOutput("LandlordHQ access request endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── Builds the notification email HTML
function buildEmailBody(name, email, units, currentTool, timestamp) {
  return [
    "<div style='font-family:sans-serif; max-width:520px; margin:0 auto;'>",

    "<div style='background:#0B1D3A; padding:24px 28px; border-radius:12px 12px 0 0;'>",
    "<p style='margin:0; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.45);'>LandlordHQ</p>",
    "<h2 style='margin:8px 0 0; color:#ffffff; font-size:20px;'>New Access Request</h2>",
    "</div>",

    "<div style='background:#F7F8FA; padding:28px; border:1px solid #E2E8F0; border-top:none; border-radius:0 0 12px 12px;'>",

    "<table style='width:100%; border-collapse:collapse;'>",
    buildRow("Name",             name),
    buildRow("Email",            "<a href='mailto:" + email + "' style='color:#2B7AFF;'>" + email + "</a>"),
    buildRow("Units managed",    units),
    buildRow("Currently using",  currentTool),
    buildRow("Submitted",        timestamp),
    "</table>",

    "<div style='margin-top:24px; padding:16px 20px; background:#ffffff; border:1px solid #E2E8F0; border-radius:8px;'>",
    "<p style='margin:0; font-size:13px; color:#64748B;'>",
    "<strong style='color:#0B1D3A;'>Next step:</strong> Reply to <a href='mailto:" + email + "' style='color:#2B7AFF;'>" + email + "</a> ",
    "to get them onboarded.",
    "</p>",
    "</div>",

    "</div>",
    "</div>"
  ].join("");
}

// ── Helper to build a table row
function buildRow(label, value) {
  return [
    "<tr>",
    "<td style='padding:10px 12px; font-size:12px; font-weight:600; color:#64748B; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; border-bottom:1px solid #E2E8F0; width:140px;'>" + label + "</td>",
    "<td style='padding:10px 12px; font-size:14px; color:#0B1D3A; border-bottom:1px solid #E2E8F0;'>" + value + "</td>",
    "</tr>"
  ].join("");
}

// ── Logs each lead to a Google Sheet named "LandlordHQ Leads"
// Auto-created in your Drive on the first submission
function logToSheet(name, email, units, currentTool, timestamp) {
  try {
    var files = DriveApp.getFilesByName("LandlordHQ Leads");
    var ss;

    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      // Create the sheet automatically on first submission
      ss = SpreadsheetApp.create("LandlordHQ Leads");
      var sheet = ss.getActiveSheet();
      sheet.setName("Leads");
      sheet.appendRow(["Timestamp", "Name", "Email", "Units", "Currently Using"]);
      sheet.getRange("1:1").setFontWeight("bold");
    }

    var sheet = ss.getSheetByName("Leads") || ss.getActiveSheet();
    sheet.appendRow([timestamp, name, email, units, currentTool]);

  } catch (err) {
    // Sheet logging is optional — silently skip if it fails
  }
}

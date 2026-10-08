import { google } from "googleapis";

const HEADERS = ["Registration ID", "Submitted at (UTC)", "Full name", "WhatsApp", "Email", "Country", "Session", "Level", "Goals"];
const COUNTRIES = new Set(["Bahrain", "Egypt", "Iran", "Iraq", "Jordan", "Kuwait", "Lebanon", "Oman", "Palestine", "Qatar", "Saudi Arabia", "Syria", "Turkey", "United Arab Emirates", "Yemen"]);
const SESSIONS = new Set(["Network Pentesting", "Web Pentesting", "Both Sessions"]);
const LEVELS = new Set(["Complete Beginner", "Beginner", "Intermediate", "Advanced"]);
const GOALS = new Set(["Understand Cybersecurity & Pentesting", "Gain Practical Experience", "Learn Network Pentesting", "Explore Cybersecurity as a Career", "Learn Web Pentesting", "Just want to discover Pentesting"]);

const visits = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

function text(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function quoteSheetName(name) {
  return `'${name.replaceAll("'", "''")}'`;
}

function isAllowedRequest(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function isRateLimited(request) {
  const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (visits.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  visits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function validate(payload) {
  const name = text(payload.name, 100);
  const whatsapp = text(payload.whatsapp, 30);
  const phone = whatsapp.replace(/[\s\-().]/g, "");
  const email = text(payload.email, 254).toLowerCase();
  const country = text(payload.country, 60);
  const session = text(payload.session, 40);
  const level = text(payload.level, 40);
  const goals = Array.isArray(payload.goals) ? [...new Set(payload.goals.map((goal) => text(goal, 100)).filter((goal) => GOALS.has(goal)))].slice(0, GOALS.size) : [];

  if (name.length < 2) return { error: "Please enter a valid full name." };
  if (!/^\+?\d{7,15}$/.test(phone)) return { error: "Please enter a valid WhatsApp number." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Please enter a valid email address." };
  if (!COUNTRIES.has(country)) return { error: "Please select a country from the list." };
  if (!SESSIONS.has(session)) return { error: "Please select a session." };
  if (!LEVELS.has(level)) return { error: "Please select your level." };

  return { data: { name, whatsapp, email, country, session, level, goals } };
}

function getSheetsClient() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!rawCredentials || !spreadsheetId) throw new Error("The registration service has not been configured yet.");

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error("The registration service credentials are invalid.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}

async function ensureRegistrationSheet(sheets, spreadsheetId, sheetName) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
    });
  }

  const range = `${quoteSheetName(sheetName)}!A1:I1`;
  const current = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  if (!current.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] }
    });
  }
}

async function register(request) {
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." }, { Allow: "POST" });
  if (!isAllowedRequest(request)) return json(403, { ok: false, error: "Invalid request origin." });
  if (isRateLimited(request)) return json(429, { ok: false, error: "Too many attempts. Please wait a minute and try again." });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid registration data." });
  }

  if (text(payload.website, 200)) return json(200, { ok: true });

  const validation = validate(payload);
  if (validation.error) return json(400, { ok: false, error: validation.error });

  try {
    const { spreadsheetId, sheets } = getSheetsClient();
    const sheetName = text(process.env.REGISTRATION_SHEET_NAME, 90) || "Registrations";
    await ensureRegistrationSheet(sheets, spreadsheetId, sheetName);

    const data = validation.data;
    const registrationId = crypto.randomUUID();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[registrationId, new Date().toISOString(), data.name, data.whatsapp, data.email, data.country, data.session, data.level, data.goals.join(" | ")]]
      }
    });

    return json(201, { ok: true, registrationId });
  } catch (error) {
    console.error("Registration persistence failed", error instanceof Error ? error.message : error);
    return json(500, { ok: false, error: "We could not save your registration. Please try again shortly." });
  }
}

export default {
  fetch: register
};

// Submits a tagged dummy lead to quotasuccess.com.au so the Supabase project
// behind it records activity and isn't paused on the free tier.
const ENDPOINT = "https://quotasuccess.com.au/.netlify/functions/submit-lead";

const payload = {
  source: "lead_capture",
  email: "keepalive@quotasuccess.com.au",
  company: "KEEPALIVE",
  role: "Automated Supabase keep-alive",
  service_interest: "not_sure",
  sign_responses: []
};

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const body = await res.text();
console.log(`${new Date().toISOString()} ${res.status} ${body.slice(0, 300)}`);

if (!res.ok) {
  // Non-zero exit fails the GitHub Actions run, which emails the repo owner.
  process.exit(1);
}

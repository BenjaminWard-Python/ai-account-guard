// Real sign-in pages the daily check visits, and what each is expected to have.
//   url          sign-in page
//   pre          button to click first to reveal the email field (regex source), optional
//   submit       the button that sends the email (regex source); Enter is used if absent
//   email        true if the page should have an email field the extension recognizes
//   signIns      identity providers whose buttons are expected (missing ones are reported)
//   wait         ms to let the page settle (default 6000)
//   blockedPage  true if the extension should replace the whole site with its block page
//   preBlocked   true if clicking `pre` should land on the extension's block page (the site
//                sends you straight to a sign-in provider that isn't allowed)
// Update these when a service redesigns its sign-in page.
export const SITES = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/auth/login", submit: "^continue$", email: true, signIns: ["google", "apple", "phone"] },
  { id: "claude", name: "Claude", url: "https://claude.ai/login", submit: "^continue with email$", email: true, signIns: ["google", "apple"] },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/sign_in", submit: "^log in$", email: true, signIns: ["google", "apple"] },
  { id: "mistral", name: "Mistral Le Chat", url: "https://chat.mistral.ai/login", submit: "^continue$", email: true, signIns: ["apple", "google", "microsoft"] },
  { id: "poe", name: "Poe", url: "https://poe.com/login", submit: "^go$", email: true, signIns: ["google", "apple", "phone"] },
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai/", pre: "^sign in$", submit: "^continue with email$", email: true, signIns: ["google", "apple"] },
  { id: "grok", name: "Grok", url: "https://accounts.x.ai/sign-in", pre: "^login with email$", email: true, signIns: ["google", "x", "apple", "github"] },
  // "Sign in" goes straight to Microsoft's sign-in, which the check's settings don't allow.
  { id: "copilot", name: "Microsoft Copilot", url: "https://copilot.com/", pre: "^sign in$", preBlocked: true, wait: 15000, email: false, signIns: [] },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", email: false, signIns: [] },
  { id: "meta", name: "Meta AI", url: "https://www.meta.ai/", blockedPage: true },
];

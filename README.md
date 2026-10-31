# Office Assistant

Turns your **Lenovo Smart Display 8** ("Office Display") into a standalone AI kiosk.
No jailbreak, no root — uses Google's supported **Cast Web Receiver** feature.

```
receiver/   The app that runs ON the display (home screen, clock, weather,
            YouTube, Google search, OpenRouter AI chat). Fully standalone.
sender/     A tiny page you open once in Chrome to launch the app on the display.
```

> **Voice:** You kept the built-in **"Hey Google"** assistant, so the display's own
> always-on mic still works natively for "set a timer", "what's the weather", etc.
> My app handles everything else on screen. Nothing runs on your PC after launch.

---

## What it does
- Android-style home screen: big clock, date, live weather (Open-Meteo, no key), app tiles
- **AI Assistant** — chat with your **free OpenRouter models**, streamed replies, on-screen model switcher
- **YouTube** and **Google search** with an on-screen search bar
- Your API key is pasted in on the display and stored **only on the device** (localStorage) — the display calls OpenRouter directly, no middle server

---

## Setup (one-time, ~10 minutes)

### 1. Host `receiver/` on any free HTTPS host
The display needs to fetch the app from a public URL.
Easiest: push the `receiver/` folder to **GitHub Pages** or **Cloudflare Pages**
(free, gives you `https://…` which Cast requires).

### 2. Register a Cast receiver (free Google account)
1. Go to the **Google Cast SDK Developer Console** (`cast.google.com/publish`)
2. Add a **Web Receiver** app → set its **Receiver URL** to your hosted `receiver/index.html`
3. Copy the **App ID** it gives you
4. *(Optional but recommended)* In the console, add your display to the **Test** section

### 3. Launch it on the display
1. Open `sender/index.html` in **Chrome** on any device on the same Wi‑Fi
2. Paste the **App ID** → click **Launch on Office Display** → pick the device
3. The app starts full-screen on the display and **stays there**

### 4. Paste your OpenRouter key (on the display)
On first launch the app asks for your key. Paste your free key from
`openrouter.ai/keys`. That's it — it now answers as your on-screen assistant.

---

## Notes & honest limitations
- **OS replacement is not possible** on this device (locked bootloader + verified boot,
  no Android ROM exists for it). This Cast receiver is the supported way to run your own UI.
- The display's **microphone is reserved for Google Assistant** — third-party apps can't
  read it. That's why voice stays with "Hey Google" (which works great) and my app is visual.
- Google/YouTube/Search run inside the display's web view via embeds, not as installed apps.
- Keep your OpenRouter key on a **low/limited** setting, since a key stored on any
  device on your Wi‑Fi could in principle be read from it.

## Run it locally first (optional preview)
Before hosting, you can preview the UI in a desktop browser:
```
cd receiver
npx serve .
```
It works in a normal browser too (key prompt, chat, etc.) — the Cast init is a no-op there.

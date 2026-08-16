# Academic Reader: Technical Journey & Strategy Report

**Date:** August 16, 2026
**Role:** Technical Lead / Architect

## 1. The Core Objective
The fundamental goal of this project is to allow you (the user) to discover academic papers through a swipe-based interface and **read them directly inside the app**, enabling you to highlight text, save notes, and use AI to explain complex jargon. The format of the paper (PDF, HTML, or TXT) does not matter; what matters is a seamless reading experience without being kicked out to external websites or hitting paywalls.

## 2. The Challenges We Faced (Why it kept breaking)
Getting academic papers to load cleanly inside a web application is notoriously difficult due to how publishers protect their data. Here is a plain-English breakdown of the roadblocks we encountered:

1. **The "CORS" Blockade:** Browsers have strict security rules that prevent a website (our app) from secretly downloading files from another website (like a university repository). When our app tried to fetch a PDF, the repository servers actively blocked us.
2. **Bot Protection (The 403 Forbidden Error):** We tried routing our requests through a Cloudflare "proxy" (a middleman server) to bypass the CORS blockade. However, academic sites like Zenodo and arXiv thought we were a malicious scraping bot and shut us out. 
3. **Corrupted Files (The "%PDF" Error):** Even when we managed to slip past the bot protection, the data stream often got compressed twice by the proxy. By the time the PDF reached our app, the file was scrambled, and the reader crashed trying to extract the text.
4. **Publisher Paywalls & HTML Landing Pages:** Our data provider (OpenAlex) often gave us links that didn't point to a PDF at all. Instead, they pointed to restrictive publisher websites (like Elsevier) that force you to buy the paper, or simple HTML "landing pages" that our PDF viewer couldn't read.

## 3. What We Have Built to Fix It
To solve these issues and guarantee a reliable reading experience, we engineered a multi-layered solution:

### Phase A: Fixing the Plumbing
- **The "Polite Bot" Identity:** We updated our proxy server to announce itself politely to academic repositories (e.g., passing a specific `User-Agent` with contact info). This stopped arXiv and Zenodo from blocking us as a threat.
- **Clean Data Streams:** We rewrote the proxy to strip out conflicting compression headers, ensuring the PDF arrives in our app exactly as it left the server, preventing corruption.
- **Single-Column "Reader Mode":** Because reading a 2-column PDF on a mobile screen is terrible, we built a custom text-extraction engine. It strips the layout away and presents the paper as clean, readable text (like reading a Kindle or a Medium article).

### Phase B: Bypassing the Paywalls
- **The Unpaywall Integration:** Because OpenAlex links were unreliable, we integrated a service called **Unpaywall**. Now, before the reader opens, the app takes the paper's unique ID (the DOI) and silently asks Unpaywall: *"Where is the absolute best, legally free, open-access copy of this exact document?"*
- **Dynamic Fallbacks:** The app now has a smart fallback system:
  1. It tries to get the pristine open-access PDF from Unpaywall.
  2. If that works, it extracts the clean text for "Reader Mode".
  3. If it can't extract the text, it shows you the "Original PDF" view.
  4. If a free PDF simply does not exist anywhere on the internet (it is strictly paywalled), it provides a clean button to open the publisher's landing page so you aren't left staring at a broken screen.

## 4. The Path Forward (CTO Recommendation)
We have successfully built a robust pipeline to fetch and read open-access papers. However, because we are dealing with thousands of different academic publishers, a small percentage of papers will always be unreadable inside the app due to hard paywalls.

**My commitment to you:** As we move forward, my priority is entirely on the user experience. If a paper can legally be read for free, our app will find it, extract it, and present it to you cleanly. If a new edge-case breaks the reader, we will not patch it blindly; we will evolve the architecture to handle it gracefully. 

You focus on the product vision and the discovery experience; I will handle the publisher integrations and the rendering engines.

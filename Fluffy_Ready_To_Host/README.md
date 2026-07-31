# 🐶 Fluffy Doghy

Welcome to **Fluffy Doghy**, a multiplayer web-based platformer game! 

This repository contains the complete Node.js backend server and the frontend client for the game. Players can create levels, share them with the community, add friends, chat via the mailbox, and play a rich multiplayer experience natively in the browser.

## 🚀 Features
- **Custom Physics Engine:** Smooth jumping, dashing, and platforming.
- **Multiplayer Hub:** See other players run around as "ghosts" in real-time.
- **Level Editor:** Build your own levels with custom themes, decorations, and gimmicks.
- **Community Levels:** Play, like, dislike, and comment on user-generated levels.
- **Social System:** Send friend requests, view profiles, and chat via the built-in Mailbox.
- **Secure Authentication:** Uses a custom Gmail-based OTP verification system.
- **Owner Admin Tools:** The server owner can broadcast game updates and securely manage accounts.

## 🛠️ How to Host This Game

If you want to host this game online 24/7 (e.g., using Render.com or Railway), follow these steps:

1. **Upload this code** to a private GitHub repository.
2. **Connect your repository** to a Node.js cloud hosting provider (like Render).
3. **Set your Environment Variables.** This is crucial for the login system to work! In your host's dashboard, set the following variables:
   - `GMAIL_USER`: Your email address (e.g., `you@gmail.com`)
   - `GMAIL_APP_PASSWORD`: Your 16-character Google App Password.

*⚠️ **SECURITY WARNING:** Do NOT upload your `.env` file to a public GitHub repository. Use your hosting provider's Environment Variables dashboard instead!*

## 💻 How to Run Locally (For Testing)

1. Make sure you have [Node.js](https://nodejs.org/) installed on your computer.
2. Open a terminal in this folder and run:
   ```bash
   npm install
   ```
3. Create a `.env` file in this folder and add your Gmail credentials:
   ```env
   GMAIL_USER=your_email@gmail.com
   GMAIL_APP_PASSWORD=your_16_char_password
   ```
4. Start the server:
   ```bash
   node server.js
   ```
5. Open your web browser and go to `http://localhost:3000`

---
*Created by sonuubhagat11*

# VoiceLog.ai

A Telegram Bot that accepts voice notes, transcribes them (OpenAI Whisper), extracts structured data (OpenAI GPT-4), and saves it to a Notion Database.

## Setup

1.  **Clone:**
    ```bash
    git clone https://github.com/IAmUnbounded/voicelog-ai.git
    cd voicelog-ai
    npm install
    ```

2.  **Environment Variables:**
    Copy `.env.example` to `.env` and fill in the values:
    ```bash
    cp .env.example .env
    ```
    *   `TELEGRAM_TOKEN`: Get from @BotFather on Telegram.
    *   `OPENAI_API_KEY`: Get from OpenAI Platform.
    *   `NOTION_API_KEY`: Create an integration at https://www.notion.so/my-integrations.
    *   `NOTION_DATABASE_ID`: Open your database as a page, copy the ID from the URL (the part after workspace name and before `?`). **Important:** Share the database with your integration using the "..." menu > "Add connections".

3.  **Run:**
    ```bash
    npm run build
    npm start
    # Or for dev:
    npx ts-node src/bot.ts
    ```

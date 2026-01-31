import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import OpenAI from 'openai';
import { Client } from '@notionhq/client';
import axios from 'axios';
import fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!TELEGRAM_TOKEN || !OPENAI_API_KEY || !NOTION_API_KEY || !NOTION_DATABASE_ID) {
  console.error('Missing required environment variables. Please check .env');
  process.exit(1);
}

// Initialize Clients
const bot = new Telegraf(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const notion = new Client({ auth: NOTION_API_KEY });

// Interfaces
interface ExtractedData {
  category: string;
  amount: number;
  item: string;
  date: string;
  summary: string;
}

// Helper: Download Voice File
async function downloadFile(url: string, dest: string): Promise<void> {
  const writer = fs.createWriteStream(dest);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Helper: Add to Notion
async function addToNotion(data: ExtractedData) {
  try {
    await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID! },
      properties: {
        Item: {
          title: [
            {
              text: {
                content: data.item || 'Unknown Item',
              },
            },
          ],
        },
        Amount: {
          number: data.amount || 0,
        },
        Category: {
          select: {
            name: data.category || 'Uncategorized',
          },
        },
        Date: {
          date: {
            start: data.date || new Date().toISOString().split('T')[0],
          },
        },
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `Original Transcript: ${data.summary}`,
                },
              },
            ],
          },
        },
      ],
    });
    return true;
  } catch (error) {
    console.error('Notion Error:', error);
    return false;
  }
}

// Bot Logic
bot.start((ctx) => ctx.reply('Welcome to VoiceLog.ai! Send me a voice note to log an expense or event.'));

bot.on(message('voice'), async (ctx) => {
  const userId = ctx.from.id;
  const fileId = ctx.message.voice.file_id;

  try {
    await ctx.reply('🎤 Processing your voice note...');

    // 1. Get File Link
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const tempFilePath = path.join(__dirname, `../temp_${userId}_${Date.now()}.ogg`);

    // 2. Download File
    await downloadFile(fileLink.href, tempFilePath);

    // 3. Transcribe (Whisper)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
    });

    const text = transcription.text;
    await ctx.reply(`📝 Transcript: "${text}"\n\n🧠 Extracting data...`);

    // 4. Extract Data (GPT-4)
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a data extraction assistant. Extract structured data from the user's spoken log. 
          Return ONLY a valid JSON object with keys: "category" (string), "amount" (number, if applicable, else 0), "item" (string, short title), "date" (ISO 8601 format YYYY-MM-DD, assume current year if not specified).
          If it's not an expense, use category "Note" or "Journal".`,
        },
        { role: 'user', content: text },
      ],
      model: 'gpt-4-turbo-preview',
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0].message.content;
    if (!responseContent) throw new Error('No response from GPT');

    const extractedData: ExtractedData = JSON.parse(responseContent);
    extractedData.summary = text;

    // 5. Save to Notion
    const saved = await addToNotion(extractedData);

    // Cleanup
    await fs.remove(tempFilePath);

    if (saved) {
      await ctx.reply(
        `✅ Saved to Notion!\n\n**Item:** ${extractedData.item}\n**Amount:** ${extractedData.amount}\n**Category:** ${extractedData.category}\n**Date:** ${extractedData.date}`
      );
    } else {
      await ctx.reply('❌ Failed to save to Notion. Check console/logs.');
    }
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('⚠️ Something went wrong processing your message.');
  }
});

// Start Bot
bot.launch(() => {
    console.log('VoiceLog.ai Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of the Gemini client ensures that the server does not crash
// on start if the API key is not yet set in environment variables.
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required to use AI features.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// AI Consultation API Endpoint
async function callGeminiWithRetry(ai: GoogleGenAI, systemInstruction: string, promptText: string) {
  const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const maxRetries = 3;
    let delay = 600; // start with 600ms
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini] Attempting query of model: ${model} (Attempt ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          model: model,
          contents: promptText,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        
        if (response && response.text) {
          console.log(`[Gemini] Generation succeeded using model: ${model}`);
          return response;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`[Gemini] Attempt ${attempt} on model ${model} failed:`, error.message || error);
        
        if (attempt < maxRetries) {
          console.log(`[Gemini] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        }
      }
    }
    console.log(`[Gemini] All attempts failed for model: ${model}. Moving to fallback model if available...`);
  }
  
  throw lastError || new Error("所有可用的 Gemini 模型本輪皆因過載或不可用而連線失敗。");
}

app.post("/api/gemini/consult", async (req, res) => {
  try {
    const { question, context, apiKey } = req.body;
    if (!question) {
      return res.status(400).json({ error: "請輸入您的問題！" });
    }

    // Prioritize user-provided API key, fallback to server environment key
    const finalApiKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
    if (!finalApiKey) {
      return res.status(401).json({ 
        error: "請先在看板右上方的「API 金鑰設定」欄位輸入您的 Gemini API Key（以 AI 諮詢功能改由使用者輸入API key才能存取有效，避免外洩）。本系統僅將此金鑰用於代理轉發，絕不任意儲存或外洩。" 
      });
    }

    const ai = new GoogleGenAI({
      apiKey: finalApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = `
你是一位精通個人效能提升與專案管理的 AI 任務板看板導師。
使用者目前在使用一個分為三欄（「待辦」、「進行中」、「完成」）的輕量 Kanban 看板管理任務。
請扮演一位溫暖、務實、思路清晰的教練。根據使用者當前看板上的任務狀態和他們提出的提問，提供極具建設性、好執行的行動建議或排序引導。
如果使用者問了與任務看板不相干的話題，也請溫柔引導回任務組織和時間管理上，並回答其話題。

回答格式要求：
1. 採用 Markdown 格式渲染，善用標題、粗體、條列式與列表排版，使其具有極高的可讀性與高對比視覺層次。
2. 保持字數適度（約 200 - 450 字），言簡意賅。
3. 為了展現神奇的生產力工具一鍵新增功能，如果你給出了具體的行動建議，**請務必在回答的最底部**，加上一個特製 JSON 區塊，列出 1 ~ 3 個你想推薦給使用者直接新增到「待辦欄(Todo)」的任務建議卡片。
特製 JSON 區塊格式如下：
[SUGGESTED_TASKS]
[
  {"text": "建議的任務卡片內容 1"},
  {"text": "建議的任務卡片內容 2"}
]
[/SUGGESTED_TASKS]
注意：請嚴格遵守這個區塊在整段回答的最後一行，不要在其之後添加額外文字。JSON 數組內的元素務必是包含 "text" 屬性的物件。
`;

    const promptText = `
【目前 Kanban 欄位內的卡片細節】：
${context || "（目前看板上沒有任何任務卡片）"}

【使用者提出的諮詢問題】：
"${question}"

請為使用者提供敏捷管理建議。並在底部提供 [SUGGESTED_TASKS] (如果有建設性的具體新增行動建議)。
`;

    const response = await callGeminiWithRetry(ai, systemInstruction, promptText);

    const answer = response.text || "抱歉，AI 暫時未能提供有效的回應，請再試一次。";
    res.json({ answer });
  } catch (error: any) {
    console.error("Server-side Gemini consultation failed:", error);
    res.status(500).json({ error: error.message || "AI 諮詢服務發生非預期錯誤，請檢查您的 GEMINI_API_KEY 配置。" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Express server booting up at http://localhost:${PORT}`);
  });
}

startServer();

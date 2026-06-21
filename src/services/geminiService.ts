
import { GoogleGenAI, Type } from "@google/genai";
import { AppTheme } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateThemeFromText = async (text: string): Promise<AppTheme> => {
  if (!text || text.length < 10) {
    throw new Error("Text too short for analysis");
  }

  const prompt = `
    Analyze the following text content and determine the most appropriate visual theme (colors and fonts) for a PDF document.
    
    CRITICAL PRINTING REQUIREMENTS:
    1. HIGH CONTRAST IS MANDATORY.
    2. 'text' and 'heading' colors must be BLACK (#000000) or VERY DARK GREY (#111827).
    3. 'background' must be PURE WHITE (#ffffff).
    4. 'codeBackground' MUST BE A PASTEL TINT matching the primary color (e.g. #eff6ff for blue, #fdf2f8 for pink). DO NOT USE GREY.
    5. 'primary' color must be dark enough for legibility on white paper.
    6. NO NEON COLORS.

    Return a JSON object matching the AppTheme structure.
    
    Fonts must be chosen from this list ONLY:
    - "Inter, sans-serif"
    - "Merriweather, serif"
    - "Playfair Display, serif"
    - "Lato, sans-serif"
    - "Fira Code, monospace"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${prompt}\n\nContent:\n${text.substring(0, 3000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            colors: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING },
                secondary: { type: Type.STRING },
                background: { type: Type.STRING },
                text: { type: Type.STRING },
                codeBackground: { type: Type.STRING },
                heading: { type: Type.STRING },
              },
              required: ["primary", "secondary", "background", "text", "codeBackground", "heading"]
            },
            fonts: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                body: { type: Type.STRING },
                code: { type: Type.STRING },
              },
              required: ["heading", "body", "code"]
            }
          },
          required: ["name", "colors", "fonts"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Empty response from AI");
    
    return JSON.parse(resultText) as AppTheme;

  } catch (error) {
    console.error("Gemini Theme Error:", error);
    throw new Error("Failed to generate theme.");
  }
};

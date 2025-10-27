import { SpeechClient } from "@google-cloud/speech";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { getNLUPrompt } from "../prompts/nlu-prompt";
import type { NLUResult } from "../types";

export class SpeechService {
  private speechClient: SpeechClient;
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.speechClient = new SpeechClient();
    this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
  }

  async transcribeAudio(
    audioBase64: string,
    contactNames: string[],
    userId: string
  ): Promise<string> {
    const audio = { content: audioBase64 };

    const contactPhrases = contactNames.map((name) => ({
      value: name,
      boost: config.speech.contactBoost,
    }));

    const allPhrases = [...contactPhrases];

    const speechConfig = {
      encoding: config.speech.encoding,
      sampleRateHertz: config.speech.sampleRateHertz,
      languageCode: config.speech.languageCode,
      adaptation: {
        phraseSets: [
          {
            id: `user-contacts-${userId}`,
            phrases: allPhrases,
          },
        ],
      },
      useEnhanced: config.speech.useEnhanced,
      model: config.speech.model,
    };

    const request = { audio, config: speechConfig };

    const [response] = await this.speechClient.recognize(request);
    const transcript = response.results
      ?.map((result: any) => result.alternatives?.[0].transcript)
      .join("\n");

    if (!transcript) {
      throw new Error("Could not transcribe audio.");
    }

    console.log("Transcription result:", transcript);
    return transcript;
  }

  async processCommand(transcript: string): Promise<NLUResult> {
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = getNLUPrompt(transcript);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonText = response.text();

    if (!jsonText) {
      throw new Error("Failed to get NLU result from Gemini");
    }

    return JSON.parse(jsonText);
  }
}

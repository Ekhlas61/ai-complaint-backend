const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
require('dotenv').config();

const moderationSchema = z.object({
  isSpam: z.boolean(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  department: z.string().nullable(),
  duplicateOf: z.string().nullable(),
  aiConfidence: z.number().min(0).max(1),
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// fallback for when the AI fails 
function keywordMatch(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('water') || text.includes('tap') || text.includes('pipe') || text.includes('sewer')) {
    return { dept: 'WATER_SUPPLY', confidence: 0.7 };
  }
  if (text.includes('electric') || text.includes('power') || text.includes('light') || text.includes('transformer')) {
    return { dept: 'POWER_OUTAGE', confidence: 0.7 };
  }
  if (text.includes('road') || text.includes('pothole') || text.includes('street')) {
    return { dept: 'ROAD_MAINTENANCE', confidence: 0.7 };
  }
  if (text.includes('bill') || text.includes('meter') || text.includes('charge')) {
    return { dept: 'CUSTOMER_SERVICE', confidence: 0.6 };
  }
  return { dept: null, confidence: 0.5 };
}

async function moderateComplaint(title, description, organizationName, departmentsListString) {
  const prompt = `
You are an AI assistant. Return ONLY a valid JSON object. Do not include any other text, explanations, or markdown.

Complaint title: "${title}"
Description: "${description}"
Organization: ${organizationName}
Available departments (code: name – description):
${departmentsListString}

Rules:
- isSpam: true only for obvious spam (promotions, scams).
- priority: Critical = danger, High = urgent disruption, Medium = normal, Low = minor.
- department: choose the best code from the list, or null if spam.
- duplicateOf: always null.
- aiConfidence: 0.9+ for clear match, 0.7-0.89 for good match, 0.5-0.69 for ambiguous, <0.5 for vague.

Example output:
{"isSpam": false, "priority": "High", "department": "WATER_SUPPLY", "duplicateOf": null, "aiConfidence": 0.95}
`;

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 150,
      },
    });

    let raw = response.text;
    console.log('Raw AI response:', raw);

    // Extract JSON between first { and last }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found');
    const jsonStr = raw.substring(start, end + 1);
    const result = JSON.parse(jsonStr);
    // Validate with Zod schema
    return moderationSchema.parse(result);
  } catch (error) {
    console.error('AI error, using keyword fallback:', error.message);
    const match = keywordMatch(title, description);
    return {
      isSpam: false,
      priority: 'Medium',
      department: match.dept,
      duplicateOf: null,
      aiConfidence: match.confidence,
    };
  }
}

module.exports = { moderateComplaint };
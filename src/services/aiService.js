const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
require('dotenv').config();

const moderationSchema = z.object({
  isSpam: z.boolean(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  departments: z.array(z.string()).nullable(),
  duplicateOf: z.string().nullable(),
  aiConfidence: z.number().min(0).max(1),
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function keywordMatch(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const deptMap = [
    { keywords: [/water|tap|pipe|sewer|ውሃ|ቧንቧ|ፈሰሰ/], dept: 'WATER_SUPPLY' },
    { keywords: [/electric|power|light|transformer|ኤሌክትሪክ|ኃይል/], dept: 'POWER_OUTAGE' },
    { keywords: [/road|pothole|street|መንገድ|ጉድጓድ/], dept: 'ROAD_MAINTENANCE' },
    { keywords: [/bill|meter|charge|ቢል|ሜትር/], dept: 'CUSTOMER_SERVICE' },
  ];
  const matched = deptMap.filter(entry => entry.keywords.some(k => k.test(text))).map(entry => entry.dept);
  return {
    depts: matched.length ? matched : null,
    confidence: matched.length ? 0.7 : 0.5,
  };
}

async function translateToEnglish(text) {
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: `Translate the following text to English. Output only the translation, no extra text:\n\n${text}`,
      config: { temperature: 0, maxOutputTokens: 500 },
    });
    return response.text.trim();
  } catch (err) {
    console.warn('Translation failed, using original text:', err.message);
    return text;
  }
}

async function moderateComplaint(title, description, organizationName, departmentsListString) {
  const hasAmharic = /[\u1200-\u137F]/.test(title + description);
  let finalTitle = title;
  let finalDesc = description;
  if (hasAmharic) {
    console.log('Amharic detected, translating...');
    finalTitle = await translateToEnglish(title);
    finalDesc = await translateToEnglish(description);
  }

  const prompt = `
You are an AI assistant that classifies citizen complaints. Return ONLY a valid JSON object. No other text, no markdown.

Complaint title: "${finalTitle}"
Description: "${finalDesc}"
Organization: ${organizationName}
Available departments (code: name – description):
${departmentsListString}

RULES:
1. **isSpam** = true if ANY of these are present:
   - Promotional links (http, https, bit.ly, t.me, etc.)
   - Money offers ("win money", "free gift", "lottery", "crypto", "bitcoin", "get paid")
   - Irrelevant ads ("buy now", "discount", "click here", "subscribe")
   - Gibberish or random characters (e.g., "asdfghjkl")
   - No mention of any civic issue (water, electricity, road, garbage, sewage, safety)
   - Repeated identical messages or obvious copy-paste
   - Requests for personal information (password, bank details)
   
   If you are unsure, set isSpam = false but lower aiConfidence.

2. **priority**:
   - Critical: Immediate danger to life or property (building collapse, fire, gas leak, fallen live wires, severe accident)
   - High: Urgent disruption affecting many people (no water/electricity for hours, major road blocked, sewage overflow)
   - Medium: Normal complaint (slow leak, flickering light, pothole, billing inquiry)
   - Low: Minor issue (aesthetic, slight inconvenience, general question)

3. **departments**: ARRAY of department codes from the list that should handle this complaint. 
   - A complaint may involve multiple departments (e.g., burst pipe -> PIPE_MAINTENANCE + WATER_SUPPLY).
   - If spam or truly unrelated to any department, return empty array [].
   - If only one department, return e.g., ["WATER_QUALITY"].

4. **duplicateOf**: Always null (handled separately).

5. **aiConfidence**:
   - 0.90-1.00: Very clear, obvious spam or clear department match
   - 0.70-0.89: Good match, minor ambiguity
   - 0.50-0.69: Unclear language or mixed signals
   - 0.00-0.49: Very vague or unable to understand

EXAMPLES (follow exactly this format):

Example 1 (spam with link):
{"isSpam": true, "priority": "Low", "departments": [], "duplicateOf": null, "aiConfidence": 0.95}

Example 2 (spam, money offer):
{"isSpam": true, "priority": "Low", "departments": [], "duplicateOf": null, "aiConfidence": 0.93}

Example 3 (burst pipe - two departments):
{"isSpam": false, "priority": "High", "departments": ["PIPE_MAINTENANCE", "WATER_SUPPLY"], "duplicateOf": null, "aiConfidence": 0.92}

Example 4 (power outage with safety risk):
{"isSpam": false, "priority": "Critical", "departments": ["POWER_OUTAGE", "SAFETY_EMERGENCY"], "duplicateOf": null, "aiConfidence": 0.94}

Example 5 (water quality only):
{"isSpam": false, "priority": "High", "departments": ["WATER_QUALITY"], "duplicateOf": null, "aiConfidence": 0.88}

Example 6 (low confidence, ambiguous):
{"isSpam": false, "priority": "Medium", "departments": [], "duplicateOf": null, "aiConfidence": 0.55}

Now analyze the complaint above and return ONLY the JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
      },
    });

    let raw = response.text;
    console.log('Raw AI response:', raw);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found');
    const jsonStr = raw.substring(start, end + 1);
    const result = JSON.parse(jsonStr);
    return moderationSchema.parse(result);
  } catch (error) {
    console.error('AI error, using keyword fallback:', error.message);
    const match = keywordMatch(title, description);
    return {
      isSpam: false,
      priority: 'Medium',
      departments: match.depts,
      duplicateOf: null,
      aiConfidence: match.confidence,
    };
  }
}

module.exports = { moderateComplaint };
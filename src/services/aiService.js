const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
require('dotenv').config();

// Schema for AI response
const moderationSchema = z.object({
  isSpam: z.boolean(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  department: z.string().nullable(),
  duplicateOf: z.string().nullable(),
  aiConfidence: z.number().min(0).max(1),
  requiresManualReview: z.boolean(),
  reasoning: z.string(),
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper: Calculate text similarity for duplicate detection
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// Helper: Find duplicate complaints in database
async function findDuplicateComplaint(complaintTitle, complaintDescription, organizationId,complaintId, threshold = 0.6) {
  const Complaint = require('../models/Complaint');
  
  const recentComplaints = await Complaint.find({
    organization: organizationId,
    status: { $ne: 'Rejected' },
     _id: { $ne: complaintId },
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
  }).limit(20);
  
  let bestMatch = null;
  let highestSimilarity = 0;
  const currentText = `${complaintTitle} ${complaintDescription}`;
  
  for (const complaint of recentComplaints) {
    const candidateText = `${complaint.title} ${complaint.description}`;
    const similarity = calculateSimilarity(currentText, candidateText);
    if (similarity > highestSimilarity && similarity >= threshold) {
      highestSimilarity = similarity;
      bestMatch = complaint._id;
    }
  }
  
  return { duplicateId: bestMatch, similarity: highestSimilarity };
}

// Helper: Spam detection without AI (quick check)
function quickSpamCheck(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  const spamIndicators = {
    urls: /https?:\/\/|www\.|bit\.ly|tinyurl|t\.me/,
    money: /win|free|money|cash|prize|lottery|million|birr|dollar|crypto|bitcoin|invest/i,
    promotional: /click here|subscribe|buy now|offer|discount|sale|limited time/i,
    phishing: /password|bank account|credit card|verify|login|credentials/i,
    gibberish: /^[a-z]{20,}$|asdf|qwerty|zxcv/i,
  };
  
  for (const [type, pattern] of Object.entries(spamIndicators)) {
    if (pattern.test(text)) {
      return { isSpam: true, reason: type, confidence: 0.85 };
    }
  }
  
  return { isSpam: false, reason: null, confidence: 0 };
}

// Helper: Translate Amharic to English
async function translateToEnglish(text) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: `You are a translator. Translate the following Amharic text to English. Output ONLY the English translation, no explanations, no quotes:\n\n${text}`,
      config: { temperature: 0, maxOutputTokens: 500 },
    });
    return response.text.trim();
  } catch (err) {
    console.warn('Translation failed:', err.message);
    return text;
  }
}

// Helper: Get departments as formatted string for AI prompt
async function getDepartmentsForPrompt(organizationId) {
  const Department = require('../models/Department');
  const departments = await Department.find({ 
    organization: organizationId, 
    isActive: true 
  }).select('code name description');
  
  return departments.map(dept => 
    `- ${dept.code}: ${dept.name} - ${dept.description || 'No description'}`
  ).join('\n');
}

// Main AI moderation function
async function moderateComplaint(title, description, organizationName, organizationId) {
  try {
    // Quick spam detection first (fast, no API call)
    const quickSpam = quickSpamCheck(title, description);
    if (quickSpam.isSpam) {
      console.log('Quick spam detected:', quickSpam.reason);
      return {
        isSpam: true,
        priority: 'Low',
        department: null,
        duplicateOf: null,
        aiConfidence: 0.85,
        requiresManualReview: false,
        reasoning: `Marked as spam: ${quickSpam.reason}`,
      };
    }
    
    // Check for duplicates in database
    const duplicateCheck = await findDuplicateComplaint(title, description, organizationId, null,  0.6);
    if (duplicateCheck.duplicateId && duplicateCheck.similarity > 0.7) {
      console.log('Duplicate found with similarity:', duplicateCheck.similarity);
      return {
        isSpam: false,
        priority: 'Medium',
        department: null,
        duplicateOf: duplicateCheck.duplicateId,
        aiConfidence: 0.8,
        requiresManualReview: true,
        reasoning: `This appears to be a duplicate (${Math.round(duplicateCheck.similarity * 100)}% similar to an existing complaint). Please review.`,
      };
    }
    
    // Translate if needed
    const hasAmharic = /[\u1200-\u137F]/.test(title + description);
    let finalTitle = title;
    let finalDesc = description;
    
    if (hasAmharic) {
      console.log('Amharic detected, translating for better analysis...');
      finalTitle = await translateToEnglish(title);
      finalDesc = await translateToEnglish(description);
      console.log('Translation complete');
    }
    
    //  Get departments for the organization
    const departmentsList = await getDepartmentsForPrompt(organizationId);
    
    if (!departmentsList) {
      console.log('No departments found, requiring manual review');
      return {
        isSpam: false,
        priority: 'Medium',
        department: null,
        duplicateOf: null,
        aiConfidence: 0.3,
        requiresManualReview: true,
        reasoning: 'No departments configured for this organization. Please assign manually.',
      };
    }
    
    
    const prompt = `You are an expert complaint classifier for a utility service provider. Analyze this complaint and return ONLY valid JSON.

COMPLAINT:
Title: "${finalTitle}"
Description: "${finalDesc}"
Organization: ${organizationName}

AVAILABLE DEPARTMENTS (code: name - responsibility):
${departmentsList}

CLASSIFICATION RULES:

1. **SPAM DETECTION** - Set isSpam = true if ANY of these apply:
   - Contains promotional links (http, https, bit.ly, t.me, telegram)
   - Money offers ("win money", "free gift", "lottery", "crypto", "bitcoin", "get paid", "earn")
   - Irrelevant ads ("buy now", "discount", "click here", "subscribe", "limited offer")
   - Phishing attempts ("verify account", "update password", "bank details")
   - Random characters or gibberish
   - Completely unrelated to utility services (water, electricity, billing, meters)
   
   Set isSpam = false for legitimate complaints.

2. **PRIORITY ASSIGNMENT**:
   - Critical: Immediate danger to life or property (fallen live wires, electrical fire, gas leak, building collapse, major flooding, exposed cables)
   - High: Urgent disruption affecting many people (no water/electricity for 12+ hours, major pipe burst, sewage overflow, dangerous road condition)
   - Medium: Standard issue (low water pressure, intermittent power, meter not working, billing question, minor leak)
   - Low: Minor inconvenience (aesthetic issue, general inquiry, future concern)

3. **DEPARTMENT ASSIGNMENT**:
   - Choose the SINGLE most appropriate department code from the list above
   - Consider the department's responsibility description
   - If truly unclear or spans multiple departments, choose the primary one
   - If spam or completely unrelated, department = null

4. **CONFIDENCE SCORE** (0 to 1):
   - 0.90-1.00: Very clear, unambiguous complaint, exact department match
   - 0.80-0.89: Clear complaint, confident department assignment
   - 0.70-0.79: Generally clear, some minor ambiguity
   - 0.60-0.69: Moderate clarity, possible multiple interpretations
   - 0.50-0.59: Unclear language, low confidence in classification
   - 0.00-0.49: Very vague, cannot reliably classify

5. **MANUAL REVIEW** - Set requiresManualReview = true when:
   - Confidence score < 0.70
   - Multiple departments could reasonably handle it
   - Complaint language is very vague or unclear
   - New type of complaint not seen before
   - Confidence is moderate but you want human verification

   Set requiresManualReview = false when:
   - Confidence score >= 0.80
   - Clear, straightforward complaint
   - Obvious department match

6. **REASONING** - Provide a brief explanation (1-2 sentences) for your classification.

OUTPUT FORMAT (ONLY JSON, no other text):
{
  "isSpam": false,
  "priority": "High",
  "department": "WATER_SUPPLY",
  "duplicateOf": null,
  "aiConfidence": 0.85,
  "requiresManualReview": false,
  "reasoning": "Burst pipe causing water wastage and road damage, requires urgent attention from Water Supply department."
}

EXAMPLES:

Example 1 (Spam):
{"isSpam": true, "priority": "Low", "department": null, "duplicateOf": null, "aiConfidence": 0.95, "requiresManualReview": false, "reasoning": "Contains promotional link and money offer."}

Example 2 (Critical - Electrical danger):
{"isSpam": false, "priority": "Critical", "department": "SAFETY_EMERGENCY", "duplicateOf": null, "aiConfidence": 0.92, "requiresManualReview": false, "reasoning": "Fallen live electrical wire poses immediate danger to public safety."}

Example 3 (High - Water outage):
{"isSpam": false, "priority": "High", "department": "WATER_SUPPLY", "duplicateOf": null, "aiConfidence": 0.88, "requiresManualReview": false, "reasoning": "Area-wide water outage affecting many residents, requires immediate attention."}

Example 4 (Unclear - needs review):
{"isSpam": false, "priority": "Medium", "department": null, "duplicateOf": null, "aiConfidence": 0.55, "requiresManualReview": true, "reasoning": "Complaint is vague about the issue, could be multiple departments. Manual review recommended."}

Now analyze the complaint above and return ONLY the JSON object.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    let raw = response.text;
    console.log('Raw AI response:', raw);
    
    // Extract JSON from response
    let jsonStr = raw;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonStr = raw.substring(start, end + 1);
    }
    
    // Clean up any markdown
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const result = JSON.parse(jsonStr);
    
    // Ensure all required fields exist
    const finalResult = {
      isSpam: result.isSpam || false,
      priority: result.priority || 'Medium',
      department: result.department || null,
      duplicateOf: duplicateCheck.duplicateId || null,
      aiConfidence: result.aiConfidence || 0.5,
      requiresManualReview: result.requiresManualReview || result.aiConfidence < 0.7,
      reasoning: result.reasoning || 'AI analysis completed.',
    };
    
    // Validate department exists in the organization
    if (finalResult.department) {
      const Department = require('../models/Department');
      const deptExists = await Department.findOne({ 
        code: finalResult.department, 
        organization: organizationId,
        isActive: true 
      });
      if (!deptExists) {
        console.warn(`Department ${finalResult.department} not found, setting to null`);
        finalResult.department = null;
        finalResult.requiresManualReview = true;
        finalResult.reasoning = `Department "${finalResult.department}" not found in system. Manual review needed.`;
      }
    }
    
    // If duplicate found, mark for review
    if (duplicateCheck.duplicateId && !result.isSpam) {
      finalResult.requiresManualReview = true;
      finalResult.reasoning = `${finalResult.reasoning} Also, this appears similar to an existing complaint.`;
    }
    
    // Validate confidence threshold
    if (finalResult.aiConfidence < 0.7 && !finalResult.isSpam) {
      finalResult.requiresManualReview = true;
    }
    
    return moderationSchema.parse(finalResult);
    
  } catch (error) {
    console.error('AI service error:', error.message);
    
    // Fallback response for when AI fails
    return {
      isSpam: false,
      priority: 'Medium',
      department: null,
      duplicateOf: null,
      aiConfidence: 0.3,
      requiresManualReview: true,
      reasoning: `AI service temporarily unavailable. Manual review required. Error: ${error.message.substring(0, 100)}`,
    };
  }
}

module.exports = { 
  moderateComplaint,
  findDuplicateComplaint,
  quickSpamCheck 
};
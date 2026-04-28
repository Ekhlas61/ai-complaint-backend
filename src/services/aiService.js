const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
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

// Initialize AI clients
const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let groqClient = null;
if (process.env.GROQ_API_KEY) {
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('[AI] Groq client initialized as fallback');
}

// Provider stats for monitoring
const providerStats = {
  gemini: { success: 0, failures: 0, lastError: null },
  groq: { success: 0, failures: 0, lastError: null }
};

// ========== GEMINI IMPLEMENTATION ==========
async function callGemini(prompt) {
  try {
    console.log('[Gemini] Sending request...');
    
    const response = await geminiAI.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });
    
    providerStats.gemini.success++;
    console.log('[Gemini] Success');
    return { success: true, text: response.text, provider: 'gemini' };
    
  } catch (error) {
    providerStats.gemini.failures++;
    providerStats.gemini.lastError = error.message;
    
    const isQuotaError = error.code === 429 || 
                        error.message?.includes('quota') ||
                        error.message?.includes('rate limit') ||
                        error.message?.includes('exhausted');
    
    console.log(`[Gemini] Failed: ${error.message} (Quota error: ${isQuotaError})`);
    return { success: false, error, isQuotaError, provider: 'gemini' };
  }
}

// ========== GROQ IMPLEMENTATION (FALLBACK) ==========
async function callGroq(prompt) {
  if (!groqClient) {
    console.log('[Groq] Client not initialized (missing API key)');
    return { success: false, error: new Error('Groq client not initialized'), provider: 'groq' };
  }
  
  try {
    console.log('[Groq] Sending request as fallback...');
    
    const response = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'You are a complaint classifier for a utility company. Return ONLY valid JSON, no explanations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 300,
    });
    
    providerStats.groq.success++;
    console.log('[Groq] Success');
    return { success: true, text: response.choices[0].message.content, provider: 'groq' };
    
  } catch (error) {
    providerStats.groq.failures++;
    providerStats.groq.lastError = error.message;
    console.log(`[Groq] Failed: ${error.message}`);
    return { success: false, error, provider: 'groq' };
  }
}

// ========== MAIN ORCHESTRATOR ==========
async function callAIWithFallback(prompt) {
  // Try Gemini first
  let result = await callGemini(prompt);
  
  // If Gemini succeeded, return
  if (result.success) {
    return result;
  }
  
  // If Gemini failed due to quota, try Groq
  if (result.isQuotaError && groqClient) {
    console.log('[AI] Gemini quota exceeded, falling back to Groq...');
    const groqResult = await callGroq(prompt);
    
    if (groqResult.success) {
      console.log('[AI] Successfully using Groq as fallback');
      return groqResult;
    }
  }
  
  // Both failed
  console.log('[AI] All providers failed');
  return { success: false, error: result.error };
}

// ========== HELPER FUNCTIONS ==========

// Calculate text similarity for duplicate detection
function calculateSimilarity(text1, text2) {
  const normalize = (text) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
  };
  
  const words1 = normalize(text1);
  const words2 = normalize(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Find duplicate complaints
async function findDuplicateComplaint(complaintTitle, complaintDescription, organizationId, complaintId, threshold = 0.6) {
  const Complaint = require('../models/Complaint');
  
  if (!complaintId) {
    return { duplicateId: null, similarity: 0 };
  }
  
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

// Quick spam detection (pre-AI filter)
function quickSpamCheck(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  const utilityKeywords = [
    'water', 'electric', 'power', 'meter', 'bill', 'pipe', 'tap', 
    'leak', 'outage', 'supply', 'quality', 'sewer', 'drain', 
    'transformer', 'line', 'cable', 'reading', 'payment'
  ];
  
  let hasUtilityContext = false;
  for (const keyword of utilityKeywords) {
    if (text.includes(keyword)) {
      hasUtilityContext = true;
      break;
    }
  }
  
  if (hasUtilityContext) {
    const hasSuspiciousLink = /https?:\/\/|www\.|bit\.ly|t\.me/i.test(text);
    if (hasSuspiciousLink) {
      return { isSpam: true, reason: 'suspicious link in utility complaint', confidence: 0.75 };
    }
    return { isSpam: false, reason: null, confidence: 0 };
  }
  
  const spamPatterns = [
    { pattern: /https?:\/\/|www\.|bit\.ly|t\.me|telegram\.me/i, type: 'urls', confidence: 0.9 },
    { pattern: /win.*money|free.*money|earn.*money|cash.*prize/i, type: 'money_scam', confidence: 0.85 },
    { pattern: /crypto|bitcoin|invest.*money|get.*rich/i, type: 'crypto_scam', confidence: 0.85 },
    { pattern: /click here|subscribe|buy now|limited time offer/i, type: 'promotional', confidence: 0.8 },
    { pattern: /password|bank account|credit card|verify your account/i, type: 'phishing', confidence: 0.95 },
  ];
  
  for (const { pattern, type, confidence } of spamPatterns) {
    if (pattern.test(text)) {
      return { isSpam: true, reason: type, confidence: confidence };
    }
  }
  
  return { isSpam: false, reason: null, confidence: 0 };
}

// Translate Amharic to English (using primary AI provider)
async function translateToEnglish(text) {
  try {
    const result = await callAIWithFallback(`You are a translator. Translate the following Amharic text to English. Output ONLY the English translation, no explanations, no quotes:\n\n${text}`);
    
    if (result.success) {
      return result.text.trim();
    }
    return text;
  } catch (err) {
    console.warn('[Translation] Failed:', err.message);
    return text;
  }
}

// Get departments as formatted string for AI prompt
async function getDepartmentsForPrompt(organizationId) {
  const Department = require('../models/Department');
  const departments = await Department.find({ 
    organization: organizationId, 
    isActive: true 
  }).select('code name description');
  
  if (departments.length === 0) return null;
  
  return departments.map(dept => 
    `- ${dept.code}: ${dept.name} - ${dept.description || 'No description'}`
  ).join('\n');
}

// ========== MAIN AI MODERATION FUNCTION ==========
async function moderateComplaint(title, description, organizationName, organizationId, complaintId = null) {
  try {
    console.log(`[AI] Processing complaint: ${complaintId || 'new'}`);
    
    // Step 1: Quick spam detection (no AI needed)
    const quickSpam = quickSpamCheck(title, description);
    if (quickSpam.isSpam) {
      console.log('[AI] Spam detected (pre-filter):', quickSpam.reason);
      return {
        isSpam: true,
        priority: 'Low',
        department: null,
        duplicateOf: null,
        aiConfidence: quickSpam.confidence,
        requiresManualReview: false,
        reasoning: `Marked as spam: ${quickSpam.reason}`,
      };
    }
    
    // Step 2: Check for duplicates
    let duplicateCheck = { duplicateId: null, similarity: 0 };
    if (complaintId) {
      duplicateCheck = await findDuplicateComplaint(title, description, organizationId, complaintId, 0.6);
      if (duplicateCheck.duplicateId && duplicateCheck.similarity > 0.7) {
        console.log('[AI] Duplicate found:', duplicateCheck.similarity);
        return {
          isSpam: false,
          priority: 'Medium',
          department: null,
          duplicateOf: duplicateCheck.duplicateId,
          aiConfidence: 0.8,
          requiresManualReview: true,
          reasoning: `Potential duplicate (${Math.round(duplicateCheck.similarity * 100)}% similar). Manual review recommended.`,
        };
      }
    }
    
    // Step 3: Translate Amharic if needed
    const hasAmharic = /[\u1200-\u137F]/.test(title + description);
    let finalTitle = title;
    let finalDesc = description;
    
    if (hasAmharic) {
      console.log('[AI] Amharic detected, translating...');
      finalTitle = await translateToEnglish(title);
      finalDesc = await translateToEnglish(description);
    }
    
    // Step 4: Get departments
    const departmentsList = await getDepartmentsForPrompt(organizationId);
    
    if (!departmentsList) {
      console.log('[AI] No departments found');
      return {
        isSpam: false,
        priority: 'Medium',
        department: null,
        duplicateOf: null,
        aiConfidence: 0.3,
        requiresManualReview: true,
        reasoning: 'No departments configured. Manual review required.',
      };
    }
    
    // Step 5: Build prompt
    const prompt = `You are a complaint classifier for a utility company. Analyze this complaint and return ONLY JSON.

COMPLAINT:
Title: "${finalTitle}"
Description: "${finalDesc}"
Organization: ${organizationName}

DEPARTMENTS available:
${departmentsList}

CLASSIFY using these rules:
1. isSpam: true ONLY if contains promotional links, money offers, or phishing attempts.
2. priority: Critical=danger to life/property, High=major disruption (12+ hours), Medium=standard issue, Low=minor
3. department: Choose the BEST matching department code from the list. Use null if unclear.
4. aiConfidence: 0.9+=very clear, 0.8-0.89=clear, 0.7-0.79=good, 0.6-0.69=moderate, <0.6=unclear
5. requiresManualReview: true if confidence < 0.7 OR department is null
6. reasoning: One short sentence explaining your classification

Return ONLY valid JSON. Example:
{"isSpam": false, "priority": "High", "department": "WATER_SUPPLY", "aiConfidence": 0.85, "requiresManualReview": false, "reasoning": "Area-wide water outage requires urgent attention."}`;

    // Step 6: Call AI with fallback
    const aiResponse = await callAIWithFallback(prompt);
    
    if (!aiResponse.success) {
      throw new Error('All AI providers failed');
    }
    
    console.log(`[AI] Response from ${aiResponse.provider}`);
    
    // Step 7: Parse response
    let raw = aiResponse.text;
    let jsonStr = raw;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonStr = raw.substring(start, end + 1);
    }
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const result = JSON.parse(jsonStr);
    
    // Step 8: Build final result
    const finalResult = {
      isSpam: result.isSpam || false,
      priority: result.priority || 'Medium',
      department: result.department || null,
      duplicateOf: duplicateCheck.duplicateId || null,
      aiConfidence: result.aiConfidence || 0.5,
      requiresManualReview: result.requiresManualReview || (result.aiConfidence || 0.5) < 0.7,
      reasoning: `${result.reasoning || 'AI analysis completed.'} (Provider: ${aiResponse.provider})`,
    };
    
    // Step 9: Validate department exists
    if (finalResult.department) {
      const Department = require('../models/Department');
      const deptExists = await Department.findOne({ 
        code: finalResult.department, 
        organization: organizationId,
        isActive: true 
      });
      if (!deptExists) {
        console.log(`[AI] Department ${finalResult.department} not found`);
        finalResult.department = null;
        finalResult.requiresManualReview = true;
        finalResult.aiConfidence = 0.5;
        finalResult.reasoning = `Department "${finalResult.department}" not found. Manual review needed. (Provider: ${aiResponse.provider})`;
      }
    }
    
    console.log('[AI] Final result:', finalResult);
    return moderationSchema.parse(finalResult);
    
  } catch (error) {
    console.error('[AI] Service error:', error.message);
    
    // Fallback response
    return {
      isSpam: false,
      priority: 'Medium',
      department: null,
      duplicateOf: null,
      aiConfidence: 0.3,
      requiresManualReview: true,
      reasoning: `AI service temporarily unavailable. Manual review required.`,
    };
  }
}

// ========== MONITORING FUNCTIONS ==========
function getProviderStats() {
  return { ...providerStats };
}

module.exports = { 
  moderateComplaint,
  findDuplicateComplaint,
  quickSpamCheck,
  getProviderStats
};
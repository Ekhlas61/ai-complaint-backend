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

// ========== CACHE IMPLEMENTATION ==========
class AICache {
  constructor(ttl = 3600000) { // Default TTL: 1 hour
    this.cache = new Map();
    this.ttl = ttl;
  }

  generateKey(title, description, organizationId) {
    // Create a normalized key for caching
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedDesc = description.toLowerCase().trim();
    return `${normalizedTitle}|${normalizedDesc}|${organizationId}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.result;
  }

  set(key, result) {
    this.cache.set(key, {
      result: result,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
    console.log('[Cache] Cleared all cached entries');
  }

  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl / 1000 + ' seconds'
    };
  }
}

// Initialize cache
const aiCache = new AICache(3600000); // 1 hour TTL

// ========== RETRY LOGIC ==========
async function callGeminiWithRetry(prompt, maxRetries = 3, initialDelay = 1000) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Retry] Attempt ${attempt}/${maxRetries} for Gemini API`);
      
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      });
      
      console.log(`[Retry] Success on attempt ${attempt}`);
      return response;
      
    } catch (error) {
      lastError = error;
      
      // Check if it's a rate limit error (429)
      const isRateLimit = error.code === 429 || 
                         (error.message && error.message.includes('quota'));
      
      if (isRateLimit && attempt < maxRetries) {
        // Calculate exponential backoff delay
        const delayMs = initialDelay * Math.pow(2, attempt - 1);
        console.log(`[Retry] Rate limited. Waiting ${delayMs}ms before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // For non-rate-limit errors, don't retry
      if (!isRateLimit) {
        console.log(`[Retry] Non-retryable error:`, error.message);
        throw error;
      }
    }
  }
  
  throw lastError;
}

// Helper: Calculate text similarity for duplicate detection
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

// Helper: Find duplicate complaints in database
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

// Helper: Improved spam detection (fewer false positives)
function quickSpamCheck(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  // First, check if it's a legitimate utility complaint
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
  
  // If it has utility context, only check for obvious spam with links
  if (hasUtilityContext) {
    const hasSuspiciousLink = /https?:\/\/|www\.|bit\.ly|t\.me/i.test(text);
    if (hasSuspiciousLink) {
      return { isSpam: true, reason: 'suspicious link in utility complaint', confidence: 0.75 };
    }
    return { isSpam: false, reason: null, confidence: 0 };
  }
  
  // For non-utility text, check spam indicators
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

// Helper: Translate Amharic to English
async function translateToEnglish(text) {
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
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
  
  if (departments.length === 0) return null;
  
  return departments.map(dept => 
    `- ${dept.code}: ${dept.name} - ${dept.description || 'No description'}`
  ).join('\n');
}

// Main AI moderation function with cache and retry
async function moderateComplaint(title, description, organizationName, organizationId, complaintId = null) {
  try {
    console.log(`[AI] Processing complaint: ${complaintId || 'new'}`);
    
    // Step 1: Check cache first (skip for new complaints without ID)
    const cacheKey = aiCache.generateKey(title, description, organizationId);
    const cachedResult = aiCache.get(cacheKey);
    
    if (cachedResult && complaintId) {
      console.log('[Cache] HIT - Using cached result for similar complaint');
      console.log('[Cache] Cache stats:', aiCache.getStats());
      return cachedResult;
    }
    
    console.log('[Cache] MISS - Will analyze with AI');
    
    // Step 2: Quick spam detection
    const quickSpam = quickSpamCheck(title, description);
    if (quickSpam.isSpam) {
      console.log('[AI] Spam detected:', quickSpam.reason);
      const result = {
        isSpam: true,
        priority: 'Low',
        department: null,
        duplicateOf: null,
        aiConfidence: quickSpam.confidence,
        requiresManualReview: false,
        reasoning: `Marked as spam: ${quickSpam.reason}`,
      };
      aiCache.set(cacheKey, result);
      return result;
    }
    
    // Step 3: Check for duplicates
    let duplicateCheck = { duplicateId: null, similarity: 0 };
    if (complaintId) {
      duplicateCheck = await findDuplicateComplaint(title, description, organizationId, complaintId, 0.6);
      if (duplicateCheck.duplicateId && duplicateCheck.similarity > 0.7) {
        console.log('[AI] Duplicate found:', duplicateCheck.similarity);
        const result = {
          isSpam: false,
          priority: 'Medium',
          department: null,
          duplicateOf: duplicateCheck.duplicateId,
          aiConfidence: 0.8,
          requiresManualReview: true,
          reasoning: `Potential duplicate (${Math.round(duplicateCheck.similarity * 100)}% similar to existing complaint). Manual review recommended.`,
        };
        aiCache.set(cacheKey, result);
        return result;
      }
    }
    
    // Step 4: Translate Amharic if needed
    const hasAmharic = /[\u1200-\u137F]/.test(title + description);
    let finalTitle = title;
    let finalDesc = description;
    
    if (hasAmharic) {
      console.log('[AI] Amharic detected, translating...');
      finalTitle = await translateToEnglish(title);
      finalDesc = await translateToEnglish(description);
    }
    
    // Step 5: Get departments for the organization
    const departmentsList = await getDepartmentsForPrompt(organizationId);
    
    if (!departmentsList) {
      console.log('[AI] No departments found');
      const result = {
        isSpam: false,
        priority: 'Medium',
        department: null,
        duplicateOf: null,
        aiConfidence: 0.3,
        requiresManualReview: true,
        reasoning: 'No departments configured for this organization. Manual review required.',
      };
      aiCache.set(cacheKey, result);
      return result;
    }
    
    // Step 6: AI analysis with retry logic
    const prompt = `You are a complaint classifier for a utility company. Analyze this complaint and return ONLY JSON.

COMPLAINT:
Title: "${finalTitle}"
Description: "${finalDesc}"
Organization: ${organizationName}

DEPARTMENTS available:
${departmentsList}

CLASSIFY using these rules:
1. isSpam: true ONLY if contains promotional links, money offers, or phishing attempts. false for legitimate utility issues.
2. priority: Critical=danger to life/property, High=major disruption (no water/power 12+ hours), Medium=standard issue, Low=minor
3. department: Choose the BEST matching department code from the list. Use null if unclear or spam.
4. aiConfidence: 0.9+ = very clear, 0.8-0.89 = clear, 0.7-0.79 = good, 0.6-0.69 = moderate, below 0.6 = unclear
5. requiresManualReview: true if confidence < 0.7 OR department is null AND not spam
6. reasoning: One short sentence explaining your classification

Return ONLY valid JSON. Example:
{"isSpam": false, "priority": "High", "department": "WATER_SUPPLY", "aiConfidence": 0.85, "requiresManualReview": false, "reasoning": "Area-wide water outage requires urgent attention."}`;

    const response = await callGeminiWithRetry(prompt, 3, 1000);
    
    let raw = response.text;
    console.log('[AI] Raw response received, length:', raw.length);
    
    // Extract JSON
    let jsonStr = raw;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonStr = raw.substring(start, end + 1);
    }
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const result = JSON.parse(jsonStr);
    
    // Build final result
    const finalResult = {
      isSpam: result.isSpam || false,
      priority: result.priority || 'Medium',
      department: result.department || null,
      duplicateOf: duplicateCheck.duplicateId || null,
      aiConfidence: result.aiConfidence || 0.5,
      requiresManualReview: result.requiresManualReview || (result.aiConfidence || 0.5) < 0.7,
      reasoning: result.reasoning || 'AI analysis completed.',
    };
    
    // Validate department exists
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
        finalResult.reasoning = `Department "${finalResult.department}" not found. Manual review needed.`;
      }
    }
    
    // Cache the result
    aiCache.set(cacheKey, finalResult);
    console.log('[Cache] Result cached. Cache size:', aiCache.getStats().size);
    
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

// Optional: Add admin endpoint to clear cache (for testing)
async function clearCache() {
  aiCache.clear();
  console.log('[Cache] Cache cleared manually');
}

// Optional: Get cache stats
function getCacheStats() {
  return aiCache.getStats();
}

module.exports = { 
  moderateComplaint,
  findDuplicateComplaint,
  quickSpamCheck,
  clearCache,
  getCacheStats
};
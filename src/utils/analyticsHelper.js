// ========== BASE STATS HELPERS ==========


 // Get counts and percentage for a query filter

const getStats = async (Complaint, filter) => {
  const total = await Complaint.countDocuments(filter);
  const resolved = await Complaint.countDocuments({ ...filter, status: 'Resolved' });
  const pending = total - resolved;
  const resolvedPercentage = total === 0 ? 0 : Math.round((resolved / total) * 100);
  return { total, resolved, pending, resolvedPercentage };
};


 //Calculate average resolution time in hours
 
const calculateAvgResolutionTime = (complaints) => {
  if (!complaints || complaints.length === 0) return 0;
  const totalHours = complaints.reduce((sum, complaint) => {
    if (complaint.resolvedAt && complaint.createdAt) {
      const hours = (complaint.resolvedAt - complaint.createdAt) / (1000 * 60 * 60);
      return sum + hours;
    }
    return sum;
  }, 0);
  return Math.round(totalHours / complaints.length);
};


 //Get average resolution time for a department
 
const getDeptAvgResolutionTime = async (Complaint, deptId) => {
  const resolved = await Complaint.find({
    department: deptId,
    status: 'Resolved',
    resolvedAt: { $exists: true }
  }).select('createdAt resolvedAt');
  return calculateAvgResolutionTime(resolved);
};



// ========== TRENDS & TIME-BASED HELPERS ==========


 //Get monthly complaint trends (last 6 months)
 
const getMonthlyTrends = async (Complaint, filter = {}) => {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    const count = await Complaint.countDocuments({
      ...filter,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    months.push({
      month: startOfMonth.toLocaleString('default', { month: 'short' }),
      year: startOfMonth.getFullYear(),
      count
    });
  }
  return months;
};


 //Get current month stats (start of month to now)
 
const getCurrentMonthStats = async (Complaint, filter = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const monthFilter = {
    ...filter,
    createdAt: { $gte: startOfMonth }
  };
  
  const total = await Complaint.countDocuments(monthFilter);
  const resolved = await Complaint.countDocuments({ ...monthFilter, status: 'Resolved' });
  const pending = total - resolved;
  
  return {
    month: startOfMonth.toLocaleString('default', { month: 'long' }),
    year: startOfMonth.getFullYear(),
    total,
    resolved,
    pending,
    resolutionRate: total === 0 ? 0 : Math.round((resolved / total) * 100)
  };
};


// Get previous month stats for comparison
 
const getPreviousMonthStats = async (Complaint, filter = {}) => {
  const now = new Date();
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  
  const monthFilter = {
    ...filter,
    createdAt: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth }
  };
  
  const total = await Complaint.countDocuments(monthFilter);
  const resolved = await Complaint.countDocuments({ ...monthFilter, status: 'Resolved' });
  
  return {
    month: startOfPreviousMonth.toLocaleString('default', { month: 'long' }),
    year: startOfPreviousMonth.getFullYear(),
    total,
    resolved,
    resolutionRate: total === 0 ? 0 : Math.round((resolved / total) * 100)
  };
};

// ========== STALE & INACTIVITY HELPERS ==========


 //Get stale complaints (older than X days, not resolved)
 
const getStaleComplaintsCount = async (Complaint, days = 30, filter = {}) => {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - days);
  return await Complaint.countDocuments({
    ...filter,
    status: { $ne: 'Resolved' },
    createdAt: { $lt: staleDate }
  });
};


 // Get inactive department heads
 
const getInactiveDeptHeads = async (User, days = 30, filter = {}) => {
  const inactiveDate = new Date();
  inactiveDate.setDate(inactiveDate.getDate() - days);
  return await User.countDocuments({
    role: 'DeptHead',
    isActive: true,
    ...filter,
    lastLogin: { $lt: inactiveDate }
  });
};

// ========== SLA & PERFORMANCE HELPERS ==========

 // Calculate performance score (0-100)
 
const calculatePerformanceScore = (resolutionRate, avgTimeHours) => {
  const timeScore = Math.min(100, Math.max(0, 100 - (avgTimeHours / 24)));
  return Math.round((resolutionRate * 0.7) + (timeScore * 0.3));
};

/**
 * Calculate SLA compliance for complaints
 * SLA targets: Critical=24h, High=48h, Medium=96h, Low=168h
 */
const calculateSLACompliance = (complaints) => {
  if (!complaints || complaints.length === 0) {
    return {
      overall: 0,
      byPriority: {
        Critical: { compliant: 0, total: 0, percentage: 0, targetHours: 24 },
        High: { compliant: 0, total: 0, percentage: 0, targetHours: 48 },
        Medium: { compliant: 0, total: 0, percentage: 0, targetHours: 96 },
        Low: { compliant: 0, total: 0, percentage: 0, targetHours: 168 }
      }
    };
  }

  const slaTargets = {
    Critical: 24,
    High: 48,
    Medium: 96,
    Low: 168
  };

  const byPriority = {
    Critical: { compliant: 0, total: 0, targetHours: 24 },
    High: { compliant: 0, total: 0, targetHours: 48 },
    Medium: { compliant: 0, total: 0, targetHours: 96 },
    Low: { compliant: 0, total: 0, targetHours: 168 }
  };

  let totalCompliant = 0;
  let totalResolved = 0;

  complaints.forEach(complaint => {
    if (complaint.status === 'Resolved' && complaint.resolvedAt) {
      const priority = complaint.priority || 'Medium';
      const hoursToResolve = (complaint.resolvedAt - complaint.createdAt) / (1000 * 60 * 60);
      const target = slaTargets[priority] || 96;
      
      totalResolved++;
      byPriority[priority].total++;
      
      if (hoursToResolve <= target) {
        totalCompliant++;
        byPriority[priority].compliant++;
      }
    }
  });

  // Calculate percentages
  Object.keys(byPriority).forEach(priority => {
    const data = byPriority[priority];
    data.percentage = data.total === 0 ? 0 : Math.round((data.compliant / data.total) * 100);
  });

  return {
    overall: totalResolved === 0 ? 0 : Math.round((totalCompliant / totalResolved) * 100),
    byPriority,
    totalResolvedComplaints: totalResolved,
    slaCompliantCount: totalCompliant
  };
};


 // Get resolution time breakdown by priority
 
const getResolutionTimeByPriority = async (Complaint, filter = {}) => {
  const resolvedComplaints = await Complaint.find({
    ...filter,
    status: 'Resolved',
    resolvedAt: { $exists: true }
  }).select('createdAt resolvedAt priority');
  
  const byPriority = {
    Critical: [],
    High: [],
    Medium: [],
    Low: []
  };
  
  resolvedComplaints.forEach(complaint => {
    const priority = complaint.priority || 'Medium';
    const hours = (complaint.resolvedAt - complaint.createdAt) / (1000 * 60 * 60);
    if (byPriority[priority]) {
      byPriority[priority].push(hours);
    }
  });
  
  const result = {};
  Object.keys(byPriority).forEach(priority => {
    const times = byPriority[priority];
    result[priority] = {
      count: times.length,
      avgHours: times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      minHours: times.length === 0 ? 0 : Math.round(Math.min(...times)),
      maxHours: times.length === 0 ? 0 : Math.round(Math.max(...times))
    };
  });
  
  return result;
};

// ========== RECOMMENDATION HELPERS ==========


// Generate SysAdmin recommendations
 
const generateSysAdminRecommendations = (organizations, avgResolutionTime, staleComplaints) => {
  const recommendations = [];
  
  const strugglingOrgs = organizations.filter(org => org.resolvedPercentage < 60);
  if (strugglingOrgs.length > 0) {
    recommendations.push({
      type: 'INTERVENTION',
      priority: 'high',
      message: `${strugglingOrgs.length} organization(s) have resolution rate below 60%`,
      organizations: strugglingOrgs.map(org => org.name),
      suggestedAction: 'Schedule performance review meetings with organization heads'
    });
  }
  
  const highStaleOrgs = organizations.filter(org => org.staleComplaints > 30);
  if (highStaleOrgs.length > 0) {
    recommendations.push({
      type: 'BACKLOG_CLEARANCE',
      priority: 'high',
      message: `${highStaleOrgs.length} organization(s) have significant backlog (>30 stale complaints)`,
      organizations: highStaleOrgs.map(org => org.name),
      suggestedAction: 'Escalate and request backlog clearance plan'
    });
  }
  
  if (avgResolutionTime > 96) {
    recommendations.push({
      type: 'PLATFORM_OPTIMIZATION',
      priority: 'medium',
      message: `Average resolution time is ${avgResolutionTime} hours, exceeding target of 72 hours`,
      suggestedAction: 'Review platform workflow efficiency and consider automation opportunities'
    });
  }
  
  if (staleComplaints > 200) {
    recommendations.push({
      type: 'SYSTEM_HEALTH',
      priority: 'critical',
      message: `${staleComplaints} stale complaints platform-wide indicates systemic issue`,
      suggestedAction: 'Conduct platform-wide audit and implement SLA monitoring'
    });
  }
  
  return recommendations;
};


 //Calculate system health score
 
const calculateSystemHealthScore = (totalDepts, deptsWithHeads, activeHeads, totalHeads) => {
  let score = 100;
  
  const missingHeadsRate = totalDepts === 0 ? 0 : ((totalDepts - deptsWithHeads) / totalDepts) * 100;
  score -= missingHeadsRate * 0.3;
  
  const inactiveRate = totalHeads === 0 ? 0 : ((totalHeads - activeHeads) / totalHeads) * 100;
  score -= inactiveRate * 0.2;
  
  return Math.max(0, Math.round(score));
};

module.exports = {
  // Base stats
  getStats,
  calculateAvgResolutionTime,
  getDeptAvgResolutionTime,
  
  
  // Trends
  getMonthlyTrends,
  getCurrentMonthStats,
  getPreviousMonthStats,
  
  // Stale & Inactivity
  getStaleComplaintsCount,
  getInactiveDeptHeads,
  
  // SLA & Performance
  calculatePerformanceScore,
  calculateSLACompliance,
  getResolutionTimeByPriority,
  
  // Recommendations
  generateSysAdminRecommendations,
  calculateSystemHealthScore
};